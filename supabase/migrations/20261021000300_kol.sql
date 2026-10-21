-- kol — generated from SYSTEM_DESIGN.md §8.3 block 03 (validated on PG17 + pgvector)
create table kol.creators (
  id                   uuid primary key default gen_random_uuid(),
  platform             text not null default 'tiktok' check (platform in ('tiktok')),
  platform_user_id     text not null,                       -- key หลัก (handle เปลี่ยน/ถูกใช้ซ้ำได้)
  handle               text not null,                       -- ไม่มี '@'
  display_name         text,
  bio                  text,
  bio_link             text,
  avatar_url           text,                                -- public blob: creator-media/avatars/{id}.webp
  is_verified          boolean,
  country_code         text,
  country_confidence   numeric(3,2),
  primary_language     text,
  is_shop_seller       boolean,
  is_commerce_user     boolean,
  tcm_id               text,                                -- จาก TTO API อย่างเป็นทางการเท่านั้น
  follower_count       bigint,
  following_count      bigint,
  likes_count          bigint,
  video_count          int,
  tier                 text references ref.tier_bands(tier),-- app คำนวณจาก ref.tier_bands ตอน upsert
  categories           text[] not null default '{}',
  tone_tags            text[] not null default '{}',
  profile_card_th      text,
  median_views_20      bigint,
  er_views_median_20   numeric(6,4),
  posts_per_week       numeric(5,2),
  last_posted_at       timestamptz,
  sponsored_share_30   numeric(4,3),
  authenticity_score   numeric(4,3),
  suitability_tier     text check (suitability_tier in ('low','medium','high')),
  data_sources         text[] not null default '{}',
  refresh_priority     smallint not null default 5,
  first_seen_at        timestamptz not null default now(),
  last_refreshed_at    timestamptz,
  opted_out            boolean not null default false,
  possible_minor       boolean not null default false,
  is_blocked           boolean not null default false,
  unique (platform, platform_user_id),
  unique (platform, handle)                                 -- ถ้า handle ย้ายเจ้าของ: เปลี่ยน handle แถวเก่าเป็น '__released_' || id ก่อน upsert
);
create index on kol.creators (country_code, tier, last_posted_at desc);
create index on kol.creators using gin (categories);
create index on kol.creators using gin (handle extensions.gin_trgm_ops);

create table kol.creator_snapshots (
  id                  bigint generated always as identity primary key,
  creator_id          uuid not null references kol.creators(id) on delete cascade,
  captured_at         timestamptz not null default now(),
  follower_count      bigint,
  likes_count         bigint,
  video_count         int,
  median_views_20     bigint,
  er_views_median_20  numeric(6,4),
  source              text not null
);
create index on kol.creator_snapshots (creator_id, captured_at desc);

create table kol.creator_videos (
  id                  uuid primary key default gen_random_uuid(),
  creator_id          uuid not null references kol.creators(id) on delete cascade,
  platform_video_id   text not null unique,
  url                 text not null,
  posted_at           timestamptz,
  caption             text,
  hashtags            text[] not null default '{}',
  duration_s          int,
  views bigint, likes bigint, comments bigint, shares bigint, saves bigint,
  is_sponsored        boolean,
  is_ad               boolean,
  has_shop_product    boolean,
  location_created    text,
  text_language       text,
  transcript_summary  text,                                 -- phase 2
  cover_url           text,                                 -- public blob: creator-media/covers/{id}.webp
  captured_at         timestamptz not null default now()
);
create index on kol.creator_videos (creator_id, posted_at desc);

create table kol.creator_audience (
  id                  uuid primary key default gen_random_uuid(),
  creator_id          uuid not null references kol.creators(id) on delete cascade,
  source              text not null check (source in ('heuristic_comments','heuristic_content','vendor_modeled','tto_authorized','accounts_api','media_kit')),
  country_dist        jsonb,
  age_dist            jsonb,
  gender_dist         jsonb,
  region_dist         jsonb,
  thai_comment_share  numeric(4,3),
  sample_size         int,
  ci95_low            numeric(4,3),
  ci95_high           numeric(4,3),
  confidence          text not null check (confidence in ('low','medium','high')),
  captured_at         timestamptz not null default now()
);
create index on kol.creator_audience (creator_id, captured_at desc);

create table kol.creator_collabs (
  id            uuid primary key default gen_random_uuid(),
  creator_id    uuid not null references kol.creators(id) on delete cascade,
  brand_name    text not null,
  client_id     uuid references analysis.clients(id) on delete set null,
  video_id      uuid references kol.creator_videos(id) on delete set null,
  detected_via  text not null check (detected_via in ('paid_label','hashtag','caption_mention','agency_record')),
  detected_at   timestamptz not null default now()
);
create index on kol.creator_collabs (creator_id, detected_at desc);

create table kol.creator_optouts (                         -- suppression list ถาวร (hash เท่านั้น)
  id                     uuid primary key default gen_random_uuid(),
  platform               text not null default 'tiktok',
  handle_hash            text not null unique,              -- sha256(lower(handle))
  platform_user_id_hash  text unique,                       -- sha256(platform_user_id)
  reason                 text,
  verified_via           text check (verified_via in ('bio_code','admin_manual','creator_oauth')),
  requested_at           timestamptz not null default now()
);

create table kol.optout_requests (                         -- คำขอที่รอยืนยัน (ข้อมูลติดต่อลบ 30 วันหลังปิดเรื่อง)
  id            uuid primary key default gen_random_uuid(),
  handle        text not null,
  code_hash     text not null,                            -- sha256 ของรหัสที่ให้ใส่ใน bio
  contact_enc   text,                                     -- เข้ารหัสฝั่ง app (option)
  reason        text,
  status        text not null default 'pending' check (status in ('pending','verified','rejected','expired')),
  expires_at    timestamptz not null default now() + interval '7 days',
  created_at    timestamptz not null default now(),
  closed_at     timestamptz
);
create index on kol.optout_requests (status, created_at desc);

create table kol.provider_jobs (                           -- ledger ของ job ภายนอก (webhook lookup + ต้นทุน)
  id               uuid primary key default gen_random_uuid(),
  provider         text not null,
  job_type         text not null,                           -- 'tiktok_search' | 'comments' | 'refresh_batch' | 'fb_page'
  run_id           uuid references analysis.runs(id) on delete set null,
  external_run_id  text,
  hook_token       text,                                    -- workflow hook token (ห้าม PII; ใช้ครั้งเดียว)
  status           text not null check (status in ('started','succeeded','failed','timeout')),
  items            int,
  cost_usd         numeric(10,4),
  started_at       timestamptz not null default now(),
  finished_at      timestamptz,
  error            text
);
create unique index provider_jobs_ext_uq on kol.provider_jobs (provider, external_run_id) where external_run_id is not null;
create index on kol.provider_jobs (run_id);
