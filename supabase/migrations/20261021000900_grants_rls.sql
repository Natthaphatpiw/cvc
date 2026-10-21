-- grants_rls — generated from SYSTEM_DESIGN.md §8.3 block 09 (validated on PG17 + pgvector)
grant usage on schema extensions to svc_api, svc_agent;
grant usage on schema app, ref to svc_api;
grant usage on schema analysis, kol, kb, ref, private, app to svc_agent;
grant usage, create on schema mastra to svc_agent;                      -- PostgresStore สร้างตารางเอง

grant select, insert, update, delete on all tables in schema app, ref to svc_api;
grant select, insert, update, delete on all tables in schema analysis, kol, kb to svc_agent;
grant select on all tables in schema ref to svc_agent;
grant select (id, role, line_user_id, is_oa_friend, push_opt_in, deleted_at) on app.users to svc_agent;
grant select on app.v_user_history, app.v_results_public to svc_api;
grant execute on function kol.match_creators(text, extensions.vector, int, bigint, bigint, int, float, float, int, uuid[]) to svc_agent;
grant execute on function private.claim_runs(uuid, jsonb) to svc_agent;
grant execute on function private.scrub_creator(uuid, text), private.strip_creator(jsonb, text, text) to svc_agent;
alter default privileges in schema app, ref grant select, insert, update, delete on tables to svc_api;
alter default privileges in schema analysis, kol, kb grant select, insert, update, delete on tables to svc_agent;

do $$ declare t record; begin
  for t in select schemaname, tablename from pg_tables where schemaname in ('app','ref','analysis','kol','kb') loop
    execute format('alter table %I.%I enable row level security', t.schemaname, t.tablename);
    if t.schemaname in ('app','ref') then
      execute format('create policy svc_api_rw on %I.%I for all to svc_api using (true) with check (true)', t.schemaname, t.tablename);
    end if;
    if t.schemaname = 'ref' then
      execute format('create policy svc_agent_read on %I.%I for select to svc_agent using (true)', t.schemaname, t.tablename);
    end if;
    if t.schemaname in ('analysis','kol','kb') then
      execute format('create policy svc_agent_rw on %I.%I for all to svc_agent using (true) with check (true)', t.schemaname, t.tablename);
    end if;
  end loop;
end $$;
create policy svc_agent_read on app.users for select to svc_agent using (true);

-- defense-in-depth สำหรับ PostgREST (frontend ไม่ได้ใช้)
grant usage on schema app, analysis to authenticated;
grant select on app.saved_results, analysis.results to authenticated;
create policy own_saved_read  on app.saved_results for select to authenticated using ((select auth.uid()) = user_id);
create policy own_result_read on analysis.results  for select to authenticated using ((select auth.uid()) = owner_id);
