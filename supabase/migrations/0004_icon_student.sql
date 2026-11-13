-- STUDENT ICON — Student Universe (F2): skills, learning, projects, competitions
--
-- Design notes
--   * Challenge answers live in answer_key and are never exposed to clients:
--     column-level SELECT grants omit answer_key entirely.
--   * Scoring happens in icon_submit_challenge(); the browser sends answers,
--     never a score. Passing is idempotent — one XP award per challenge.
--   * Public projects are readable by anyone; drafts stay private.

-- ---------------------------------------------------------------- skills

create table if not exists public.skills (
  slug        text primary key,
  branch      text not null check (branch in ('technical', 'business', 'creative')),
  title       text not null,
  description text not null default '',
  max_level   smallint not null default 5 check (max_level between 1 and 10)
);

insert into public.skills (slug, branch, title, description) values
  ('programming', 'technical', 'Programming',        'Write and debug code that ships'),
  ('web-dev',     'technical', 'Web Development',    'Build interfaces people can use'),
  ('ai-dev',      'technical', 'AI Development',     'Train, prompt and evaluate models'),
  ('data',        'technical', 'Data Analysis',      'Turn raw numbers into decisions'),
  ('security',    'technical', 'Cybersecurity',      'Find and close the gaps'),
  ('product',     'technical', 'Product Development','Shape what gets built and why'),
  ('leadership',  'business',  'Leadership',         'Keep a team pointed at one goal'),
  ('finance',     'business',  'Financial Literacy', 'Read a ledger like a story'),
  ('sales',       'business',  'Sales',              'Turn interest into revenue'),
  ('marketing',   'business',  'Marketing',          'Reach the people who care'),
  ('strategy',    'business',  'Strategy',           'Choose what not to do'),
  ('negotiation', 'business',  'Negotiation',        'Find the deal that holds'),
  ('design',      'creative',  'Graphic Design',     'Make the pixel feel intentional'),
  ('content',     'creative',  'Content Creation',   'Say it in a way that travels'),
  ('storytelling','creative',  'Storytelling',       'Give the numbers a narrative'),
  ('branding',    'creative',  'Branding',           'Own a shape and a feeling')
on conflict (slug) do nothing;

create table if not exists public.player_skills (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  skill_slug text not null references public.skills (slug) on delete cascade,
  level      smallint not null default 1 check (level between 0 and 10),
  xp         integer not null default 0 check (xp >= 0),
  primary key (user_id, skill_slug)
);

-- ---------------------------------------------------------------- learning

create table if not exists public.learning_categories (
  slug        text primary key,
  title       text not null,
  description text not null default ''
);

insert into public.learning_categories (slug, title, description) values
  ('mathematics',        'Mathematics',        'Proofs, probability and the arithmetic of business'),
  ('physics',            'Physics',            'Models of a world that does not negotiate'),
  ('chemistry',          'Chemistry',          'Molecules, materials and process'),
  ('computer-science',   'Computer Science',   'Algorithms, complexity and systems'),
  ('programming',        'Programming',        'Write it, run it, fix it'),
  ('artificial-intelligence', 'Artificial Intelligence', 'How models learn and where they fail'),
  ('business',           'Business',           'Companies, markets and models that survive'),
  ('finance',            'Finance',            'Cash, profit, valuation and runway'),
  ('economics',          'Economics',          'Incentives, prices and second-order effects'),
  ('psychology',         'Psychology',         'Why people decide what they decide'),
  ('communication',      'Communication',      'Write clearly, speak briefly'),
  ('design',             'Design',             'Layout, contrast and usability'),
  ('entrepreneurship',   'Entrepreneurship',   'Find a problem worth solving'),
  ('marketing',          'Marketing',          'Positioning, channels and retention'),
  ('leadership',         'Leadership',         'Hiring, feedback and direction')
on conflict (slug) do nothing;

create table if not exists public.learning_challenges (
  id             uuid primary key default gen_random_uuid(),
  category_slug  text not null references public.learning_categories (slug) on delete cascade,
  tier           smallint not null default 1 check (tier between 1 and 5),
  difficulty     text not null default 'basic' check (difficulty in ('basic', 'intermediate', 'advanced')),
  title          text not null,
  objective      text not null default '',
  brief          text not null default '',
  tasks          jsonb not null default '[]'::jsonb,
  kind           text not null default 'choice' check (kind in ('choice', 'number', 'text')),
  payload        jsonb not null default '{}'::jsonb,
  answer_key     jsonb not null default '{}'::jsonb,
  explanation    text not null default '',
  xp_reward      integer not null default 10 check (xp_reward > 0),
  skill_slug     text references public.skills (slug),
  is_active      boolean not null default true,
  created_at     timestamptz not null default now()
);

create index if not exists learning_challenges_category_idx
  on public.learning_challenges (category_slug, tier);

create table if not exists public.learning_attempts (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  challenge_id uuid not null references public.learning_challenges (id) on delete cascade,
  score        smallint not null default 0 check (score between 0 and 100),
  passed       boolean not null default false,
  answers      jsonb not null default '{}'::jsonb,
  started_at   timestamptz,
  submitted_at timestamptz not null default now()
);

create index if not exists learning_attempts_user_idx
  on public.learning_attempts (user_id, challenge_id);

-- One passing attempt per challenge: XP cannot be farmed by resubmitting.
create unique index if not exists learning_attempts_one_pass
  on public.learning_attempts (user_id, challenge_id)
  where passed;

-- ---------------------------------------------------------------- projects

create table if not exists public.projects (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.profiles (id) on delete cascade,
  title               text not null check (char_length(title) between 2 and 80),
  slug                text not null check (slug ~ '^[a-z0-9-]{2,60}$'),
  summary             text not null default '' check (char_length(summary) <= 400),
  category            text not null default 'software'
                        check (category in ('software', 'research', 'ai', 'creative', 'business', 'community')),
  links               jsonb not null default '[]'::jsonb,
  media               jsonb not null default '[]'::jsonb,
  collaborators       jsonb not null default '[]'::jsonb,
  visibility          text not null default 'public' check (visibility in ('public', 'unlisted')),
  status              text not null default 'published' check (status in ('draft', 'published', 'archived')),
  promoted_company_id uuid,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (user_id, slug)
);

create index if not exists projects_public_idx
  on public.projects (created_at desc) where visibility = 'public' and status = 'published';

drop trigger if exists projects_touch on public.projects;
create trigger projects_touch
  before update on public.projects
  for each row execute function public.icon_touch_updated_at();

-- ---------------------------------------------------------------- competitions

create table if not exists public.competitions (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique,
  title      text not null,
  kind       text not null default 'coding'
               check (kind in ('coding', 'hackathon', 'innovation', 'business-idea', 'design', 'research', 'entrepreneurship')),
  starts_at  timestamptz not null,
  ends_at    timestamptz not null,
  rules      jsonb not null default '{}'::jsonb,
  status     text not null default 'scheduled' check (status in ('scheduled', 'live', 'finished', 'cancelled')),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create table if not exists public.competition_entries (
  id             uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions (id) on delete cascade,
  user_id        uuid not null references public.profiles (id) on delete cascade,
  team_name      text,
  score          integer not null default 0,
  placement      integer check (placement is null or placement > 0),
  submitted_at   timestamptz,
  unique (competition_id, user_id)
);

-- ---------------------------------------------------------------- careers

create table if not exists public.careers (
  slug            text primary key,
  title           text not null,
  description     text not null default '',
  required_skills jsonb not null default '[]'::jsonb
);

insert into public.careers (slug, title, description, required_skills) values
  ('software-engineer', 'Software Engineer',  'Build the product itself',              '["programming","web-dev","product"]'),
  ('ai-engineer',       'AI Engineer',        'Ship models into real products',        '["ai-dev","programming","data"]'),
  ('data-scientist',    'Data Scientist',     'Find the signal in the noise',          '["data","mathematics","programming"]'),
  ('product-manager',   'Product Manager',    'Decide what gets built next',           '["product","communication","strategy"]'),
  ('designer',          'Designer',           'Make it usable and unmistakable',       '["design","branding","content"]'),
  ('researcher',        'Researcher',         'Ask questions nobody has answered',     '["mathematics","data","communication"]'),
  ('entrepreneur',      'Entrepreneur',       'Turn a problem into a company',         '["strategy","sales","finance","leadership"]'),
  ('marketing-specialist','Marketing Specialist','Reach the right people',             '["marketing","content","storytelling"]'),
  ('financial-analyst', 'Financial Analyst',  'Read the numbers honestly',             '["finance","data","strategy"]'),
  ('robotics-engineer', 'Robotics Engineer',  'Make machines move',                    '["programming","security","product"]')
on conflict (slug) do nothing;

-- ---------------------------------------------------------------- scoring

-- Deterministic server-side scoring. The client sends answers, never a score.
create or replace function public.icon_submit_challenge(
  p_user      uuid,
  p_challenge uuid,
  p_answers   jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ch       record;
  v_expected text;
  v_given    text;
  v_ok       boolean := false;
  v_repeat   boolean := false;
  v_award    jsonb;
  v_xp       bigint;
  v_level    smallint;
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

  select * into v_ch from public.learning_challenges where id = p_challenge and is_active;
  if not found then
    raise exception 'challenge % not found', p_challenge;
  end if;

  select true into v_repeat
    from public.learning_attempts
   where user_id = p_user and challenge_id = p_challenge and passed
   limit 1;

  if coalesce(v_repeat, false) then
    select xp into v_xp from public.profiles where id = p_user;
    return jsonb_build_object('status', 'repeat', 'passed', true, 'xp', coalesce(v_xp, 0));
  end if;

  v_expected := case v_ch.kind
                  when 'number' then v_ch.answer_key ->> 'value'
                  when 'text'   then lower(btrim(coalesce(v_ch.answer_key ->> 'value', '')))
                  else v_ch.answer_key ->> 'answer'
                end;

  v_given := case v_ch.kind
               when 'number' then p_answers ->> 'value'
               when 'text'   then lower(btrim(coalesce(p_answers ->> 'value', '')))
               else p_answers ->> 'answer'
             end;

  v_ok := v_expected is not null and v_given is not null and v_expected = v_given;

  insert into public.learning_attempts (user_id, challenge_id, score, passed, answers)
  values (p_user, p_challenge, case when v_ok then 100 else 0 end, v_ok, coalesce(p_answers, '{}'::jsonb))
  on conflict do nothing;

  if v_ok then
    v_award := public.icon_award_xp(
      p_user, 'learning', p_challenge::text, coalesce(v_ch.xp_reward, 10), 'learning:' || p_challenge
    );

    if v_ch.skill_slug is not null then
      insert into public.player_skills as ps (user_id, skill_slug, level, xp)
      values (p_user, v_ch.skill_slug, 1, 1)
      on conflict (user_id, skill_slug) do update
        set xp = ps.xp + 1,
            level = least(
              (select s.max_level from public.skills s where s.slug = ps.skill_slug),
              greatest(1, 1 + ((ps.xp + 1) / 3))
            )
      returning level into v_level;
    end if;

    return jsonb_build_object(
      'status', 'passed', 'passed', true,
      'xp', (v_award ->> 'xp')::bigint,
      'rank', (v_award ->> 'rank')::smallint,
      'skill', v_ch.skill_slug, 'skill_level', v_level
    );
  end if;

  select xp into v_xp from public.profiles where id = p_user;
  return jsonb_build_object('status', 'failed', 'passed', false, 'xp', coalesce(v_xp, 0));
end $$;

-- ---------------------------------------------------------------- rls

alter table public.skills              enable row level security;
alter table public.player_skills       enable row level security;
alter table public.learning_categories enable row level security;
alter table public.learning_challenges enable row level security;
alter table public.learning_attempts   enable row level security;
alter table public.projects            enable row level security;
alter table public.competitions        enable row level security;
alter table public.competition_entries enable row level security;
alter table public.careers             enable row level security;

drop policy if exists skills_read on public.skills;
create policy skills_read on public.skills for select using (true);

drop policy if exists player_skills_read on public.player_skills;
create policy player_skills_read on public.player_skills for select using (user_id = auth.uid());

drop policy if exists categories_read on public.learning_categories;
create policy categories_read on public.learning_categories for select using (true);

drop policy if exists challenges_read on public.learning_challenges;
create policy challenges_read on public.learning_challenges for select using (is_active);

drop policy if exists attempts_read_own on public.learning_attempts;
create policy attempts_read_own on public.learning_attempts for select using (user_id = auth.uid());

drop policy if exists projects_read on public.projects;
create policy projects_read on public.projects
  for select using (
    user_id = auth.uid()
    or (visibility = 'public' and status = 'published')
  );

drop policy if exists projects_write on public.projects;
create policy projects_write on public.projects
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists competitions_read on public.competitions;
create policy competitions_read on public.competitions for select using (true);

drop policy if exists entries_read on public.competition_entries;
create policy entries_read on public.competition_entries for select using (true);

drop policy if exists careers_read on public.careers;
create policy careers_read on public.careers for select using (true);

grant select on public.skills, public.learning_categories, public.competitions, public.careers
  to anon, authenticated;
grant select on public.player_skills, public.learning_attempts to authenticated;
grant select on public.learning_challenges to authenticated;
grant select on public.projects to anon, authenticated;
grant insert, update, delete on public.projects to authenticated;
grant select on public.competition_entries to anon, authenticated;

-- answer_key must never reach a browser: column-level grant omits it.
revoke all on public.learning_challenges from anon, authenticated;
grant select (
  id, category_slug, tier, difficulty, title, objective, brief, tasks,
  kind, payload, explanation, xp_reward, skill_slug, is_active, created_at
) on public.learning_challenges to authenticated;

revoke all on function public.icon_submit_challenge(uuid, uuid, jsonb) from public, anon;
grant execute on function public.icon_submit_challenge(uuid, uuid, jsonb) to authenticated, service_role;
