-- consultant layer — expected-KPI benchmarks, avatar cache metadata, agency campaign outcomes
-- New tables get their RLS policies and grants here (the loop in grants_rls only covered tables that existed then).

alter table kol.creators add column if not exists avatar_source_url text;
alter table kol.creators add column if not exists avatar_cached_at timestamptz;
alter table kol.creator_videos add column if not exists cover_source_url text;

-- Benchmarks used when a creator's own history is too thin, and the conversion assumptions (CTR/CVR).
-- Every row names its source; 'assumption_to_calibrate' rows must be replaced with Convert Cake's own campaign data.
create table ref.kpi_benchmarks (
  id           uuid primary key default gen_random_uuid(),
  objective    text check (objective in ('awareness','launch','conversion','tiktok_shop','brand_building','ugc')),  -- null = all objectives
  category_id  text references ref.categories(id),                                                                   -- null = all categories
  tier         text references ref.tier_bands(tier),                                                                 -- null = all tiers
  metric       text not null check (metric in ('sponsored_view_factor','ctr','cvr','er_views')),
  p25          numeric not null,
  p50          numeric not null,
  p75          numeric not null,
  source       text not null,
  note_th      text,
  updated_at   timestamptz not null default now(),
  constraint kpi_benchmarks_order_ck check (p25 <= p50 and p50 <= p75)
);
create unique index kpi_benchmarks_uq
  on ref.kpi_benchmarks (coalesce(objective, '*'), coalesce(category_id, '*'), coalesce(tier, '*'), metric, source);

alter table ref.kpi_benchmarks enable row level security;
create policy svc_api_rw on ref.kpi_benchmarks for all to svc_api using (true) with check (true);
create policy svc_agent_read on ref.kpi_benchmarks for select to svc_agent using (true);
grant select, insert, update, delete on ref.kpi_benchmarks to svc_api;
grant select on ref.kpi_benchmarks to svc_agent;

-- What actually happened after a campaign (entered by planners) — the data that calibrates expected KPIs over time.
create table analysis.campaign_outcomes (
  id           uuid primary key default gen_random_uuid(),
  result_id    uuid references analysis.results(id) on delete set null,
  creator_id   uuid references kol.creators(id) on delete set null,
  objective    text not null check (objective in ('awareness','launch','conversion','tiktok_shop','brand_building','ugc')),
  category_id  text references ref.categories(id),
  tier         text references ref.tier_bands(tier),
  fee_thb      int check (fee_thb is null or fee_thb >= 0),
  views        bigint,
  engagements  bigint,
  clicks       bigint,
  orders       bigint,
  posted_at    timestamptz,
  recorded_by  uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index on analysis.campaign_outcomes (objective, category_id, tier);
create index on analysis.campaign_outcomes (creator_id) where creator_id is not null;

alter table analysis.campaign_outcomes enable row level security;
create policy svc_agent_rw on analysis.campaign_outcomes for all to svc_agent using (true) with check (true);
grant select, insert, update, delete on analysis.campaign_outcomes to svc_agent;
