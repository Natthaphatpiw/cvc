-- views — generated from SYSTEM_DESIGN.md §8.3 block 08 (validated on PG17 + pgvector)
create or replace view app.v_user_history with (security_barrier) as
  select r.id as run_id, r.owner_id, r.status, r.channel, r.created_at, r.completed_at,
         res.id as result_id, res.brand_name, res.is_partial, res.expires_at, res.version,
         res.result #>> '{brand,logoUrl}' as brand_logo_url,
         (select jsonb_agg(jsonb_build_object('handle', e.x->>'handle', 'avatarUrl', e.x->>'avatarUrl',
                                              'score', e.x #> '{scores,total}') order by e.i)
            from jsonb_array_elements(res.result->'recommendations') with ordinality as e(x, i)
           where e.i <= 3) as top3
  from analysis.runs r left join analysis.results res on res.run_id = r.id;

create or replace view app.v_results_public with (security_barrier) as
  select id as result_id, owner_id, brand_name, schema_version, version, result, created_at, expires_at
  from analysis.results;
