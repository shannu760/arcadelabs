# STUDENT ICON — Database Design (M2 draft)

Status: **0003–0006 implemented and tested**; `0007` (AI) and `0008` (social) are stage-two designs.
PostgreSQL 15+ (Supabase). Proven by `.labtest/icon.mjs` — 58 checks — and by applying all six
migrations in order (arcade + icon) to a clean database.

---

## 1. Conventions

- `id uuid primary key default gen_random_uuid()`.
- `created_at timestamptz not null default now()`, `updated_at timestamptz` maintained by trigger.
- Money: `bigint` **minor units** (`*_minor`) + `currency char(3)` (`INR`/`USD`). No `numeric` for money, no floats.
- Enumerations as `text` + `check` constraints (easier to evolve than `enum` types).
- Soft delete only where history matters (`deleted_at`); otherwise hard delete with `on delete cascade`.
- Every user-owned row carries `user_id uuid` for RLS.
- Names are snake_case, plural tables.
- All FKs indexed. Every policy references `auth.uid()`.

---

## 2. Identity and progression

```
profiles
  id uuid pk  (= auth.users.id)
  handle text unique not null check (handle ~ '^[a-z0-9_]{3,20}$')
  display_name text not null
  bio text, country char(2), education_stage text
  avatar_url text, visibility text check in ('public','unlisted') default 'public'
  xp bigint default 0, rank_index smallint default 0
  reputation integer default 0
  created_at, updated_at

player_interests (profile_id, interest text)            pk(profile_id, interest)
player_careers   (profile_id, career_slug text)         pk(profile_id, career_slug)

xp_events
  id uuid pk, user_id, source text, ref_id text, amount int,
  idempotency_key text unique, created_at
  -- unique(user_id, source, ref_id) also enforced

achievements            (slug pk, title, description, xp_bonus, icon)
player_achievements     (user_id, slug, unlocked_at)  pk(user_id, slug)

daily_counters (user_id, day date, kind text, count int) pk(user_id, day, kind)
```

`xp_events` is append-only; `profiles.xp` is a cached projection reconciled by trigger or function.

---

## 3. Student universe

```
skills                 (slug pk, branch text check in ('technical','business','creative'),
                        title, description, max_level smallint default 5)
player_skills          (user_id, skill_slug, level smallint default 0, xp int default 0)
                        pk(user_id, skill_slug)

learning_categories    (slug pk, title, description)
learning_challenges
  id uuid pk, category_slug fk, tier smallint, difficulty text,
  title, objective, brief, tasks jsonb, kind text,
  payload jsonb,          -- options / blanks / expected values
  answer_key jsonb,       -- never exposed to clients
  explanation text, xp_reward int, skill_slug fk, is_active boolean

learning_attempts
  id uuid pk, user_id, challenge_id fk, score smallint, passed boolean,
  answers jsonb, started_at, submitted_at
  unique(user_id, challenge_id) where passed  -- via partial unique index

projects
  id uuid pk, user_id, title, slug, summary, category text, links jsonb,
  media jsonb, collaborators jsonb, visibility text, status text,
  promoted_company_id uuid null, created_at, updated_at
  unique(user_id, slug)

competitions (id, slug, title, kind, starts_at, ends_at, rules jsonb, status)
competition_entries (id, competition_id, user_id, team_id, score, rank, submitted_at)
careers (slug pk, title, description, required_skills jsonb)
```

---

## 4. Startup universe

```
industries (slug pk, title, base_demand, base_cost, market_size_minor,
            mechanics jsonb, is_full_simulation boolean)

startups                      -- drafts before launch
  id uuid pk, user_id, step smallint default 1, name text, industry_slug fk,
  problem text, idea text, solution text, brand jsonb, logo_url text,
  target_market text, revenue_model text, initial_capital_minor bigint,
  currency char(3) check (currency in ('INR','USD')),
  status text check in ('draft','launched','archived') default 'draft',
  created_at, updated_at

companies
  id uuid pk, owner_id uuid, startup_id uuid null, name, industry_slug fk,
  currency char(3) not null,            -- immutable after insert
  logo_url, brand_strength smallint default 10,
  cash_minor bigint not null default 0, -- cached projection of ledger
  valuation_minor bigint not null default 0, -- cached, recomputed on read
  launched_at timestamptz, status text default 'active',
  tick_index int default 0, last_ticked_at timestamptz

company_members
  (company_id, user_id, role text check in ('ceo','cto','cfo','cmo','pm','dev','design','marketing'),
   joined_at, status text default 'active')  pk(company_id, user_id)

products
  id uuid pk, company_id, name, description, price_minor bigint, cost_minor bigint,
  quality smallint default 50, status text, launched_at
  check (price_minor >= 0 and cost_minor >= 0)

employees
  id uuid pk, company_id, name, role, salary_minor bigint, skill smallint,
  morale smallint default 70, hired_at, left_at

customers
  id uuid pk, company_id, segment text, count int, churned_at  -- aggregate model
  -- stage one keeps customers as cohorts, not per-person rows

market_events
  id uuid pk, company_id, tick_index int, kind text, payload jsonb, created_at
```

---

## 5. Finance (the part that must never be wrong)

```
ledger_transactions
  id uuid pk
  company_id uuid fk not null
  user_id uuid null                -- actor, null for system ticks
  kind text check in ('seed_capital','sale','refund','salary','hosting',
                      'campaign','purchase','investment','grant','tax','adjustment')
  amount_minor bigint not null     -- positive = credit, negative = debit
  currency char(3) not null
  balance_after_minor bigint not null
  ref_type text, ref_id uuid
  idempotency_key text
  memo text
  created_at timestamptz not null default now()
  unique (company_id, idempotency_key)
  index on (company_id, created_at desc)

-- No rollup table in F2: revenue is summed from the ledger on demand with
-- ledger_company_idx. A materialised monthly rollup is only worth adding when
-- volume demands it, and it must be rebuilt from the ledger, never hand-written.

milestone_progress       -- cached, recomputed by function; source of truth is the ledger
  (user_id, kind text check in ('valuation','revenue'), currency char(3),
   best_company_id uuid, amount_minor bigint, achieved_at timestamptz null)
  pk(user_id, kind, currency)
```

**Invariants (enforced by triggers + tests):**
1. `sum(ledger_transactions.amount_minor)` for a company must equal `companies.cash_minor`.
2. `amount_minor` of a `sale` may never be positive without a `ref_type='sale'`.
3. No insert may use a currency different from the company's currency.
4. Deleting a transaction is impossible (`revoke delete`, and a trigger raises).
5. Revenue Icon counts only `sale` rows (minus `refund` rows), never `investment` or `grant`.

---

## 6. AI (stage two)

```
ai_conversations (id, user_id, persona text, company_id null, title, created_at, updated_at)
ai_messages      (id, conversation_id, role text, content text, model text,
                  tokens_in int, tokens_out int, cost_usd numeric(10,6), created_at)
ai_memory        (id, user_id, company_id null, kind text, content text,
                  embedding vector(1536) null, importance smallint, created_at)
ai_usage_daily   (user_id, day date, requests int, tokens_in bigint, tokens_out bigint,
                  cost_usd numeric(12,6)) pk(user_id, day)
ai_budget        (scope text pk, limit_usd numeric(12,2), spent_usd numeric(12,6)) -- 'global'
```

`embedding` requires `create extension vector` (pgvector). If unavailable, memory falls back to
keyword search — the feature must not hard-depend on the extension.

---

## 7. Social and platform

```
friendships        (requester_id, addressee_id, status, created_at) pk(requester_id, addressee_id)
conversations      (id, kind text check in ('dm','group'), title null, created_at)
conversation_members (conversation_id, user_id, last_read_at) pk(conversation_id, user_id)
messages           (id, conversation_id, sender_id, body text, created_at, deleted_at)
message_receipts   (message_id, user_id, read_at) pk(message_id, user_id)
blocks             (blocker_id, blocked_id) pk(blocker_id, blocked_id)
reports            (id, reporter_id, target_type, target_id, reason, status, created_at)

notifications      (id, user_id, kind, payload jsonb, read_at, created_at)
audit_log          (id, actor_id, action, target_type, target_id, meta jsonb, created_at)
leaderboards       (board text, user_id, score bigint, period text, updated_at) pk(board, user_id, period)
```

---

## 8. RLS shape (representative)

```sql
alter table profiles enable row level security;

create policy profiles_read on profiles for select
  using (visibility = 'public' or id = auth.uid());

create policy profiles_write on profiles for update
  using (id = auth.uid()) with check (id = auth.uid());

alter table ledger_transactions enable row level security;

create policy ledger_read on ledger_transactions for select
  using (exists (select 1 from company_members m
                 where m.company_id = ledger_transactions.company_id
                   and m.user_id = auth.uid() and m.status = 'active'));
-- no insert/update/delete policies: only the service role (server) writes money
```

Pattern for every table: read restricted by membership or ownership; writes either owner-only or
service-role-only; **money tables are read-only to all clients, always**.

---

## 9. Server functions (RPC)

```
icon_award_xp(user_id, source, ref_id, amount)          -- idempotent
icon_submit_challenge(user_id, challenge_id, answers)   -- scores, awards, unlocks
icon_post_transaction(company_id, kind, amount, ...)    -- the only money write path
icon_run_tick(company_id, ticks)                        -- deterministic simulation
icon_recompute_valuation(company_id)                    -- on read
icon_milestone_status(user_id)                          -- per-currency progress
icon_reconcile_ledger(company_id)                       -- drift detector
```

All are `security definer` with `search_path = public, pg_temp` and are callable only by the service
role; the API exposes them through authorized routes.

---

## 10. Indexes that matter

- `ledger_transactions (company_id, created_at desc)`
- `xp_events unique (idempotency_key)`
- `learning_attempts (user_id, challenge_id)`
- `projects (visibility, created_at desc) where visibility = 'public'`
- `messages (conversation_id, created_at desc)`
- `ai_memory using ivfflat (embedding vector_cosine_ops)` (stage two)

---

## 11. Migration order and tests

1. `0003_icon_core.sql` — identity, XP, achievements, counters.
2. `0004_icon_student.sql` — skills, learning, projects, competitions, careers.
3. `0005_icon_startup.sql` — industries, drafts, companies, members, products, employees, events.
4. `0006_icon_finance.sql` — ledger, rollups, milestones, functions, invariants.
5. `0007_icon_ai.sql` — AI tables (stage two).
6. `0008_icon_social.sql` — friends, chat, blocks, reports (stage two).

Tests (PGlite for schema/RLS, real Supabase for behavior) must prove: every migration applies cleanly
from an empty database; RLS blocks cross-user reads; ledger invariants hold; duplicate submissions
award XP once; milestone math separates valuation from revenue; currency can't be mixed; tick replay
is deterministic.
