-- analysis_rest — generated from SYSTEM_DESIGN.md §8.3 block 04 (validated on PG17 + pgvector)
create table analysis.run_assets (
  id             uuid primary key default gen_random_uuid(),
  run_id         uuid not null references analysis.runs(id) on delete cascade,
  kind           text not null check (kind in ('screenshot','image','voice','document')),
  blob_pathname  text not null unique,                      -- uploads/{sub}/{uploadId}.{ext} (private store)
  content_type   text not null,
  size_bytes     int not null,
  sha256         text,
  duration_s     numeric(6,1),
  moderation     jsonb,
  extraction     jsonb,                                     -- transcript / vision facts
  status         text not null default 'uploaded' check (status in ('uploaded','processed','rejected','deleted')),
  created_at     timestamptz not null default now(),
  deleted_at     timestamptz
);
create index on analysis.run_assets (run_id);

create table analysis.run_steps (                          -- checkpoint + cost ledger (idempotency)
  id             uuid primary key default gen_random_uuid(),
  run_id         uuid not null references analysis.runs(id) on delete cascade,
  step_key       text not null,                             -- 'llm1.brand' | 'prefetch.facebook' | 'llm2b.batch.3'
  attempt        smallint not null default 1,
  status         text not null check (status in ('running','succeeded','failed','skipped')),
  model          text,
  input_hash     text,
  output         jsonb,
  tokens_in      int,
  tokens_out     int,
  cached_tokens  int,
  cost_usd       numeric(10,4),
  latency_ms     int,
  error          text,
  started_at     timestamptz not null default now(),
  finished_at    timestamptz,
  unique (run_id, step_key, attempt)
);

create table analysis.client_snapshots (                   -- evidence cards จากแหล่งสาธารณะ (แชร์ข้ามผู้ใช้ได้)
  id                 uuid primary key default gen_random_uuid(),
  client_id          uuid not null references analysis.clients(id) on delete cascade,
  source             text not null check (source in ('website','facebook_page','facebook_posts','facebook_ads',
                     'instagram','tiktok','youtube','web_search','pantip')),
  source_url         text,
  provider           text not null,
  raw_blob_pathname  text,                                  -- raw/ (ไม่มี comment payload)
  stats              jsonb not null default '{}',
  evidence_card      jsonb not null,
  content_hash       text not null,
  fetched_at         timestamptz not null default now(),
  expires_at         timestamptz not null
);
create index on analysis.client_snapshots (client_id, source, fetched_at desc);

create table analysis.brand_profiles (
  id                uuid primary key default gen_random_uuid(),
  run_id            uuid not null unique references analysis.runs(id) on delete cascade,
  client_id         uuid references analysis.clients(id) on delete set null,
  schema_version    text not null,
  profile           jsonb not null,
  profile_hash      text not null,
  confidence        numeric(3,2),
  reviewed_by_user  boolean not null default false,
  edited_fields     text[] not null default '{}',
  embedding         extensions.vector(1536),
  created_at        timestamptz not null default now()
);
create index on analysis.brand_profiles (client_id, created_at desc);

create table analysis.evidence (
  id            uuid primary key default gen_random_uuid(),
  run_id        uuid not null references analysis.runs(id) on delete cascade,
  ref           text not null,                              -- 'E1', 'V12'
  source_type   text not null check (source_type in ('website','facebook','facebook_ads','tiktok','youtube','instagram','web_search','pantip','kb')),
  url           text,
  title         text,
  snippet       text,
  snapshot_id   uuid references analysis.client_snapshots(id) on delete set null,
  retrieved_at  timestamptz not null,
  unique (run_id, ref)
);

create table analysis.candidates (
  id                   uuid primary key default gen_random_uuid(),
  run_id               uuid not null references analysis.runs(id) on delete cascade,
  creator_id           uuid not null references kol.creators(id) on delete cascade,
  added_via            text not null default 'pipeline' check (added_via in ('pipeline','chat')),
  discovered_via       text[] not null,
  pre_score            numeric(6,4),
  gate_failures        text[] not null default '{}',
  dossier_snapshot     jsonb,                               -- metrics ณ เวลาประเมิน (reproducible)
  evaluation           jsonb,                               -- KolEvaluation
  suspected_injection  boolean not null default false,
  sub_scores           jsonb,
  missing_features     text[] not null default '{}',
  final_score          numeric(5,2),
  rank                 int,
  rank_stability       numeric(4,3),
  data_confidence      numeric(4,3),
  status               text not null default 'candidate' check (status in ('candidate','excluded','enriched','evaluated','not_evaluated','ranked')),
  created_at           timestamptz not null default now(),
  unique (run_id, creator_id)
);
create index on analysis.candidates (run_id, rank);
create index on analysis.candidates (creator_id);

create table analysis.results (
  id               uuid primary key default gen_random_uuid(),
  run_id           uuid not null unique references analysis.runs(id) on delete cascade,
  owner_id         uuid not null references auth.users(id) on delete cascade,
  schema_version   text not null,
  version          int not null default 1,
  result           jsonb not null,                          -- FinalResult (เวอร์ชันปัจจุบัน)
  brand_name       text not null,
  top_creator_ids  uuid[] not null,
  weights          jsonb not null,
  is_partial       boolean not null default false,
  created_at       timestamptz not null default now(),
  expires_at       timestamptz,                             -- guest: +7d
  constraint results_id_owner_uq unique (id, owner_id)
);
create index on analysis.results (owner_id, created_at desc);
create index on analysis.results (expires_at) where expires_at is not null;

create table analysis.result_versions (
  id          uuid primary key default gen_random_uuid(),
  result_id   uuid not null references analysis.results(id) on delete cascade,
  version     int not null,
  reason      text not null check (reason in ('initial','rescore','relax','curate','chat_add','redaction')),
  weights     jsonb not null,
  result      jsonb not null,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (result_id, version)
);

create table analysis.result_chunks (                      -- Phase 2: RAG ของ chat (transcripts)
  id          bigint generated always as identity primary key,
  result_id   uuid not null references analysis.results(id) on delete cascade,
  creator_id  uuid references kol.creators(id) on delete cascade,
  kind        text not null check (kind in ('dossier','transcript','evidence','brand')),
  content     text not null,
  fts_text    text not null,
  fts         tsvector generated always as (to_tsvector('simple', fts_text)) stored,
  embedding   extensions.vector(1536),
  metadata    jsonb not null default '{}'
);
create index on analysis.result_chunks (result_id);
create index on analysis.result_chunks (creator_id) where creator_id is not null;
create index on analysis.result_chunks using gin (fts);
create index on analysis.result_chunks using hnsw (embedding extensions.vector_cosine_ops);

create table analysis.chat_sessions (                      -- 1 result = 1 active chat; reset/idle = session ใหม่
  id                  uuid primary key default gen_random_uuid(),
  result_id           uuid not null references analysis.results(id) on delete cascade,
  owner_id            uuid not null references auth.users(id) on delete cascade,
  session_no          int not null,
  mastra_thread_id    text not null unique,                 -- 'res_{resultId}_s{sessionNo}'
  mastra_resource_id  text not null,                        -- 'result:{resultId}' (ไม่ผูกกับ user → claim ไม่กระทบ)
  status              text not null default 'active' check (status in ('active','reset','expired')),
  message_count       int not null default 0,
  research_calls      int not null default 0,
  evaluate_calls      int not null default 0,
  created_at          timestamptz not null default now(),
  last_message_at     timestamptz,
  ended_at            timestamptz,
  unique (result_id, session_no)
);
create unique index chat_one_active_per_result on analysis.chat_sessions (result_id) where status = 'active';
create index on analysis.chat_sessions (owner_id);

create table analysis.feedback (
  id          uuid primary key default gen_random_uuid(),
  result_id   uuid not null references analysis.results(id) on delete cascade,
  creator_id  uuid references kol.creators(id) on delete set null,
  user_id     uuid not null references auth.users(id) on delete cascade,
  kind        text not null check (kind in ('thumbs_up','thumbs_down','shortlisted','rejected','contacted','booked')),
  reason      text,
  created_at  timestamptz not null default now()
);
create index on analysis.feedback (result_id);
create index on analysis.feedback (user_id);
