-- ref — generated from SYSTEM_DESIGN.md §8.3 block 01 (validated on PG17 + pgvector)
create table ref.categories (
  id                text primary key,                       -- 'beauty.skincare'
  parent_id         text references ref.categories(id),
  label_th          text not null,
  label_en          text not null,
  tiktok_bc_policy  text not null default 'allowed' check (tiktok_bc_policy in ('allowed','restricted','prohibited')),
  niche_multiplier  numeric(4,2) not null default 1.00
);

create table ref.audience_personas (                       -- รายการ "ลูกค้าที่อยากได้" ให้ผู้ใช้เลือก
  id              text primary key,                         -- 'th_genz_beauty_bkk'
  label_th        text not null,
  label_en        text not null,
  description_th  text,
  icon            text,
  age_dist        jsonb not null,                           -- {"18-24":0.7,"25-34":0.3}
  gender_dist     jsonb not null,                           -- {"female":0.85,"male":0.15}
  region_dist     jsonb,
  interests       text[] not null default '{}',
  category_hints  text[] not null default '{}',
  sort_order      int not null default 0,
  is_active       boolean not null default true,
  updated_at      timestamptz not null default now()
);

create table ref.tier_bands (                              -- ปรับได้ (CVC ใช้ช่วงต่างจาก Clisk)
  tier            text primary key check (tier in ('nano','micro','mid','macro','mega')),
  min_followers   bigint not null,
  max_followers   bigint,                                   -- null = ไม่จำกัด
  sort_order      smallint not null,
  source          text not null default 'clisk_2026'
);

create table ref.tier_benchmarks (                         -- reference distribution เมื่อ DB ยังเล็ก
  id           uuid primary key default gen_random_uuid(),
  tier         text not null references ref.tier_bands(tier),
  category_id  text references ref.categories(id),
  metric       text not null check (metric in ('er_views','median_views','views_per_follower','posts_per_week','cpv_thb')),
  p25          numeric not null,
  p50          numeric not null,
  p75          numeric not null,
  source       text not null,
  updated_at   timestamptz not null default now()
);
create unique index tier_benchmarks_uq on ref.tier_benchmarks (tier, coalesce(category_id, '*'), metric);

create table ref.rate_cards (
  id           uuid primary key default gen_random_uuid(),
  tier         text not null references ref.tier_bands(tier),
  category_id  text references ref.categories(id),          -- null = ทุกหมวด
  format       text not null default 'in_feed' check (format in ('in_feed','live','affiliate','series')),
  fee_min_thb  int not null,
  fee_max_thb  int not null,
  source       text not null,                               -- 'cvc_internal' มีลำดับความสำคัญสูงสุด
  valid_from   date not null default current_date,
  valid_to     date,
  updated_by   uuid,
  updated_at   timestamptz not null default now(),
  constraint rate_cards_fee_ck check (fee_min_thb > 0 and fee_min_thb <= fee_max_thb),
  constraint rate_cards_validity_ck check (valid_to is null or valid_to >= valid_from)
);
create unique index rate_cards_one_open_card on ref.rate_cards (tier, coalesce(category_id, '*'), format, source) where valid_to is null;

create table ref.blocklist (
  id           uuid primary key default gen_random_uuid(),
  entity_type  text not null check (entity_type in ('creator','keyword','brand')),
  value        text not null,                               -- creator: platform_user_id หรือ handle (lowercase)
  reason       text not null,
  created_by   uuid,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz,
  unique (entity_type, value)
);
