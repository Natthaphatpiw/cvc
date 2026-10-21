// Applies supabase/migrations/*.sql in order on an in-memory Postgres (PGlite + pgvector) and runs smoke checks.
// Supabase-provided objects (auth schema, auth.uid(), anon/authenticated roles, extensions schema) are stubbed.
// Usage: npm run db:test
import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite-pgvector';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import fs from 'node:fs';
import path from 'node:path';

const MIGRATIONS_DIR = path.resolve(import.meta.dirname, '../supabase/migrations');

const SUPABASE_STUBS = `
create schema auth;
create table auth.users (id uuid primary key, is_anonymous boolean not null default false);
create schema extensions;
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to public;
grant execute on function auth.uid() to public;
grant usage on schema extensions to public;
`;

// Split SQL into statements, respecting quotes, dollar quotes and comments.
function splitSql(text) {
  const out = [];
  let cur = '';
  let i = 0;
  let dollar = null;
  while (i < text.length) {
    const ch = text[i];
    const two = text.slice(i, i + 2);
    if (dollar) {
      if (text.startsWith(dollar, i)) { cur += dollar; i += dollar.length; dollar = null; continue; }
      cur += ch; i++; continue;
    }
    if (two === '--') { const j = text.indexOf('\n', i); const end = j === -1 ? text.length : j; cur += text.slice(i, end); i = end; continue; }
    if (two === '/*') { const j = text.indexOf('*/', i); cur += text.slice(i, j + 2); i = j + 2; continue; }
    if (ch === "'") {
      let j = i + 1;
      while (j < text.length) { if (text[j] === "'" && text[j + 1] === "'") { j += 2; continue; } if (text[j] === "'") break; j++; }
      cur += text.slice(i, j + 1); i = j + 1; continue;
    }
    if (ch === '$') { const m = /^\$[A-Za-z_]*\$/.exec(text.slice(i)); if (m) { dollar = m[0]; cur += dollar; i += dollar.length; continue; } }
    if (ch === ';') { if (cur.replace(/--[^\n]*/g, '').trim()) out.push(cur.trim()); cur = ''; i++; continue; }
    cur += ch; i++;
  }
  if (cur.replace(/--[^\n]*/g, '').trim()) out.push(cur.trim());
  return out;
}

const label = (stmt) => stmt.replace(/--[^\n]*/g, '').replace(/\s+/g, ' ').trim().slice(0, 110);

const db = new PGlite({ extensions: { vector, pg_trgm } });
await db.exec(SUPABASE_STUBS);

const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
const errors = [];
let statements = 0;
for (const file of files) {
  const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
  for (const stmt of splitSql(sql)) {
    statements++;
    try { await db.exec(stmt); } catch (e) { errors.push(`${file}: ${label(stmt)}\n    ${e.message}`); }
  }
}

const checks = [];
async function check(name, sql, expect, role) {
  try {
    if (role) await db.exec(`set role ${role}`);
    const { rows } = await db.query(sql);
    const got = rows[0] ? Object.values(rows[0])[0] : undefined;
    const ok = typeof expect === 'function' ? expect(got) : String(got) === String(expect);
    checks.push({ name, ok, got });
  } catch (e) {
    const ok = typeof expect === 'function' && expect(e.message);
    checks.push({ name, ok, got: e.message });
  } finally {
    if (role) await db.exec('reset role');
  }
}

await check('tier bands seeded', 'select count(*)::int from ref.tier_bands', 5);
await check('categories seeded', 'select count(*)::int from ref.categories', (n) => n >= 20);
await check('restricted categories present', `select count(*)::int from ref.categories where tiktok_bc_policy = 'restricted'`, (n) => n >= 3);
await check('personas seeded', 'select count(*)::int from ref.audience_personas', 14);
await check('rate cards seeded', 'select count(*)::int from ref.rate_cards', 5);
await check('kpi benchmarks seeded', 'select count(*)::int from ref.kpi_benchmarks', 5);
await check('avatar columns exist', `select count(*)::int from information_schema.columns
  where (table_schema, table_name, column_name) in (('kol','creators','avatar_source_url'),('kol','creators','avatar_cached_at'),('kol','creator_videos','cover_source_url'))`, 3);
await check('every table has RLS enabled', `select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where c.relkind in ('r','p') and n.nspname in ('ref','analysis','kol','kb','app') and not c.relrowsecurity
  and not c.relispartition`, 0);
await check('svc_agent can read kpi benchmarks', 'select count(*)::int from ref.kpi_benchmarks', 5, 'svc_agent');
await check('svc_api can read personas', 'select count(*)::int from ref.audience_personas', 14, 'svc_api');
// No function may bake an extension GUC into its definition: on Supabase migrations run as a non-superuser and
// `create function ... set hnsw.*` fails with "permission denied to set parameter" (42501).
await check('no function-level SET of hnsw.* parameters', `select count(*)::int from pg_proc p
  where exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'hnsw.%')`, 0);
await check('match_creators runs as svc_agent and sets iterative scan for the transaction',
  `select current_setting('hnsw.iterative_scan', true) from (
     select count(*) from kol.match_creators('ทดสอบ', array_fill(0, array[1536])::real[]::extensions.vector, 10)) t`,
  'relaxed_order', 'svc_agent');
await check('svc_agent cannot write rate cards',
  `insert into ref.rate_cards (tier, format, fee_min_thb, fee_max_thb, source) values ('nano','live',1,2,'x') returning 1`,
  (v) => typeof v === 'string' && /permission denied/.test(v), 'svc_agent');
await check('svc_agent can record campaign outcomes',
  `insert into analysis.campaign_outcomes (objective, tier, views) values ('awareness','micro',12000) returning 1`, 1, 'svc_agent');

const failed = checks.filter((c) => !c.ok);
console.log(`migrations: ${files.length} files, ${statements} statements, ${errors.length} errors`);
for (const e of errors) console.log(`  ERROR ${e}`);
for (const c of checks) console.log(`  ${c.ok ? 'ok  ' : 'FAIL'} ${c.name}${c.ok ? '' : ` (got ${c.got})`}`);
process.exit(errors.length || failed.length ? 1 : 0);
