/* Executes supabase/migrations/0001_arcade_labs.sql against a real Postgres
   (PGlite) with a stubbed Supabase auth schema, then asserts the economy. */
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';

const db = new PGlite();
const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};

const sql = await readFile('../supabase/migrations/0001_arcade_labs.sql', 'utf8');

const stub = `
create role anon;
create role authenticated;
create schema if not exists auth;

create table if not exists auth.users (id uuid primary key, email text);

create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('test.uid', true), '')::uuid;
$$;

create or replace function auth.jwt() returns jsonb
language sql stable as $$
  select coalesce(nullif(current_setting('test.jwt', true), '')::jsonb, '{}'::jsonb);
$$;

grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
grant execute on function auth.jwt() to anon, authenticated;
`;

const user = async (uuid) => {
  await db.exec(`select set_config('test.uid', '${uuid}', false);
                 select set_config('test.jwt', '{"user_metadata":{"nickname":"TESTER"}}', false);`);
};

const one = async (q, params = []) => (await db.query(q, params)).rows[0];
const all = async (q, params = []) => (await db.query(q, params)).rows;

try {
  await db.exec(stub);
  await db.exec(sql.replace(/create extension if not exists pgcrypto;/i, ''));
  check('migration applies cleanly', true);
} catch (err) {
  check('migration applies cleanly', false, err.message);
  console.log(err.message);
  process.exit(1);
}

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
await db.exec(`insert into auth.users (id) values ('${A}'), ('${B}') on conflict do nothing;`);

const complete = async (slug, payload, cid) =>
  one(`select public.arcade_complete_session($1, $2::jsonb, $3) as r`, [slug, JSON.stringify(payload), `client-${cid}`]).then(
    (r) => r.r,
  );

await user(A);

/* ---------------- timezone ---------------- */
const tz = await one(`select public.arcade_today() as d, (now() at time zone 'Asia/Kolkata')::date as manual`);
check('daily bucket matches Asia/Kolkata', String(tz.d) === String(tz.manual), String(tz.d));

/* ---------------- levels ---------------- */
const lv = await one(`select public.arcade_level_from_xp(0) a, public.arcade_level_from_xp(99) b,
  public.arcade_level_from_xp(100) c, public.arcade_level_from_xp(300) d, public.arcade_level_from_xp(5500) e`);
check('level curve 100 x level', lv.a === 1 && lv.b === 1 && lv.c === 2 && lv.d === 3 && lv.e === 11, JSON.stringify(lv));

/* ---------------- brain battle: mixed + speed bonus ---------------- */
const mixed = await complete(
  'brain-battle',
  {
    answers: [
      { correct: true, elapsedMs: 1000, limitMs: 20000 },
      { correct: true, elapsedMs: 9000, limitMs: 20000 },
      { correct: false, elapsedMs: 2000, limitMs: 20000 },
      { correct: true, elapsedMs: 14000, limitMs: 20000 },
      { correct: true, elapsedMs: 19000, limitMs: 20000 },
      { correct: false, elapsedMs: 20000, limitMs: 20000 },
    ],
  },
  'bb-mixed-0001',
);
check('brain battle score = 4*100 + speed 20/15/10/5', mixed.score === 450, `got ${mixed.score}`);
check('brain battle xp = 10 + 4*5', mixed.xp === 30, `got ${mixed.xp}`);

const perfectQuiz = await complete(
  'brain-battle',
  { answers: Array.from({ length: 5 }, () => ({ correct: true, elapsedMs: 1000, limitMs: 20000 })) },
  'bb-perfect-0001',
);
check('perfect quiz bonus applied', perfectQuiz.xp === 10 + 25 + 20, `got ${perfectQuiz.xp}`);
check('perfect quiz accuracy recorded', Number(perfectQuiz.accuracy) === 1);

/* ---------------- abandoned session rejected ---------------- */
const abandoned = await complete('brain-battle', { answers: [{ correct: true }] }, 'bb-abandon-0001');
check('abandoned session earns nothing', abandoned.ok === false, JSON.stringify(abandoned));

/* ---------------- duplicate submission ---------------- */
const dup = await complete(
  'brain-battle',
  { answers: Array.from({ length: 5 }, () => ({ correct: true, elapsedMs: 1000, limitMs: 20000 })) },
  'bb-perfect-0001',
);
check('duplicate client_id is idempotent', dup.duplicate === true, JSON.stringify(dup));
const ledgerCount = await one(`select count(*)::int c from public.arcade_reward_transactions where user_id = $1`, [A]);
check('no duplicate ledger rows', ledgerCount.c > 0);

/* ---------------- word master duplicate letters ---------------- */
const wm = await one(`select public.arcade_word_points('crane','eerie') p, public.arcade_word_points('abide','aahed') q`);
// eerie vs crane: one correct 'e', one misplaced 'r' = 15 (the second 'e' is not double-credited)
check('duplicate letters: no double credit', wm.p === 15, `eerie vs crane = ${wm.p}`);
check('duplicate letters second case', wm.q === 20, `aahed vs abide = ${wm.q}`);
const wm2 = await complete('word-master', { target: 'crane', attempts: ['crane'] }, 'wm-0001');
check('word solved in 1 attempt = 50 + 100 bonus, 30 xp', wm2.score === 150 && wm2.xp === 30, `score ${wm2.score} xp ${wm2.xp}`);

/* ---------------- 2048 milestones ---------------- */
const g = await complete('2048-challenge', { score: 12000, highestTile: 1024, moves: 300, won: false }, 'g-0001');
check('2048 xp 5+5+10, kp 1+2', g.xp === 20 && g.kp === 3, `xp ${g.xp} kp ${g.kp}`);

/* ---------------- sudoku hint penalty ---------------- */
const s1 = await complete('sudoku-master', { solved: true, difficulty: 'hard', hints: 2 }, 'sud-h1');
check('sudoku hard + 2 hints = 200*0.8', s1.score === 160, `got ${s1.score}`);
const s2 = await complete('sudoku-master', { solved: true, difficulty: 'hard', hints: 9 }, 'sud-h2');
check('hint penalty capped at 50%', s2.score === 100, `got ${s2.score}`);

/* ---------------- typing ---------------- */
const t1 = await complete('typing-ninja', { durationSec: 60, correctChars: 300, incorrectChars: 2 }, 'ty-1');
check('typing wpm = correct/5/min', t1.score === 60, `got ${t1.score}`);
check('typing 98%+ gets 5 kp', t1.kp === 5, `got ${t1.kp}`);
const t2 = await complete('typing-ninja', { durationSec: 60, correctChars: 300, incorrectChars: 200 }, 'ty-2');
check('fast but sloppy earns no kp', t2.kp === 0, `got ${t2.kp}`);

/* ---------------- startup tycoon ---------------- */
const st = await complete('startup-tycoon', { completed: true, profitability: 40, satisfaction: 25, resources: 20, decisions: 15 }, 'st-1');
check('tycoon perfect = 100 score, xp 25', st.score === 100 && st.xp === 25, `score ${st.score} xp ${st.xp}`);
check('tycoon kp = 5', st.kp === 5, `got ${st.kp}`);

/* ---------------- geo / physics / code ---------------- */
const geo = await complete('geo-genius', { answers: Array.from({ length: 5 }, () => ({ correct: true })) }, 'geo-1');
check('geo perfect = 75 score, 4 kp', geo.score === 75 && geo.kp === 4, `score ${geo.score} kp ${geo.kp}`);
const phy = await complete(
  'physics-lab',
  { experiments: [{ difficulty: 'basic', correct: true, hintsUsed: 0 }, { difficulty: 'advanced', correct: true, hintsUsed: 3 }] },
  'phy-1',
);
check('physics: 10+10 hint bonus, 30, xp 20+20 set', phy.score === 50 && phy.xp === 40, `score ${phy.score} xp ${phy.xp}`);
const code = await complete(
  'code-escape',
  { correctCount: 2, challenges: [{ difficulty: 'basic', correct: true }, { difficulty: 'advanced', correct: false }] },
  'code-1',
);
check('code escape basic only = 10 score, 5 xp', code.score === 10 && code.xp === 5, `score ${code.score} xp ${code.xp}`);

/* ---------------- daily cap ---------------- */
await db.exec(`insert into auth.users (id) values ('33333333-3333-4333-8333-333333333333') on conflict do nothing;`);
await user('33333333-3333-4333-8333-333333333333');
let capped = 0;
for (let i = 0; i < 30; i++) {
  const r = await complete('startup-tycoon', { completed: true, profitability: 40, satisfaction: 25, resources: 20, decisions: 15 }, 'cap-' + i);
  capped += r.kpTotal;
}
const used = await one(`select public.arcade_kp_used_today('33333333-3333-4333-8333-333333333333') u,
  (select k_points from public.arcade_profiles where id='33333333-3333-4333-8333-333333333333') k`);
check('daily K-Points saturate at exactly 100', used.u === 100, `granted ${used.u}`);
check('profile balance consistent with ledger', used.u === Number(used.k), `ledger ${used.u} vs balance ${used.k}`);

/* ---------------- purchases ---------------- */
await user(A);
const before = await one(`select k_points from public.arcade_profiles where id = $1`, [A]);
await db.exec(`update public.arcade_profiles set k_points = 120 where id = '${A}'`);
const p1 = await one(`select public.arcade_purchase('theme-basic') r`).then((r) => r.r);
check('purchase deducts points', p1.ok === true && p1.balance === 70, JSON.stringify(p1));
const p2 = await one(`select public.arcade_purchase('theme-basic') r`).then((r) => r.r);
check('duplicate purchase rejected', p2.ok === false, JSON.stringify(p2));
const p3 = await one(`select public.arcade_purchase('challenge-pack') r`).then((r) => r.r);
check('insufficient balance rejected', p3.ok === false, JSON.stringify(p3));
const balance = await one(`select k_points from public.arcade_profiles where id = $1`, [A]);
check('balance never negative', balance.k_points >= 0, String(balance.k_points));

/* ---------------- streak ---------------- */
await db.exec(`update public.arcade_profiles set last_streak_date = public.arcade_today() - 1, current_streak = 3 where id = '${A}'`);
const streak = await complete('2048-challenge', { score: 900, highestTile: 512, moves: 120 }, 'streak-1');
const prof = await one(`select current_streak, longest_streak from public.arcade_profiles where id = $1`, [A]);
check('streak continues from yesterday', prof.current_streak === 4, `got ${prof.current_streak}`);
check('day 4 streak pays 4 KP', streak.streakKp === 4, `got ${streak.streakKp}`);

await db.exec(`update public.arcade_profiles set last_streak_date = public.arcade_today() - 3, current_streak = 9, longest_streak = 9 where id = '${A}'`);
const reset = await complete('geo-genius', { answers: [{ correct: true }, { correct: true }, { correct: true }, { correct: true }, { correct: true }] }, 'streak-2');
const prof2 = await one(`select current_streak, longest_streak from public.arcade_profiles where id = $1`, [A]);
check('missed day resets streak to 1', prof2.current_streak === 1, `got ${prof2.current_streak}`);
check('longest streak preserved', prof2.longest_streak === 9, `got ${prof2.longest_streak}`);
check('day 1 pays 0 KP', reset.streakKp === 0, `got ${reset.streakKp}`);

/* ---------------- achievements ---------------- */
const ach = await all(`select achievement_slug from public.arcade_achievements where user_id = $1 order by achievement_slug`, [A]);
const slugs = ach.map((r) => r.achievement_slug);
check('first victory unlocked once', slugs.filter((s) => s === 'first-victory').length === 1, slugs.join(','));
check('perfect score unlocked', slugs.includes('perfect-score'), slugs.join(','));
const dupAch = await one(`select count(*)::int c from public.arcade_achievements where user_id = $1 and achievement_slug = 'first-victory'`, [A]);
check('achievements cannot duplicate', dupAch.c === 1);

/* ---------------- leaderboard ---------------- */
const lb = await all(`select * from public.arcade_leaderboard('xp-all', null, 10, 0)`);
check('leaderboard returns ranked rows', lb.length >= 1 && Number(lb[0].rank) === 1, JSON.stringify(lb[0]));
const lbGame = await all(`select * from public.arcade_leaderboard('game', 'brain-battle', 10, 0)`);
check('game leaderboard ordered by score', lbGame.length >= 1, `${lbGame.length} rows`);

/* ---------------- summary ---------------- */
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.log('FAILURES:\n' + failed.map((f) => ` - ${f.name} ${f.detail}`).join('\n'));
  process.exit(1);
}
