-- foundation — generated from SYSTEM_DESIGN.md §8.3 block 00 (validated on PG17 + pgvector)
create extension if not exists vector  with schema extensions;
create extension if not exists pg_trgm with schema extensions;

create schema if not exists ref;
create schema if not exists analysis;
create schema if not exists kol;
create schema if not exists kb;
create schema if not exists app;
create schema if not exists private;
create schema if not exists mastra;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'svc_api')   then create role svc_api   login noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'svc_agent') then create role svc_agent login noinherit; end if;
end $$;
-- ตั้งรหัสผ่านนอก migration: alter role svc_agent password '<secret>';  (เก็บใน Vercel env ของ service นั้นเท่านั้น)

create or replace function private.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at := now(); return new; end $$;
