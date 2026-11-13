/* Local database for development.

   The schema is the real one: migrations 0003-0006 apply unchanged to a
   Postgres-compatible engine (PGlite), so constraints, triggers, functions
   and policy definitions are exercised long before a Supabase project exists.

   Differences from production, stated openly:
     * The API connects as the owner, so RLS does not apply to it. Every query
       is scoped by user_id in code instead. Supabase's service role behaves
       the same way.
     * auth.users is a two-column stub. Supabase Auth owns the real table.
*/

import { PGlite } from '@electric-sql/pglite';
import { readFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

export const MIGRATIONS = [
  '0003_icon_core.sql',
  '0004_icon_student.sql',
  '0005_icon_startup.sql',
  '0006_icon_finance.sql',
  '0007_icon_challenges.sql',
];

/* ':memory:' runs the whole schema in RAM: nothing on disk, gone when the
   process exits. The test suites use it so a full run costs no storage. */
const MEMORY = process.env.ICON_DB_PATH === ':memory:';

export const DB_PATH = MEMORY
  ? ':memory:'
  : process.env.ICON_DB_PATH || resolve(ROOT, '.data/icon.db');

const STUBS = `
do $$ begin if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if; end $$;
do $$ begin if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if; end $$;
do $$ begin if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if; end $$;

create schema if not exists auth;
create table if not exists auth.users (
  id         uuid primary key,
  email      text,
  created_at timestamptz not null default now()
);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('icon.uid', true), '')::uuid; $$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
`;

let booting = null;

export function getDb() {
  if (!booting) booting = boot();
  return booting;
}

async function boot() {
  if (!MEMORY) await mkdir(dirname(DB_PATH), { recursive: true });

  const db = new PGlite(MEMORY ? undefined : DB_PATH);
  await db.waitReady;

  await db.exec(STUBS);
  await db.exec(`
    create table if not exists public.icon_migrations (
      name       text primary key,
      applied_at timestamptz not null default now()
    );
  `);

  for (const file of MIGRATIONS) {
    const done = await db.query('select 1 from public.icon_migrations where name = $1', [file]);
    if (done.rows.length) continue;

    const sql = await readFile(resolve(ROOT, 'supabase/migrations', file), 'utf8');
    await db.exec(sql.replace(/create extension if not exists pgcrypto;/i, ''));
    await db.query('insert into public.icon_migrations (name) values ($1)', [file]);
  }

  return db;
}

/** Runs a function with the session user available to auth.uid() inside SQL. */
export async function asUser(db, userId, fn) {
  await db.exec(`select set_config('icon.uid', '${userId}', false);`);
  try {
    return await fn(db);
  } finally {
    await db.exec("select set_config('icon.uid', '', false);");
  }
}
