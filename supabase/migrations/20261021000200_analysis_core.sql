-- analysis_core — generated from SYSTEM_DESIGN.md §8.3 block 02 (validated on PG17 + pgvector)
create table analysis.clients (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  name_th           text,
  canonical_site    text,                                   -- host หรือ host + path segment แรก (shared hosts)
  facebook_page_id  text unique,
  tiktok_handle     text,
  industry_id       text references ref.categories(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create unique index clients_site_uq on analysis.clients (canonical_site) where canonical_site is not null;

create table analysis.runs (
  id                 uuid primary key default gen_random_uuid(),
  owner_id           uuid not null references auth.users(id) on delete cascade,
  owner_type         text not null check (owner_type in ('guest','line')),
  channel            text not null check (channel in ('web','liff')),
  parent_run_id      uuid references analysis.runs(id) on delete set null,     -- "ลองใหม่"
  status             text not null default 'queued' check (status in
                     ('queued','normalizing','prefetching','researching_brand','awaiting_review','discovering',
                      'evaluating','ranking','curating','completed','partial','failed','cancelled')),
  stage              text,
  progress_pct       smallint not null default 0 check (progress_pct between 0 and 100),
  workflow_run_id    text unique,
  input_hash         text not null,                         -- sha256(owner ‖ canonical input ‖ pipeline version)
  claim_secret_hash  text,                                  -- guest เท่านั้น: sha256(claimSecret)
  notice_version     text not null,                         -- privacy notice ที่ผู้ใช้รับทราบ
  raw_input          jsonb not null,                        -- RunInput (ไม่มี binary)
  normalized_input   jsonb,                                 -- InputBrief
  objective          text,
  pipeline_version   text not null,
  prompt_version     text not null,
  model_config       jsonb not null default '{}',
  warnings           text[] not null default '{}',
  error_code         text,
  error_message      text,
  tokens_in          int not null default 0,
  tokens_out         int not null default 0,
  tool_calls         int not null default 0,
  cost_usd           numeric(10,4) not null default 0,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  started_at         timestamptz,
  completed_at       timestamptz,
  expires_at         timestamptz                            -- guest: now()+7d · line: null
);
create index on analysis.runs (owner_id, created_at desc);
create index on analysis.runs (owner_id, input_hash, created_at desc);
create index on analysis.runs (expires_at) where expires_at is not null;
create index runs_inflight_idx on analysis.runs (updated_at) where status not in ('completed','partial','failed','cancelled');
create trigger runs_touch before update on analysis.runs for each row execute function private.touch_updated_at();
