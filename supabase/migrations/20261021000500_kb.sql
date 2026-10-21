-- kb — generated from SYSTEM_DESIGN.md §8.3 block 05 (validated on PG17 + pgvector)
create table kb.documents (
  id           uuid primary key default gen_random_uuid(),
  kind         text not null check (kind in ('case_study','playbook','policy','match_example')),
  title        text not null,
  source_url   text,
  client_id    uuid references analysis.clients(id) on delete set null,
  metadata     jsonb not null default '{}',                 -- industry, objective, year, outcome
  created_by   uuid,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  valid_until  timestamptz
);

create table kb.chunks (
  id            bigint generated always as identity primary key,
  document_id   uuid references kb.documents(id) on delete cascade,
  creator_id    uuid references kol.creators(id) on delete cascade,
  kind          text not null check (kind in ('creator_profile','video_summary','transcript','case_study','playbook','policy','match_example')),
  content       text not null,
  fts_text      text not null,                              -- ตัดคำไทยแล้ว
  fts           tsvector generated always as (to_tsvector('simple', fts_text)) stored,
  embedding     extensions.vector(1536),
  metadata      jsonb not null default '{}',
  content_hash  text not null,
  valid_until   timestamptz,
  created_at    timestamptz not null default now(),
  check (document_id is not null or creator_id is not null),
  constraint chunks_owner_hash_uq unique nulls not distinct (creator_id, document_id, kind, content_hash)
);
create index on kb.chunks using gin (fts);
create index on kb.chunks using hnsw (embedding extensions.vector_cosine_ops);
create index on kb.chunks (creator_id, kind);
create index on kb.chunks (document_id) where document_id is not null;
create index on kb.chunks using gin (metadata jsonb_path_ops);
