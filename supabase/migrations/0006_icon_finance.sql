-- STUDENT ICON — finance, ledger and the dual milestone (F2)
--
-- Design notes
--   * Money is bigint minor units (paise / cents). No floats, anywhere.
--   * ledger_transactions is append-only. Updates and deletes raise.
--   * companies.cash_minor is a cached projection; icon_reconcile_ledger()
--     proves it still equals the ledger sum.
--   * Valuation is computed from revenue and profit, never stored by hand.
--   * Valuation and revenue are separate achievements in separate currencies.
--     Nothing ever sums across currencies.
--   * Every write path is SECURITY DEFINER and revoked from clients, except
--     read-only helpers.

create table if not exists public.icon_economy_config (
  key   text primary key,
  value numeric not null
);

insert into public.icon_economy_config (key, value) values
  ('milestone_target_minor', 200000000000),  -- 2,000,000,000.00 in paise/cents
  ('revenue_multiple', 4),
  ('profit_multiple', 12)
on conflict (key) do nothing;

-- ---------------------------------------------------------------- ledger

create table if not exists public.ledger_transactions (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null references public.companies (id) on delete cascade,
  user_id             uuid,
  kind                text not null check (kind in (
                        'seed_capital', 'sale', 'refund', 'salary', 'hosting',
                        'campaign', 'purchase', 'investment', 'grant', 'tax', 'adjustment')),
  amount_minor        bigint not null check (amount_minor <> 0),
  currency            char(3) not null check (currency in ('INR', 'USD')),
  balance_after_minor bigint not null,
  ref_type            text,
  ref_id              uuid,
  idempotency_key     text,
  memo                text not null default '',
  created_at          timestamptz not null default now(),
  unique (company_id, idempotency_key)
);

create index if not exists ledger_company_idx
  on public.ledger_transactions (company_id, created_at desc);

-- Append-only.
create or replace function public.icon_ledger_immutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'ledger_transactions is append-only';
end $$;

drop trigger if exists ledger_no_change on public.ledger_transactions;
create trigger ledger_no_change
  before update or delete on public.ledger_transactions
  for each row execute function public.icon_ledger_immutable();

-- A row can never carry a currency different from its company's.
create or replace function public.icon_ledger_currency_guard()
returns trigger
language plpgsql
as $$
declare
  v_currency char(3);
begin
  select currency into v_currency from public.companies where id = new.company_id;
  if v_currency is null then
    raise exception 'company % not found', new.company_id;
  end if;
  if v_currency <> new.currency then
    raise exception 'currency mismatch: company is %, row is %', v_currency, new.currency;
  end if;
  return new;
end $$;

drop trigger if exists ledger_currency_guard on public.ledger_transactions;
create trigger ledger_currency_guard
  before insert on public.ledger_transactions
  for each row execute function public.icon_ledger_currency_guard();

-- ---------------------------------------------------------------- posting

-- The only money write path. Idempotent per (company, key).
create or replace function public.icon_post_transaction(
  p_company  uuid,
  p_kind     text,
  p_amount   bigint,
  p_ref_type text    default null,
  p_ref      uuid    default null,
  p_key      text    default null,
  p_memo     text    default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_currency char(3);
  v_cash     bigint;
  v_new      bigint;
  v_existing uuid;
  v_id       uuid;
  v_key      text;
begin
  if p_amount is null or p_amount = 0 then
    raise exception 'amount must be non-zero';
  end if;

  if p_kind not in ('seed_capital', 'sale', 'refund', 'salary', 'hosting',
                    'campaign', 'purchase', 'investment', 'grant', 'tax', 'adjustment') then
    raise exception 'unknown transaction kind %', p_kind;
  end if;

  if p_kind = 'refund' and p_amount > 0 then
    raise exception 'refunds must be negative';
  end if;

  select currency, cash_minor into v_currency, v_cash
    from public.companies where id = p_company for update;

  if v_currency is null then
    raise exception 'company % not found', p_company;
  end if;

  v_key := nullif(btrim(coalesce(p_key, '')), '');

  if v_key is not null then
    select id into v_existing
      from public.ledger_transactions
     where company_id = p_company and idempotency_key = v_key;
    if v_existing is not null then
      return v_existing;
    end if;
  end if;

  v_new := v_cash + p_amount;
  if v_new < 0 then
    raise exception 'insufficient funds: balance %, requested %', v_cash, p_amount;
  end if;

  insert into public.ledger_transactions (
    company_id, user_id, kind, amount_minor, currency, balance_after_minor,
    ref_type, ref_id, idempotency_key, memo
  ) values (
    p_company, auth.uid(), p_kind, p_amount, v_currency, v_new,
    p_ref_type, p_ref, v_key, coalesce(p_memo, '')
  )
  returning id into v_id;

  update public.companies
     set cash_minor = v_new
   where id = p_company;

  return v_id;
end $$;

-- ---------------------------------------------------------------- launch

create or replace function public.icon_launch_startup(p_user uuid, p_startup uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_s       record;
  v_company uuid;
begin
  if p_user is null then
    p_user := auth.uid();
  end if;
  if auth.uid() is not null and p_user <> auth.uid() then
    raise exception 'forbidden';
  end if;

  select * into v_s from public.startups where id = p_startup;
  if not found then
    raise exception 'startup % not found', p_startup;
  end if;
  if v_s.user_id <> p_user then
    raise exception 'forbidden';
  end if;
  if v_s.status <> 'draft' then
    raise exception 'startup already launched';
  end if;
  if v_s.industry_slug is null then
    raise exception 'choose an industry before launching';
  end if;

  insert into public.companies (owner_id, startup_id, name, industry_slug, currency, launched_at)
  values (p_user, v_s.id, coalesce(nullif(v_s.name, ''), 'Untitled'), v_s.industry_slug, v_s.currency, now())
  returning id into v_company;

  insert into public.company_members (company_id, user_id, role)
  values (v_company, p_user, 'ceo')
  on conflict (company_id, user_id) do nothing;

  insert into public.products (company_id, name, description, price_minor, cost_minor, quality, status, launched_at)
  values (v_company, coalesce(nullif(v_s.name, ''), 'First product'), v_s.solution, 9900, 2900, 50, 'live', now());

  if coalesce(v_s.initial_capital_minor, 0) > 0 then
    perform public.icon_post_transaction(
      v_company, 'seed_capital', v_s.initial_capital_minor,
      'startup', v_s.id, 'launch:' || v_s.id::text, 'Opening capital'
    );
  end if;

  update public.startups set status = 'launched' where id = v_s.id;

  return v_company;
end $$;

-- ---------------------------------------------------------------- valuation

create or replace function public.icon_recompute_valuation(p_company uuid)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_revenue      bigint;
  v_expenses     bigint;
  v_mult_revenue numeric;
  v_mult_profit  numeric;
  v_valuation    bigint;
begin
  select coalesce(sum(amount_minor) filter (where kind in ('sale', 'refund')), 0),
         coalesce(sum(-amount_minor) filter (where kind in ('salary', 'hosting', 'campaign', 'purchase', 'tax')), 0)
    into v_revenue, v_expenses
    from public.ledger_transactions
   where company_id = p_company
     and created_at >= now() - interval '365 days';

  select value into v_mult_revenue from public.icon_economy_config where key = 'revenue_multiple';
  select value into v_mult_profit  from public.icon_economy_config where key = 'profit_multiple';

  v_valuation := greatest(
    0,
    round(v_revenue * coalesce(v_mult_revenue, 4)),
    round((v_revenue - v_expenses) * coalesce(v_mult_profit, 12))
  );

  update public.companies set valuation_minor = v_valuation where id = p_company;

  return v_valuation;
end $$;

-- ---------------------------------------------------------------- milestone

create table if not exists public.milestone_progress (
  user_id         uuid not null references public.profiles (id) on delete cascade,
  kind            text not null check (kind in ('valuation', 'revenue')),
  currency        char(3) not null check (currency in ('INR', 'USD')),
  best_company_id uuid references public.companies (id) on delete set null,
  amount_minor    bigint not null default 0,
  achieved_at     timestamptz,
  primary key (user_id, kind, currency)
);

-- Per-currency progress. Never adds INR to USD.
create or replace function public.icon_milestone_status(p_user uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_target bigint;
  v_out    jsonb := '{}'::jsonb;
  r        record;
begin
  if p_user is null then
    p_user := auth.uid();
  end if;
  if p_user is null then
    raise exception 'no player';
  end if;
  if auth.uid() is not null and p_user <> auth.uid() then
    raise exception 'forbidden';
  end if;

  select value::bigint into v_target
    from public.icon_economy_config where key = 'milestone_target_minor';

  for r in
    select currency,
           max(valuation_minor)                    as valuation,
           sum(revenue)                            as revenue,
           (array_agg(id order by valuation_minor desc))[1] as best_company
      from (
        select c.id, c.currency, c.valuation_minor,
               (select coalesce(sum(l.amount_minor), 0)
                  from public.ledger_transactions l
                 where l.company_id = c.id
                   and l.kind in ('sale', 'refund')) as revenue
          from public.companies c
         where c.owner_id = p_user
           and c.status <> 'archived'
      ) t
     group by currency
  loop
    v_out := v_out || jsonb_build_object(r.currency, jsonb_build_object(
      'valuation_minor',  r.valuation,
      'revenue_minor',    r.revenue,
      'target_minor',     v_target,
      'valuation_achieved', r.valuation >= v_target,
      'revenue_achieved',   r.revenue   >= v_target,
      'dual_achieved',      r.valuation >= v_target and r.revenue >= v_target
    ));

    insert into public.milestone_progress (user_id, kind, currency, best_company_id, amount_minor, achieved_at)
    values (p_user, 'valuation', r.currency, r.best_company, r.valuation,
            case when r.valuation >= v_target then now() end)
    on conflict (user_id, kind, currency) do update
      set best_company_id = excluded.best_company_id,
          amount_minor    = excluded.amount_minor,
          achieved_at     = coalesce(public.milestone_progress.achieved_at, excluded.achieved_at);

    insert into public.milestone_progress (user_id, kind, currency, best_company_id, amount_minor, achieved_at)
    values (p_user, 'revenue', r.currency, r.best_company, r.revenue,
            case when r.revenue >= v_target then now() end)
    on conflict (user_id, kind, currency) do update
      set best_company_id = excluded.best_company_id,
          amount_minor    = excluded.amount_minor,
          achieved_at     = coalesce(public.milestone_progress.achieved_at, excluded.achieved_at);
  end loop;

  return v_out;
end $$;

create or replace function public.icon_reconcile_ledger(p_company uuid)
returns bigint
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((select sum(amount_minor) from public.ledger_transactions where company_id = p_company), 0)
       - coalesce((select cash_minor from public.companies where id = p_company), 0);
$$;

-- ---------------------------------------------------------------- rls

alter table public.ledger_transactions  enable row level security;
alter table public.milestone_progress   enable row level security;
alter table public.icon_economy_config  enable row level security;

drop policy if exists ledger_read on public.ledger_transactions;
create policy ledger_read on public.ledger_transactions
  for select using (
    exists (
      select 1 from public.company_members m
       where m.company_id = public.ledger_transactions.company_id
         and m.user_id = auth.uid()
         and m.status = 'active'
    )
  );

drop policy if exists milestones_read on public.milestone_progress;
create policy milestones_read on public.milestone_progress
  for select using (user_id = auth.uid());

drop policy if exists economy_read on public.icon_economy_config;
create policy economy_read on public.icon_economy_config for select using (true);

grant select on public.ledger_transactions to authenticated;
grant select on public.milestone_progress to authenticated;
grant select on public.icon_economy_config to authenticated;

-- No client can ever post money, launch a company or recompute valuation.
revoke all on function public.icon_post_transaction(uuid, text, bigint, text, uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.icon_recompute_valuation(uuid) from public, anon, authenticated;
revoke all on function public.icon_reconcile_ledger(uuid) from public, anon, authenticated;

grant execute on function public.icon_post_transaction(uuid, text, bigint, text, uuid, text, text) to service_role;
grant execute on function public.icon_recompute_valuation(uuid) to service_role;
grant execute on function public.icon_reconcile_ledger(uuid) to service_role;

-- Players may read their own milestone status; the function checks auth.uid().
grant execute on function public.icon_milestone_status(uuid) to authenticated, service_role;
grant execute on function public.icon_launch_startup(uuid, uuid) to authenticated, service_role;
