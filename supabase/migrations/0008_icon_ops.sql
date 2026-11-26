/* 0008 — operations: shared throttling, reserved handles, error reports.

   Throttling lived in a per-process Map, so a deployment with more than one
   instance let an attacker multiply the allowance by the instance count. This
   table is the shared counter: one atomic upsert per attempt, keyed by whatever
   the route decides (IP, IP+email, action).

   reserved_handles stops impersonation of the project itself before a profile
   can claim the name. It is data, not code, so the list can grow without a
   deployment.

   error_reports is the landing place for client-side failures from
   public/assets/js/monitor.js. It is deliberately small and append-only.
*/

create table if not exists public.rate_limits (
  key       text primary key,
  count     integer not null default 0,
  reset_at  timestamptz not null
);

alter table public.rate_limits enable row level security;

create or replace function public.icon_throttle(
  p_key text,
  p_max integer,
  p_window_seconds integer
)
returns table (allowed boolean, remaining integer, reset_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
  v_reset timestamptz;
begin
  insert into public.rate_limits as rl (key, count, reset_at)
  values (p_key, 1, now() + make_interval(secs => greatest(p_window_seconds, 1)))
  on conflict (key) do update
    set count    = case when rl.reset_at <= now() then 1 else rl.count + 1 end,
        reset_at = case when rl.reset_at <= now()
                        then now() + make_interval(secs => greatest(p_window_seconds, 1))
                        else rl.reset_at end
  returning rl.count, rl.reset_at into v_count, v_reset;

  return query select v_count <= greatest(p_max, 0), greatest(p_max - v_count, 0), v_reset;
end $$;

revoke all on function public.icon_throttle(text, integer, integer) from public;
grant execute on function public.icon_throttle(text, integer, integer)
  to anon, authenticated, service_role;

create table if not exists public.reserved_handles (
  handle text primary key check (handle ~ '^[a-z0-9_]{3,20}$'),
  reason text not null default 'reserved'
);

alter table public.reserved_handles enable row level security;

insert into public.reserved_handles (handle, reason) values
  ('admin', 'role'),
  ('administrator', 'role'),
  ('mod', 'role'),
  ('moderator', 'role'),
  ('staff', 'role'),
  ('support', 'role'),
  ('help', 'support'),
  ('security', 'trust'),
  ('official', 'trust'),
  ('system', 'system'),
  ('root', 'system'),
  ('api', 'system'),
  ('www', 'system'),
  ('mail', 'system'),
  ('email', 'system'),
  ('null', 'system'),
  ('undefined', 'system'),
  ('studenticon', 'brand'),
  ('student_icon', 'brand'),
  ('icon', 'brand'),
  ('arcade', 'brand'),
  ('labs', 'brand'),
  ('pixelpals', 'brand'),
  ('login', 'route'),
  ('signin', 'route'),
  ('signup', 'route'),
  ('logout', 'route'),
  ('account', 'route'),
  ('settings', 'route'),
  ('profile', 'route'),
  ('profiles', 'route'),
  ('learn', 'route'),
  ('skills', 'route'),
  ('onboarding', 'route'),
  ('privacy', 'route'),
  ('terms', 'route'),
  ('about', 'route'),
  ('contact', 'route'),
  ('legal', 'route'),
  ('billing', 'route'),
  ('payments', 'route'),
  ('ads', 'route'),
  ('test', 'test'),
  ('guest', 'test'),
  ('player', 'generic'),
  ('players', 'generic')
on conflict (handle) do nothing;

create table if not exists public.error_reports (
  id         bigserial primary key,
  created_at timestamptz not null default now(),
  source     text not null default 'client',
  message    text not null,
  stack      text,
  url        text,
  user_id    uuid,
  context    jsonb not null default '{}'::jsonb
);

alter table public.error_reports enable row level security;

create index if not exists error_reports_created_at_idx
  on public.error_reports (created_at desc);
