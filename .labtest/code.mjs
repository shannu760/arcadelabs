/* Verifies the Code Escape bank, unlock ladder and scoring against real
   Postgres (PGlite) with a stubbed Supabase auth schema. */
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { CHALLENGES, LEVELS, unlockedLevel, levelProgress } from '../public/assets/js/arcade/data/code-challenges.js';
import { computeReward } from '../public/assets/js/arcade/rules.js';

const db = new PGlite();
const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};

const stub = `
create role anon;
create role authenticated;
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key, email text);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('test.uid', true), '')::uuid; $$;
create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('test.jwt', true), '')::jsonb, '{}'::jsonb); $$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
grant execute on function auth.jwt() to anon, authenticated;
`;

await db.exec(stub);
for (const file of ['0001_arcade_labs.sql', '0002_code_escape.sql']) {
  const sql = await readFile(`../supabase/migrations/${file}`, 'utf8');
  await db.exec(sql.replace(/create extension if not exists pgcrypto;/i, ''));
  check(`${file} applies cleanly`, true);
}

const one = async (q, p = []) => (await db.query(q, p)).rows[0];
const all = async (q, p = []) => (await db.query(q, p)).rows;
const asUser = async (id) => db.exec(`select set_config('test.uid', '${id}', false);`);

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
await db.exec(`insert into auth.users (id) values ('${A}'), ('${B}') on conflict do nothing;`);

/* ---------------- bank ---------------- */
const total = await one(`select count(*)::int c from public.arcade_code_challenges where is_active`);
check('all 40 challenges seeded', total.c === CHALLENGES.length, `${total.c} rows`);

const perLevel = await all(`select level, count(*)::int c, min(jsonb_array_length(options)) minopts from public.arcade_code_challenges group by level order by level`);
check('five levels with 8 each', perLevel.length === 5 && perLevel.every((r) => r.c === 8), JSON.stringify(perLevel.map((r) => r.c)));
check('every question has four options', perLevel.every((r) => r.minopts === 4));

const langs = await all(`select language, count(*)::int c from public.arcade_code_challenges group by language order by language`);
check('python, c and java are represented', langs.length === 3 && langs.every((r) => r.c > 0), JSON.stringify(langs));

const diff = await all(`select distinct level, difficulty from public.arcade_code_challenges order by level`);
check('difficulty tracks the level', diff.map((r) => r.difficulty).join(',') === 'basic,basic,intermediate,intermediate,advanced', diff.map((r) => r.difficulty).join(','));

const badAnswer = await one(`select count(*)::int c from public.arcade_code_challenges where answer >= jsonb_array_length(options) or answer < 0`);
check('no answer index out of range', badAnswer.c === 0);

/* ---------------- unlocks ---------------- */
await asUser(A);
const freshUnlocked = await one(`select public.arcade_code_unlocked($1) l`, [A]);
check('a new player only has level 1', freshUnlocked.l === 1, String(freshUnlocked.l));

const lvl1 = CHALLENGES.filter((c) => c.level === 1).map((c) => c.id);
const four = await one(`select public.arcade_code_solve($1::text[]) r`, [lvl1.slice(0, 4)]);
check('four solves do not unlock level 2', four.r.unlocked === 1 && four.r.added === 4, JSON.stringify(four.r));

const fifth = await one(`select public.arcade_code_solve($1::text[]) r`, [lvl1.slice(4, 5)]);
check('the fifth solve opens level 2', fifth.r.unlocked === 2 && fifth.r.added === 1, JSON.stringify(fifth.r));

const dup = await one(`select public.arcade_code_solve($1::text[]) r`, [lvl1.slice(0, 2)]);
check('repeat solves are idempotent', dup.r.added === 0, JSON.stringify(dup.r));

const bogus = await one(`select public.arcade_code_solve(array['made-up-slug', 'l9-boss']) r`);
check('invented slugs earn nothing', bogus.r.added === 0 && bogus.r.unlocked === 2, JSON.stringify(bogus.r));

const progress = await one(`select public.arcade_code_progress() p`);
check('progress returns solved ids and level', progress.p.solved.length === 5 && progress.p.unlocked === 2, JSON.stringify(progress.p));

const stays = await one(`select public.arcade_code_unlocked($1) l`, [A]);
check('unlock level is stable on re-read', stays.l === 2, String(stays.l));

await asUser(B);
const otherUser = await one(`select public.arcade_code_progress() p`);
check('another player is unaffected', otherUser.p.solved.length === 0 && otherUser.p.unlocked === 1, JSON.stringify(otherUser.p));

/* ---------------- client ladder agrees ---------------- */
const clientUnlocked = unlockedLevel(lvl1.slice(0, 5));
check('client ladder matches the database', clientUnlocked === 2, String(clientUnlocked));
const lp = levelProgress(1, lvl1.slice(0, 5));
check('level progress counts 5/8', lp.solved === 5 && lp.total === 8, `${lp.solved}/${lp.total}`);
check('level 3 still needs level 2 solves', levelProgress(3, lvl1.slice(0, 5)).unlocked === false);

/* ---------------- scoring ---------------- */
const scored = computeReward('code-escape', {
  challenges: [
    { difficulty: 'basic', correct: true },
    { difficulty: 'intermediate', correct: true },
    { difficulty: 'advanced', correct: false },
  ],
});
check('code escape scores by difficulty', scored.score === 30 && scored.xp === 15, `score ${scored.score} xp ${scored.xp}`);
check('code escape hit rate recorded', scored.accuracy === 2 / 3, String(scored.accuracy));
const clean = computeReward('code-escape', {
  challenges: [{ difficulty: 'basic', correct: true }, { difficulty: 'advanced', correct: true }],
});
check('perfect run adds the 20 xp bonus', clean.xp === 5 + 15 + 20, String(clean.xp));

/* ---------------- summary ---------------- */
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) process.exit(1);
