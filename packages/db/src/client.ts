import postgres from 'postgres';
import { globalSingleton } from './util';

export type DbService = 'api' | 'agent';
export type Sql = postgres.Sql;
/** Query interface shared by the pool and a transaction. */
export type Queryable = postgres.Sql | postgres.TransactionSql;

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
 * prepare:false is required by the transaction pooler; max:1 because each serverless instance handles one request.
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
    prepare: false,
    max: 1,
    idle_timeout: 20,
    transform: { undefined: null },
    connection: { application_name: `cvc-${service}` },
  });
  cache[service] = { url, sql };
  return sql;
}

/** jsonb parameter; null/undefined become SQL NULL. */
export function jsonb(sql: Queryable, value: unknown): postgres.Parameter | null {
  return value === null || value === undefined ? null : sql.json(value as postgres.JSONValue);
}

/** Postgres error code (SQLSTATE) of a postgres.js error, if any. */
export function pgCode(err: unknown): string | null {
  return err instanceof postgres.PostgresError ? err.code : null;
}
