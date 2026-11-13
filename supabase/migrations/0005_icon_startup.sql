-- STUDENT ICON — Startup Universe (F2): industries, drafts, companies, teams
--
-- Design notes
--   * startups are drafts; companies are launched entities. Launch itself
--     lives in 0006 because it posts the opening capital to the ledger.
--   * A company's currency is chosen at creation and can never change.
--   * Clients read their own drafts and companies they belong to. No client
--     may write companies, members, products, employees or customers.

-- ---------------------------------------------------------------- industries

create table if not exists public.industries (
  slug                text primary key,
  title               text not null,
  base_demand         integer not null default 100 check (base_demand >= 0),
  base_cost_minor     bigint not null default 0 check (base_cost_minor >= 0),
  market_size_minor   bigint not null default 0 check (market_size_minor >= 0),
  mechanics           jsonb not null default '{}'::jsonb,
  is_full_simulation  boolean not null default false
);

insert into public.industries (slug, title, base_demand, base_cost_minor, market_size_minor, is_full_simulation) values
  ('ai-ml',            'AI & Machine Learning', 140,  400000, 900000000000, true),
  ('saas',             'SaaS',                  120,  250000, 750000000000, true),
  ('edtech',           'EdTech',                 90,  150000, 400000000000, true),
  ('ecommerce',        'E-commerce',            160,  100000, 800000000000, true),
  ('fintech',          'FinTech',               100,  500000, 700000000000, false),
  ('healthtech',       'HealthTech',             80,  600000, 650000000000, false),
  ('gaming',           'Gaming',                130,  300000, 500000000000, false),
  ('entertainment',    'Entertainment',         110,  350000, 450000000000, false),
  ('content-creation', 'Content Creation',      150,   80000, 300000000000, false),
  ('digital-marketing','Digital Marketing',     120,  120000, 350000000000, false),
  ('robotics',         'Robotics',               60,  900000, 400000000000, false),
  ('cleantech',        'CleanTech',              50, 1200000, 380000000000, false),
  ('spacetech',        'SpaceTech',              30, 2500000, 250000000000, false),
  ('fashion',          'Fashion',                95,  180000, 320000000000, false),
  ('foodtech',         'FoodTech',              105,  160000, 330000000000, false),
  ('media',            'Media',                 100,  140000, 360000000000, false),
  ('cybersecurity',    'Cybersecurity',          70,  550000, 420000000000, false),
  ('agritech',         'AgriTech',               55,  400000, 280000000000, false),
  ('social-networks',  'Social Networks',       200,  200000, 850000000000, false),
  ('consumer-tech',    'Consumer Technology',   170,  260000, 600000000000, false)
on conflict (slug) do nothing;

-- ---------------------------------------------------------------- drafts

create table if not exists public.startups (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references public.profiles (id) on delete cascade,
  step                 smallint not null default 1 check (step between 1 and 13),
  name                 text not null default '',
  industry_slug        text references public.industries (slug),
  problem              text not null default '',
  idea                 text not null default '',
  solution             text not null default '',
  brand                jsonb not null default '{}'::jsonb,
  logo_url             text,
  target_market        text not null default '',
  revenue_model        text not null default '',
  initial_capital_minor bigint not null default 0 check (initial_capital_minor >= 0),
  currency             char(3) not null default 'INR' check (currency in ('INR', 'USD')),
  status               text not null default 'draft' check (status in ('draft', 'launched', 'archived')),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists startups_user_idx on public.startups (user_id, updated_at desc);

drop trigger if exists startups_touch on public.startups;
create trigger startups_touch
  before update on public.startups
  for each row execute function public.icon_touch_updated_at();

-- ---------------------------------------------------------------- companies

create table if not exists public.companies (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references public.profiles (id) on delete cascade,
  startup_id      uuid references public.startups (id) on delete set null,
  name            text not null check (char_length(name) between 1 and 60),
  industry_slug   text not null references public.industries (slug),
  currency        char(3) not null check (currency in ('INR', 'USD')),
  logo_url        text,
  brand_strength  smallint not null default 10 check (brand_strength between 0 and 100),
  cash_minor      bigint not null default 0,
  valuation_minor bigint not null default 0 check (valuation_minor >= 0),
  status          text not null default 'active' check (status in ('active', 'archived')),
  tick_index      integer not null default 0 check (tick_index >= 0),
  last_ticked_at  timestamptz,
  launched_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists companies_owner_idx on public.companies (owner_id, created_at desc);

drop trigger if exists companies_touch on public.companies;
create trigger companies_touch
  before update on public.companies
  for each row execute function public.icon_touch_updated_at();

-- Currency is a property of the company for life (decision D4).
create or replace function public.icon_company_currency_locked()
returns trigger
language plpgsql
as $$
begin
  if new.currency is distinct from old.currency then
    raise exception 'company currency is immutable (% -> %)', old.currency, new.currency;
  end if;
  return new;
end $$;

drop trigger if exists companies_currency_locked on public.companies;
create trigger companies_currency_locked
  before update on public.companies
  for each row execute function public.icon_company_currency_locked();

create table if not exists public.company_members (
  company_id uuid not null references public.companies (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  role       text not null check (role in ('ceo', 'cto', 'cfo', 'cmo', 'pm', 'dev', 'design', 'marketing')),
  status     text not null default 'active' check (status in ('active', 'invited', 'left')),
  joined_at  timestamptz not null default now(),
  primary key (company_id, user_id)
);

create index if not exists company_members_user_idx on public.company_members (user_id, status);

-- ---------------------------------------------------------------- operations

create table if not exists public.products (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies (id) on delete cascade,
  name          text not null check (char_length(name) between 1 and 80),
  description   text not null default '',
  price_minor   bigint not null default 0 check (price_minor >= 0),
  cost_minor    bigint not null default 0 check (cost_minor >= 0),
  quality       smallint not null default 50 check (quality between 0 and 100),
  status        text not null default 'live' check (status in ('concept', 'live', 'retired')),
  launched_at   timestamptz,
  created_at    timestamptz not null default now()
);

create index if not exists products_company_idx on public.products (company_id, status);

create table if not exists public.employees (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies (id) on delete cascade,
  name        text not null,
  role        text not null,
  salary_minor bigint not null check (salary_minor >= 0),
  skill       smallint not null default 50 check (skill between 0 and 100),
  morale      smallint not null default 70 check (morale between 0 and 100),
  hired_at    timestamptz not null default now(),
  left_at     timestamptz
);

create table if not exists public.customers (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies (id) on delete cascade,
  segment     text not null default 'default',
  count       integer not null default 0 check (count >= 0),
  churned_at  timestamptz,
  unique (company_id, segment, churned_at)
);

create table if not exists public.market_events (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies (id) on delete cascade,
  tick_index  integer not null default 0,
  kind        text not null,
  payload     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists market_events_company_idx on public.market_events (company_id, created_at desc);

-- ---------------------------------------------------------------- rls

alter table public.industries      enable row level security;
alter table public.startups        enable row level security;
alter table public.companies       enable row level security;
alter table public.company_members enable row level security;
alter table public.products        enable row level security;
alter table public.employees       enable row level security;
alter table public.customers       enable row level security;
alter table public.market_events   enable row level security;

drop policy if exists industries_read on public.industries;
create policy industries_read on public.industries for select using (true);

drop policy if exists startups_own on public.startups;
create policy startups_own on public.startups
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists companies_read on public.companies;
create policy companies_read on public.companies
  for select using (
    owner_id = auth.uid()
    or exists (
      select 1 from public.company_members m
       where m.company_id = public.companies.id
         and m.user_id = auth.uid()
         and m.status = 'active'
    )
  );

-- Own membership rows only. Deliberately does NOT subquery this table:
-- a self-referencing policy would recurse once other policies use it.
drop policy if exists members_read on public.company_members;
create policy members_read on public.company_members
  for select using (user_id = auth.uid());

drop policy if exists products_read on public.products;
create policy products_read on public.products
  for select using (
    exists (
      select 1 from public.company_members m
       where m.company_id = public.products.company_id
         and m.user_id = auth.uid()
         and m.status = 'active'
    )
  );

drop policy if exists employees_read on public.employees;
create policy employees_read on public.employees
  for select using (
    exists (
      select 1 from public.company_members m
       where m.company_id = public.employees.company_id
         and m.user_id = auth.uid()
         and m.status = 'active'
    )
  );

drop policy if exists customers_read on public.customers;
create policy customers_read on public.customers
  for select using (
    exists (
      select 1 from public.company_members m
       where m.company_id = public.customers.company_id
         and m.user_id = auth.uid()
         and m.status = 'active'
    )
  );

drop policy if exists events_read on public.market_events;
create policy events_read on public.market_events
  for select using (
    exists (
      select 1 from public.company_members m
       where m.company_id = public.market_events.company_id
         and m.user_id = auth.uid()
         and m.status = 'active'
    )
  );

grant select on public.industries to anon, authenticated;
grant select, insert, update, delete on public.startups to authenticated;
grant select on public.companies, public.company_members, public.products,
                public.employees, public.customers, public.market_events to authenticated;
