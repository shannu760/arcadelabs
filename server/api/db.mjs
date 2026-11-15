/* Where the API keeps its data — two engines, one interface.

     pglite    The default. Embedded Postgres written to .data/icon.db: no
               install, no service. Local development, and the tests
               (ICON_DB_PATH=:memory: runs the schema in RAM only).
     postgres  A hosted server, chosen when SUPABASE_DB_URL or DATABASE_URL is
               set. This is how the deployed API runs: serverless has no disk
               to write an embedded database to, and two instances must see the
               same rows.

   Either way the schema is the same SQL. Migrations 0003-0007 apply unchanged
   to both engines, so the constraints, triggers, functions and policies the
   tests exercise are the ones production runs.

   Differences from a real Supabase project, stated openly:
     * The API connects as the owner (like Supabase's service role), so RLS
       does not apply to it. Every query is scoped by user_id in code instead.
     * auth.users is a two-column stub on the local engine. On Postgres it is
       Supabase's real table, which this API reads but never writes — someone
       signing up through Supabase Auth creates that row.
*/

import { PGlite } from '@electric-sql/pglite';
import { readFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { HttpError } from './http.mjs';

const { Pool } = pg;

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

export const MIGRATIONS = [
  '0003_icon_core.sql',
  '0004_icon_student.sql',
  '0005_icon_startup.sql',
  '0006_icon_finance.sql',
  '0007_icon_challenges.sql',
];

/* A hosted server wins over the embedded engine. */
const CONNECTION = String(process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || '').trim();

export const DB_KIND = CONNECTION ? 'postgres' : 'pglite';

/* ':memory:' runs the whole schema in RAM: nothing on disk, gone when the
   process exits. The test suites use it so a full run costs no storage. */
const MEMORY = process.env.ICON_DB_PATH === ':memory:';

export const DB_PATH = MEMORY
  ? ':memory:'
  : process.env.ICON_DB_PATH || resolve(ROOT, '.data/icon.db');

/* Reported by /api/health. Host and database name only: a connection string
   carries a password and must never reach a response. */
export const DB_TARGET = DB_KIND === 'postgres' ? connectionTarget(CONNECTION) : DB_PATH;

function connectionTarget(connection) {
  try {
    const url = new URL(connection);
    const port = url.port ? `:${url.port}` : '';
    return `${url.hostname}${port}/${url.pathname.replace(/^\//, '')}`;
  } catch {
    return 'postgres';
  }
}

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

const MIGRATIONS_TABLE = `
  create table if not exists public.icon_migrations (
    name       text primary key,
    applied_at timestamptz not null default now()
  );
`;

/* Cold starts can overlap: one migrator at a time, keyed by a constant nobody
   else uses. */
const LOCK_KEY = 727272;

let booting = null;

export function getDb() {
  if (!booting) booting = boot();
  return booting;
}

function boot() {
  // A serverless filesystem cannot hold the embedded database, so a deployment
  // without a connection string has no data at all. Say that, rather than
  // failing on a read-only disk.
  if (DB_KIND === 'pglite' && process.env.VERCEL) {
    throw new HttpError(
      503,
      'db_not_configured',
      'This deployment has no database configured yet. Set SUPABASE_DB_URL to a Postgres connection string.'
    );
  }

  return DB_KIND === 'postgres' ? bootPostgres() : bootPGlite();
}

async function bootPGlite() {
  if (!MEMORY) await mkdir(dirname(DB_PATH), { recursive: true });

  const db = new PGlite(MEMORY ? undefined : DB_PATH);
  await db.waitReady;

  await db.exec(STUBS);
  await db.exec(MIGRATIONS_TABLE);

  for (const file of MIGRATIONS) {
    const done = await db.query('select 1 from public.icon_migrations where name = $1', [file]);
    if (done.rows.length) continue;

    const sql = await readFile(resolve(ROOT, 'supabase/migrations', file), 'utf8');
    await db.exec(sql.replace(/create extension if not exists pgcrypto;/i, ''));
    await db.query('insert into public.icon_migrations (name) values ($1)', [file]);
  }

  return db;
}

async function bootPostgres() {
  const pool = new Pool({
    connectionString: CONNECTION,
    max: 3,
    // Managed Postgres presents a chain node does not ship; the connection is
    // still encrypted. Opt out with sslmode=disable for a plain local server.
    ssl: /sslmode=disable/.test(CONNECTION) ? false : { rejectUnauthorized: false },
  });

  const client = await pool.connect();
  try {
    await client.query('select pg_advisory_lock($1)', [LOCK_KEY]);

    // Supabase owns the auth schema and its roles; only our own bookkeeping is
    // created here. The local stub above exists because nothing else does.
    await client.query(MIGRATIONS_TABLE);

    for (const file of MIGRATIONS) {
      const done = await client.query('select 1 from public.icon_migrations where name = $1', [
        file,
      ]);
      if (done.rows.length) continue;

      const sql = await readFile(resolve(ROOT, 'supabase/migrations', file), 'utf8');
      await client.query(sql.replace(/create extension if not exists pgcrypto;/i, ''));
      await client.query('insert into public.icon_migrations (name) values ($1)', [file]);
    }
  } finally {
    await client.query('select pg_advisory_unlock($1)', [LOCK_KEY]).catch(() => null);
    client.release();
  }

  return pgDb(pool);
}

/* The routes only ever use query(), exec() and transaction(); this is that
   interface over a pool. No named prepared statements, so it is happy behind a
   transaction-mode pooler. */
function pgDb(pool) {
  const session = (client) => ({
    query: (sql, params) => client.query(sql, params),
    exec: (sql) => client.query(sql),
  });

  return {
    kind: 'postgres',

    query: (sql, params) => pool.query(sql, params),
    exec: (sql) => pool.query(sql),

    async transaction(fn) {
      const client = await pool.connect();
      try {
        await client.query('begin');
        const out = await fn(session(client));
        await client.query('commit');
        return out;
      } catch (err) {
        await client.query('rollback').catch(() => null);
        throw err;
      } finally {
        client.release();
      }
    },

    async asUser(userId, fn) {
      const client = await pool.connect();
      try {
        await client.query("select set_config('icon.uid', $1, false)", [userId]);
        return await fn(session(client));
      } finally {
        await client.query("select set_config('icon.uid', '', false)").catch(() => null);
        client.release();
      }
    },
  };
}

/** Runs a function with the session user available to auth.uid() inside SQL. */
export async function asUser(db, userId, fn) {
  if (db.asUser) return db.asUser(userId, fn);

  await db.exec(`select set_config('icon.uid', '${userId}', false);`);
  try {
    return await fn(db);
  } finally {
    await db.exec("select set_config('icon.uid', '', false);");
  }
}

/* The profile FK needs an auth row. Locally that is the stub; on Postgres it is
   Supabase's real table, and inventing a row there would mean writing into an
   auth system this API does not own. */
export async function ensureAuthRow(db, userId) {
  if (DB_KIND === 'postgres') return;
  await db.query('insert into auth.users (id) values ($1) on conflict (id) do nothing', [userId]);
}
