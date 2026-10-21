-- review_fixes — follow-ups to 0800 views / 0900 grants_rls

-- grants_rls granted DML on "all tables in schema app", which includes these views. v_results_public is
-- auto-updatable and its base-table checks run as the view owner, so DML through it would bypass RLS on
-- analysis.results. Both views are read-only for the api.
revoke insert, update, delete on app.v_user_history, app.v_results_public from svc_api;

-- brand_name falls back to the submitted company name while a run has no result yet (queued, running, failed,
-- cancelled). Same columns in the same order as 0800 so "create or replace" keeps the view and its grants.
create or replace view app.v_user_history with (security_barrier) as
  select r.id as run_id, r.owner_id, r.status, r.channel, r.created_at, r.completed_at,
         res.id as result_id, coalesce(res.brand_name, r.raw_input->>'companyName') as brand_name,
         res.is_partial, res.expires_at, res.version,
         res.result #>> '{brand,logoUrl}' as brand_logo_url,
         (select jsonb_agg(jsonb_build_object('handle', e.x->>'handle', 'avatarUrl', e.x->>'avatarUrl',
                                              'score', e.x #> '{scores,total}') order by e.i)
            from jsonb_array_elements(res.result->'recommendations') with ordinality as e(x, i)
           where e.i <= 3) as top3
  from analysis.runs r left join analysis.results res on res.run_id = r.id;

grant select on app.v_user_history, app.v_results_public to svc_api;
