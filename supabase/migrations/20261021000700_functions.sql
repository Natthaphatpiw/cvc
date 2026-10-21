-- functions — generated from SYSTEM_DESIGN.md §8.3 block 07 (validated on PG17 + pgvector)
create or replace function kol.match_creators(
  query_tsquery text, query_embedding extensions.vector(1536), match_count int default 100,
  min_followers bigint default null, max_followers bigint default null, active_days int default 30,
  full_text_weight float default 1.0, semantic_weight float default 1.0, rrf_k int default 50,
  exclude_ids uuid[] default '{}'
) returns table (creator_id uuid, score float, max_similarity float)
language sql volatile set search_path = '' as $$
  -- pgvector iterative HNSW scan, set per transaction at run time: a function-level SET on hnsw.* needs superuser
  -- on Supabase when the vector library is not loaded yet in the migration session.
  select set_config('hnsw.iterative_scan', 'relaxed_order', true), set_config('hnsw.ef_search', '200', true);
  with eligible as (
    select c.id from kol.creators c
    where c.country_code = 'TH' and not c.opted_out and not c.is_blocked and not c.possible_minor
      and (min_followers is null or c.follower_count >= min_followers)
      and (max_followers is null or c.follower_count <= max_followers)
      and c.last_posted_at >= now() - make_interval(days => active_days)
      and c.id <> all (exclude_ids)
      and not exists (select 1 from ref.blocklist b
                      where b.entity_type = 'creator' and b.value in (c.platform_user_id, lower(c.handle))
                        and (b.expires_at is null or b.expires_at > now()))
      and not exists (select 1 from kol.creator_optouts o
                      where o.handle_hash = encode(sha256(convert_to(lower(c.handle), 'UTF8')), 'hex')
                         or o.platform_user_id_hash = encode(sha256(convert_to(c.platform_user_id, 'UTF8')), 'hex'))),
  ft as (
    select k.creator_id, row_number() over (order by max(ts_rank_cd(k.fts, to_tsquery('simple', query_tsquery))) desc) as r
    from kb.chunks k join eligible e on e.id = k.creator_id
    where k.kind in ('creator_profile','video_summary','transcript')
      and (k.valid_until is null or k.valid_until > now())
      and k.fts @@ to_tsquery('simple', query_tsquery)
    group by k.creator_id order by r limit match_count * 2),
  sem_chunks as materialized (
    select k.creator_id, k.embedding operator(extensions.<=>) query_embedding as dist
    from kb.chunks k join eligible e on e.id = k.creator_id
    where k.kind in ('creator_profile','video_summary','transcript')
      and (k.valid_until is null or k.valid_until > now())
    order by dist limit match_count * 40),
  sem as (
    select s.creator_id, min(s.dist) as dist, row_number() over (order by min(s.dist)) as r
    from sem_chunks s group by s.creator_id order by r limit match_count * 2)
  select coalesce(ft.creator_id, sem.creator_id),
         coalesce(1.0 / (rrf_k + ft.r), 0) * full_text_weight + coalesce(1.0 / (rrf_k + sem.r), 0) * semantic_weight,
         1 - sem.dist
  from ft full outer join sem on ft.creator_id = sem.creator_id
  order by 2 desc, 1 limit match_count;
$$;

-- guest → LINE: ย้ายเฉพาะ run ที่เจ้าของเป็น anonymous และ claim secret ตรง
create or replace function private.claim_runs(p_user uuid, p_items jsonb) returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if not exists (select 1 from auth.users where id = p_user and not is_anonymous) then
    raise exception 'claim target must be a non-anonymous user' using errcode = '22023';
  end if;
  with c as (
    select r.id from analysis.runs r
    join jsonb_to_recordset(p_items) as x(run_id uuid, secret_hash text)
      on r.id = x.run_id and r.claim_secret_hash = x.secret_hash
    join auth.users u on u.id = r.owner_id and u.is_anonymous
  ), ur as (
    update analysis.runs r set owner_id = p_user, owner_type = 'line', expires_at = null, claim_secret_hash = null
    from c where r.id = c.id returning r.id
  ), us as (
    update analysis.results s set owner_id = p_user, expires_at = null from ur where s.run_id = ur.id returning s.id
  ), uc as (
    update analysis.chat_sessions cs set owner_id = p_user from us where cs.result_id = us.id returning 1
  ), uf as (
    update analysis.feedback f set user_id = p_user from us where f.result_id = us.id returning 1
  )
  select count(*) into n from ur;
  return n;
end $$;
revoke all on function private.claim_runs(uuid, jsonb) from public;

-- creator opt-out: ตัด KOL ออกจากทุก FinalResult (recommendations / addedFromChat / alternatives)
create or replace function private.strip_creator(p_doc jsonb, p_cid text, p_handle text) returns jsonb
language sql immutable set search_path = '' as $$
  select p_doc
    || jsonb_build_object('recommendations', coalesce((select jsonb_agg(x order by i)
         from jsonb_array_elements(coalesce(p_doc->'recommendations', '[]'::jsonb)) with ordinality t(x, i)
         where x->>'creatorId' is distinct from p_cid), '[]'::jsonb))
    || jsonb_build_object('addedFromChat', coalesce((select jsonb_agg(x order by i)
         from jsonb_array_elements(coalesce(p_doc->'addedFromChat', '[]'::jsonb)) with ordinality t(x, i)
         where x->>'creatorId' is distinct from p_cid), '[]'::jsonb))
    || jsonb_build_object('alternatives', coalesce((select jsonb_agg(x order by i)
         from jsonb_array_elements(coalesce(p_doc->'alternatives', '[]'::jsonb)) with ordinality t(x, i)
         where x->>'creatorId' is distinct from p_cid and x->>'handle' is distinct from p_handle), '[]'::jsonb))
    || jsonb_build_object('redactedCreators', coalesce((p_doc->>'redactedCreators')::int, 0) + 1)
$$;

-- opt-out scrub (ทันที, ใน transaction เดียว): hash suppression → ลบจาก result ทุกเวอร์ชัน → ลบแถว creator (cascade)
create or replace function private.scrub_creator(p_creator uuid, p_verified_via text) returns int
language plpgsql security definer set search_path = '' as $$
declare v_handle text; v_uid text; n int;
begin
  select handle, platform_user_id into v_handle, v_uid from kol.creators where id = p_creator;
  if v_uid is null then return 0; end if;
  insert into kol.creator_optouts (handle_hash, platform_user_id_hash, verified_via)
    values (encode(sha256(convert_to(lower(v_handle), 'UTF8')), 'hex'),
            encode(sha256(convert_to(v_uid, 'UTF8')), 'hex'), p_verified_via)
    on conflict do nothing;
  update analysis.results r
     set result = private.strip_creator(r.result, p_creator::text, v_handle),
         top_creator_ids = array_remove(r.top_creator_ids, p_creator)
   where p_creator = any (r.top_creator_ids) or strpos(r.result::text, p_creator::text) > 0;
  get diagnostics n = row_count;
  update analysis.result_versions v
     set result = private.strip_creator(v.result, p_creator::text, v_handle)
   where strpos(v.result::text, p_creator::text) > 0;
  delete from kol.creators where id = p_creator;   -- cascade: videos, snapshots, audience, collabs, kb.chunks, candidates, result_chunks
  return n;
end $$;
revoke all on function private.scrub_creator(uuid, text) from public;
revoke all on function private.strip_creator(jsonb, text, text) from public;
