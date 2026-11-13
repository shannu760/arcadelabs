-- STUDENT ICON — identity, progression and shared systems (F2)
--
-- Apply after 0001/0002 if the arcade is already live:
--   Supabase dashboard → SQL Editor → paste → Run   (or: supabase db push)
--
-- Design notes
--   * One profile per auth user; handle is the public URL key.
--   * XP is append-only: xp_events holds every award with an idempotency key,
--     profiles.xp is a projection kept by icon_award_xp(). Repeats never pay.
--   * Rank is derived from XP, never set by hand.
--   * Clients may read public profiles and their own row. They may not touch
--     XP, ranks or achievements: no write policies exist for those tables.

create extension if not exists pgcrypto;

-- service_role exists on Supabase; local Postgres (and the test harness) needs it.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin;
  end if;
end $$;

-- ---------------------------------------------------------------- helpers

create or replace function public.icon_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------- profile

create table if not exists public.profiles (
  id              uuid primary key references auth.users (id) on delete cascade,
  handle          text not null unique check (handle ~ '^[a-z0-9_]{3,20}$'),
  display_name    text not null check (char_length(display_name) between 1 and 40),
  bio             text not null default '' check (char_length(bio) <= 280),
  country         char(2),
  education_stage text,
  avatar_url      text,
  visibility      text not null default 'public' check (visibility in ('public', 'unlisted')),
  xp              bigint not null default 0 check (xp >= 0),
  rank_index      smallint not null default 1 check (rank_index between 1 and 11),
  reputation      integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch
  before update on public.profiles
  for each row execute function public.icon_touch_updated_at();

create table if not exists public.player_interests (
  user_id  uuid not null references public.profiles (id) on delete cascade,
  interest text not null check (char_length(interest) between 1 and 40),
  primary key (user_id, interest)
);

create table if not exists public.player_careers (
  user_id     uuid not null references public.profiles (id) on delete cascade,
  career_slug text not null,
  primary key (user_id, career_slug)
);

-- ---------------------------------------------------------------- ranks

create table if not exists public.icon_ranks (
  rank_index smallint primary key check (rank_index between 1 and 11),
  slug       text not null unique,
  title      text not null,
  min_xp     bigint not null check (min_xp >= 0)
);

insert into public.icon_ranks (rank_index, slug, title, min_xp) values
  ( 1, 'dreamer',          'Dreamer',           0),
  ( 2, 'explorer',         'Explorer',        120),
  ( 3, 'learner',          'Learner',         400),
  ( 4, 'creator',          'Creator',         900),
  ( 5, 'innovator',        'Innovator',      1800),
  ( 6, 'founder',          'Founder',        3200),
  ( 7, 'entrepreneur',     'Entrepreneur',   5200),
  ( 8, 'business-leader',  'Business Leader', 8000),
  ( 9, 'industry-pioneer', 'Industry Pioneer',12000),
  (10, 'business-titan',   'Business Titan', 18000),
  (11, 'global-icon',      'Global Icon',    26000)
on conflict (rank_index) do nothing;

create or replace function public.icon_rank_for_xp(p_xp bigint)
returns smallint
language sql
stable
as $$
  select coalesce(max(rank_index), 1)::smallint
    from public.icon_ranks
   where min_xp <= greatest(coalesce(p_xp, 0), 0);
$$;

-- ---------------------------------------------------------------- xp

create table if not exists public.xp_events (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles (id) on delete cascade,
  source          text not null,
  ref_id          text,
  amount          integer not null check (amount > 0),
  idempotency_key text not null,
  created_at      timestamptz not null default now(),
  unique (user_id, idempotency_key)
);

create index if not exists xp_events_user_idx on public.xp_events (user_id, created_at desc);

create table if not exists public.achievements (
  slug        text primary key,
  title       text not null,
  description text not null,
  xp_bonus    integer not null default 0 check (xp_bonus >= 0),
  icon        text not null default 'star'
);

insert into public.achievements (slug, title, description, xp_bonus, icon) values
  ('first-challenge',   'First Steps',        'Complete your first learning challenge',      50, 'star'),
  ('first-project',     'Shipped',            'Publish your first project',                 100, 'gem'),
  ('first-idea',        'Idea Logged',        'Capture your first startup idea',             50, 'bulb'),
  ('first-company',     'Incorporated',       'Launch your first company',                  200, 'crown'),
  ('first-product',     'On The Market',      'Ship your first product',                    100, 'gem'),
  ('first-customer',    'First Customer',     'Make your first recorded sale',              150, 'star'),
  ('first-employee',    'Team Of Two',        'Hire your first employee',                   150, 'heart'),
  ('first-collaboration','Co-Founder',        'Start a company with another player',        250, 'heart'),
  ('first-campaign',    'Loudspeaker',        'Run your first marketing campaign',          100, 'bulb'),
  ('first-profit',      'In The Black',       'Post a profitable month',                    300, 'gem'),
  ('first-expansion',   'New Territory',      'Expand into a second market',                300, 'crown'),
  ('first-acquisition', 'Acquirer',           'Complete your first acquisition',            500, 'crown'),
  ('valuation-icon',    'Valuation Icon',     'Reach a 2 billion valuation',               2000, 'crown'),
  ('revenue-icon',      'Revenue Icon',       'Reach 2 billion in recorded revenue',       2000, 'crown'),
  ('dual-icon',         'Dual Icon',          'Reach both milestones in the same currency', 5000, 'crown')
on conflict (slug) do nothing;

create table if not exists public.player_achievements (
  user_id     uuid not null references public.profiles (id) on delete cascade,
  slug        text not null references public.achievements (slug) on delete cascade,
  unlocked_at timestamptz not null default now(),
  primary key (user_id, slug)
);

create table if not exists public.daily_counters (
  user_id uuid not null references public.profiles (id) on delete cascade,
  day     date not null default current_date,
  kind    text not null,
  count   integer not null default 0 check (count >= 0),
  primary key (user_id, day, kind)
);

-- ---------------------------------------------------------------- award

-- Idempotent XP award. Returns { awarded, xp, rank }.
create or replace function public.icon_award_xp(
  p_user   uuid,
  p_source text,
  p_ref    text,
  p_amount integer,
  p_key    text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_key   text;
  v_rows  integer;
  v_xp    bigint;
  v_rank  smallint;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'xp amount must be positive';
  end if;

  v_key := coalesce(nullif(btrim(p_key), ''), p_source || ':' || coalesce(p_ref, '-'));

  insert into public.xp_events (user_id, source, ref_id, amount, idempotency_key)
  values (p_user, p_source, p_ref, p_amount, v_key)
  on conflict (user_id, idempotency_key) do nothing;

  get diagnostics v_rows = row_count;

  if v_rows = 0 then
    select xp, rank_index into v_xp, v_rank from public.profiles where id = p_user;
    return jsonb_build_object('awarded', false, 'xp', coalesce(v_xp, 0), 'rank', coalesce(v_rank, 1));
  end if;

  update public.profiles
     set xp = xp + p_amount,
         rank_index = public.icon_rank_for_xp(xp + p_amount)
   where id = p_user
   returning xp, rank_index into v_xp, v_rank;

  if v_xp is null then
    raise exception 'profile % not found', p_user;
  end if;

  return jsonb_build_object('awarded', true, 'xp', v_xp, 'rank', v_rank);
end $$;

create or replace function public.icon_grant_achievement(p_user uuid, p_slug text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rows  integer;
  v_bonus integer;
begin
  insert into public.player_achievements (user_id, slug)
  values (p_user, p_slug)
  on conflict (user_id, slug) do nothing;

  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    return false;
  end if;

  select xp_bonus into v_bonus from public.achievements where slug = p_slug;
  if coalesce(v_bonus, 0) > 0 then
    perform public.icon_award_xp(p_user, 'achievement', p_slug, v_bonus, 'achievement:' || p_slug);
  end if;

  return true;
end $$;

-- ---------------------------------------------------------------- rls

alter table public.profiles             enable row level security;
alter table public.player_interests     enable row level security;
alter table public.player_careers       enable row level security;
alter table public.xp_events            enable row level security;
alter table public.player_achievements  enable row level security;
alter table public.daily_counters       enable row level security;
alter table public.icon_ranks           enable row level security;
alter table public.achievements         enable row level security;

drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles
  for select using (visibility = 'public' or id = auth.uid());

drop policy if exists profiles_insert_self on public.profiles;
create policy profiles_insert_self on public.profiles
  for insert with check (id = auth.uid());

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists interests_read on public.player_interests;
create policy interests_read on public.player_interests
  for select using (user_id = auth.uid());

drop policy if exists interests_write on public.player_interests;
create policy interests_write on public.player_interests
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists careers_read on public.player_careers;
create policy careers_read on public.player_careers
  for select using (user_id = auth.uid());

drop policy if exists careers_write on public.player_careers;
create policy careers_write on public.player_careers
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists xp_read_own on public.xp_events;
create policy xp_read_own on public.xp_events
  for select using (user_id = auth.uid());

drop policy if exists achievements_own on public.player_achievements;
create policy achievements_own on public.player_achievements
  for select using (user_id = auth.uid());

drop policy if exists counters_own on public.daily_counters;
create policy counters_own on public.daily_counters
  for select using (user_id = auth.uid());

drop policy if exists ranks_read on public.icon_ranks;
create policy ranks_read on public.icon_ranks for select using (true);

drop policy if exists achievements_read on public.achievements;
create policy achievements_read on public.achievements for select using (true);

grant usage on schema public to anon, authenticated;

grant select on public.profiles to anon, authenticated;
grant insert, update on public.profiles to authenticated;
grant select, insert, delete on public.player_interests to authenticated;
grant select, insert, delete on public.player_careers to authenticated;
grant select on public.xp_events to authenticated;
grant select on public.player_achievements to authenticated;
grant select on public.daily_counters to authenticated;
grant select on public.icon_ranks to anon, authenticated;
grant select on public.achievements to anon, authenticated;

-- Progression writes are server-only.
revoke all on function public.icon_award_xp(uuid, text, text, integer, text) from public, anon, authenticated;
revoke all on function public.icon_grant_achievement(uuid, text) from public, anon, authenticated;
grant execute on function public.icon_award_xp(uuid, text, text, integer, text) to service_role;
grant execute on function public.icon_grant_achievement(uuid, text) to service_role;
