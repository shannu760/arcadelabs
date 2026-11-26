/* Checks against a real hosted Postgres.

     npm run test:pg            # uses SUPABASE_DB_URL / DATABASE_URL
     npm run test:pg -- --write # also exercises the write path

   The rest of the suite runs on PGlite, which is Postgres compiled to WASM and
   is genuinely the same SQL — but a hosted server is what production runs, and
   the differences that bite (permissions on auth.users, the pooler's transaction
   mode, SSL) only appear there. This script reports what it could not check
   instead of pretending it passed.
*/
import { getDb, DB_KIND, DB_TARGET, MIGRATIONS } from '../server/api/db.mjs';

const connection = String(process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || '').trim();

if (!connection) {
  console.log('SKIP  no SUPABASE_DB_URL / DATABASE_URL: nothing to connect to.');
  process.exit(0);
}

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};

// Applies any migration that has not run yet, exactly as the API does on boot.
const db = await getDb();
check('engine is hosted postgres', DB_KIND === 'postgres', DB_TARGET);

try {
  const { rows: applied } = await db.query('select name from public.icon_migrations order by name');
  const names = applied.map((row) => row.name);
  check('every migration is applied', MIGRATIONS.every((file) => names.includes(file)), names.join(', '));

  const { rows: ranks } = await db.query('select count(*)::int c from public.icon_ranks');
  check('rank seed is present', ranks[0].c >= 5, `${ranks[0].c} ranks`);

  const { rows: careers } = await db.query('select count(*)::int c from public.careers');
  check('career seed is present', careers[0].c > 0, `${careers[0].c} careers`);

  const { rows: reserved } = await db.query('select count(*)::int c from public.reserved_handles');
  check('reserved handles are loaded', reserved[0].c >= 20, `${reserved[0].c} handles`);

  const { rows: reports } = await db.query("select to_regclass('public.error_reports') is not null as ok");
  check('error_reports table exists', reports[0].ok === true);

  // Shared throttle: two attempts under a limit of two, a third refused.
  const key = `test:${Date.now()}:${Math.random().toString(36).slice(2)}`;
  const allowed = [];
  for (let i = 0; i < 3; i += 1) {
    const { rows } = await db.query('select * from public.icon_throttle($1, 2, 60)', [key]);
    allowed.push(rows[0].allowed);
  }
  check('shared throttle allows two and refuses the third', allowed.join(',') === 'true,true,false', allowed.join(','));

  await db.query('delete from public.rate_limits where key = $1', [key]).catch(() => null);

  // Arcade rewards still run on SQL functions and still need a session id.
  const { rows: board } = await db.query("select * from public.arcade_leaderboard('xp-all', null, 3, 0)");
  check('arcade leaderboard function answers', Array.isArray(board), `${board.length} rows`);
} catch (err) {
  check('read checks', false, err.message);
}

/* The write path creates a disposable player and throws it away. On a Supabase
   project the connection may not be allowed to write auth.users, in which case
   this is reported as skipped — not passed. */
const wantWrite = process.argv.includes('--write');
if (wantWrite) {
  const userId = crypto.randomUUID();
  const ROLLBACK = Symbol('rollback');

  try {
    await db.transaction(async (tx) => {
      await tx.query('insert into auth.users (id) values ($1)', [userId]);
      await tx.query(
        "insert into public.profiles (id, handle, display_name) values ($1, $2, 'Test Player')",
        [userId, `t${Date.now().toString(36)}`]
      );
      await tx.query('insert into public.player_interests (user_id, interest) values ($1, $2)', [
        userId,
        'testing',
      ]);

      const { rows } = await tx.query(
        `insert into public.projects (user_id, title, slug) values ($1, 'Test project', 'test-project')
         returning id`,
        [userId]
      );
      check('a player, an interest and a project can be written', rows.length === 1);

      throw ROLLBACK;
    });
  } catch (err) {
    if (err === ROLLBACK) {
      check('the write test rolled back cleanly', true);
    } else if (/permission denied|row-level security/i.test(err.message)) {
      console.log(`SKIP  write path needs a role that may write auth.users — ${err.message}`);
    } else {
      check('write path', false, err.message);
    }
  }

  const { rows } = await db.query('select count(*)::int c from public.profiles where id = $1', [userId]);
  check('the disposable player is gone', rows[0].c === 0);
} else {
  console.log('NOTE  write path not checked; run with --write to include it.');
}

const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed against ${DB_TARGET}`);
if (failed.length) process.exit(1);
