import postgres from 'postgres';
import { globalSingleton } from './util';

export type DbService = 'api' | 'agent';
export type Sql = postgres.Sql;
/** Query interface shared by the pool and a transaction. */
export type Queryable = postgres.Sql | postgres.TransactionSql | postgres.ReservedSql;
/** The connection a transaction() callback runs its queries on. */
export type TxSql = postgres.ReservedSql;

const ENV_KEY: Record<DbService, 'API_DATABASE_URL' | 'AGENT_DATABASE_URL'> = {
  api: 'API_DATABASE_URL',
  agent: 'AGENT_DATABASE_URL',
};

export function databaseUrl(service: DbService): string | null {
  const v = process.env[ENV_KEY[service]]?.trim();
  return v ? v : null;
}

export function isDbConfigured(service: DbService): boolean {
  return databaseUrl(service) !== null;
}

type SqlCache = Partial<Record<DbService, { url: string; sql: Sql }>>;

const LOCAL_HOSTS = new Set(['', 'localhost', '127.0.0.1', '::1', '[::1]']);

/**
 * TLS for every non-local server. postgres.js defaults to plaintext and an explicit ssl option overrides the URL,
 * so a URL that picks its own mode (sslmode, ssl, sslrootcert=system) is left to postgres.js.
 */
export function sslOption(url: string): 'require' | undefined {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return 'require';
  }
  const q = parsed.searchParams;
  if (q.has('sslmode') || q.has('ssl') || q.get('sslrootcert') === 'system') return undefined;
  return LOCAL_HOSTS.has(parsed.hostname.toLowerCase()) ? undefined : 'require';
}

/**
 * One postgres.js client per service and process (svc_api / svc_agent role via the Supavisor transaction pooler).
 * prepare:false is required by the transaction pooler. max_pipeline:0 sends a query only after the previous one on the
 * connection finished: postgres.js otherwise pipelines behind a query without parameters, and the transaction pooler
 * hands the backend back after the first reply, so the next query hangs (backend left in ClientRead) or gets another
 * query's rows. sql.begin() does not work with it, so transactions go through transaction() below. max:4 because a
 * Fluid compute instance serves several requests at once, which would otherwise wait on one connection.
 */
export function getSql(service: DbService): Sql {
  const url = databaseUrl(service);
  if (!url) throw new Error(`${ENV_KEY[service]} is not set`);
  const cache = globalSingleton<SqlCache>('cvc.db.sql', () => ({}));
  const hit = cache[service];
  if (hit && hit.url === url) return hit.sql;
  const ssl = sslOption(url);
  const sql = postgres(url, {
    // only set when defined: even `ssl: undefined` would override the URL's sslmode
    ...(ssl ? { ssl } : {}),
    // postgres.js reads max_pipeline but its type definitions leave it out
    ...{ max_pipeline: 0 },
    prepare: false,
    max: 4,
    idle_timeout: 20,
    transform: { undefined: null },
    connection: { application_name: `cvc-${service}` },
  });
  cache[service] = { url, sql };
  return sql;
}

/** postgres.js errors raised when the connection itself closed, ended or never opened. */
function isConnectionError(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === 'string' && /^CONNECT(ION)?_/.test(code);
}

/**
 * Runs fn in one transaction on a reserved connection; use it instead of sql.begin(), which never gets its connection
 * with max_pipeline:0 (postgres.js 3.4.9 hands it over only on the pipelining path, porsager/postgres#1189).
 * Commits when fn resolves, rolls back when it throws.
 */
export async function transaction<T>(sql: Sql, fn: (tx: TxSql) => Promise<T>): Promise<T> {
  const tx = await sql.reserve();
  // A closed connection has already left the reservation; releasing it would put a dead connection back in the pool.
  let release = true;
  try {
    await tx`begin`;
    const result = await fn(tx);
    await tx`commit`;
    return result;
  } catch (err) {
    if (isConnectionError(err)) {
      release = false;
    } else {
      await tx`rollback`.catch((e: unknown) => {
        if (isConnectionError(e)) release = false;
      });
    }
    throw err;
  } finally {
    if (release) tx.release();
  }
}

/** jsonb parameter; null/undefined become SQL NULL. */
export function jsonb(sql: Queryable, value: unknown): postgres.Parameter | null {
  return value === null || value === undefined ? null : sql.json(value as postgres.JSONValue);
}

/** Postgres error code (SQLSTATE) of a postgres.js error, if any. */
export function pgCode(err: unknown): string | null {
  return err instanceof postgres.PostgresError ? err.code : null;
}
