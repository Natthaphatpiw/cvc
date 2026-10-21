-- app — generated from SYSTEM_DESIGN.md §8.3 block 06 (validated on PG17 + pgvector)
create table app.users (                                   -- LINE users (guest ไม่มีแถวนี้)
  id            uuid primary key references auth.users(id) on delete cascade,
  line_user_id  text unique check (line_user_id ~ '^U[0-9a-f]{32}$'),
  display_name  text,
  picture_url   text,
  locale        text not null default 'th',
  role          text not null default 'member' check (role in ('member','planner','admin')),
  is_oa_friend  boolean not null default false,
  push_opt_in   boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  last_seen_at  timestamptz,
  deleted_at    timestamptz
);
create trigger users_touch before update on app.users for each row execute function private.touch_updated_at();

create table app.user_consents (                           -- consent เฉพาะเรื่องที่ไม่บังคับ + การรับทราบ notice
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references app.users(id) on delete cascade,
  consent_type  text not null check (consent_type in ('privacy_notice_ack','push_notification','marketing')),
  version       text not null,
  granted       boolean not null,
  granted_at    timestamptz not null default now(),
  revoked_at    timestamptz,
  ua_hash       text,
  unique (user_id, consent_type, version)
);

create table app.saved_results (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references app.users(id) on delete cascade,
  result_id   uuid not null,
  title       text not null,
  note        text,
  tags        text[] not null default '{}',
  is_pinned   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, result_id),
  constraint saved_results_owner_fk foreign key (result_id, user_id)
    references analysis.results (id, owner_id) on update cascade on delete cascade   -- bookmark ได้เฉพาะ result ของตัวเอง
);
create index on app.saved_results (user_id, is_pinned desc, created_at desc);
create index on app.saved_results (result_id);
create trigger saved_results_touch before update on app.saved_results for each row execute function private.touch_updated_at();

create table app.result_shares (                           -- guest แชร์ไม่ได้
  id          uuid primary key default gen_random_uuid(),
  result_id   uuid not null references analysis.results(id) on delete cascade,
  created_by  uuid not null references app.users(id) on delete cascade,
  token_hash  text not null unique,                         -- sha256(token); token อยู่ในลิงก์เท่านั้น
  expires_at  timestamptz not null,                         -- 7 หรือ 30 วัน
  revoked_at  timestamptz,
  view_count  int not null default 0,
  created_at  timestamptz not null default now()
);
create index on app.result_shares (result_id);
create index on app.result_shares (created_by);

create table app.notifications (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references app.users(id) on delete cascade,
  channel      text not null default 'line_push' check (channel in ('line_push')),
  template     text not null,                               -- 'run_completed' | 'run_failed'
  run_id       uuid,
  status       text not null default 'queued' check (status in ('queued','sent','skipped','failed')),
  skip_reason  text,                                        -- 'not_friend' | 'no_opt_in' | 'quota'
  retry_key    uuid not null default gen_random_uuid(),     -- X-Line-Retry-Key
  error        text,
  created_at   timestamptz not null default now(),
  sent_at      timestamptz
);
create index on app.notifications (user_id, created_at desc);

create table app.audit_log (
  id           bigint generated always as identity primary key,
  actor_id     uuid,
  actor_type   text not null check (actor_type in ('user','service','admin','cron')),
  action       text not null,
  target_type  text,
  target_id    text,
  metadata     jsonb not null default '{}',
  created_at   timestamptz not null default now()
);
