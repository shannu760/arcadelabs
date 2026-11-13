/* Student Icon F2 — schema, ledger and RLS proofs against real Postgres (PGlite)
   with a stubbed Supabase auth schema.

   What this proves:
     * migrations 0003-0007 apply cleanly and seed reference data
     * a browser role can never write money, launch a company or award XP
     * RLS hides other players' rows and blocks cross-user writes
     * the ledger is append-only, idempotent and currency-consistent
     * valuation and revenue are separate milestones and never mix currencies
*/
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';

const db = new PGlite();
const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};
const num = (v) => Number(v);

const one = async (q, p = []) => (await db.query(q, p)).rows[0];
const all = async (q, p = []) => (await db.query(q, p)).rows;
const fails = async (q, p = []) => {
  try {
    await db.query(q, p);
    return null;
  } catch (e) {
    return e.message;
  }
};

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

const asUser = async (uid, fn) => {
  await db.exec(`select set_config('test.uid', '${uid}', false); set role authenticated;`);
  try {
    return await fn();
  } finally {
    await db.exec('reset role;');
  }
};
const asOwner = async (fn) => {
  await db.exec(`select set_config('test.uid', '', false); reset role;`);
  return fn();
};

/* ---------------- stub + migrations ---------------- */

await db.exec(`
create role anon;
create role authenticated;
create role service_role;
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key, email text);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('test.uid', true), '')::uuid; $$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
`);

const FILES = [
  '0003_icon_core.sql',
  '0004_icon_student.sql',
  '0005_icon_startup.sql',
  '0006_icon_finance.sql',
  '0007_icon_challenges.sql',
];

let applied = true;
for (const file of FILES) {
  // Resolved from this file, not the working directory, so the suite runs the
  // same way from the project root and from .labtest/.
  const sql = await readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8');
  try {
    await db.exec(sql.replace(/create extension if not exists pgcrypto;/i, ''));
    check(`${file} applies cleanly`, true);
  } catch (e) {
    check(`${file} applies cleanly`, false, e.message);
    applied = false;
    break;
  }
}
if (!applied) {
  console.log('\n0 checks passed: migrations did not apply');
  process.exit(1);
}

/* ---------------- seeds ---------------- */

const ranks = await one('select count(*)::int c from public.icon_ranks');
check('11 ranks seeded', ranks.c === 11, `${ranks.c} rows`);

const industries = await one('select count(*)::int c, count(*) filter (where is_full_simulation)::int full from public.industries');
check('20 industries seeded', industries.c === 20, `${industries.c} rows`);
check('exactly four industries have full mechanics', industries.full === 4, `${industries.full} full`);

const categories = await one('select count(*)::int c from public.learning_categories');
check('15 learning categories seeded', categories.c === 15, `${categories.c} rows`);

const challenges = await one(
  'select count(*)::int c, count(distinct skill_slug)::int skills, count(distinct category_slug)::int cats from public.learning_challenges'
);
check('nine challenges seeded, each naming a skill', challenges.c === 9 && challenges.skills > 0, `${challenges.c} challenges, ${challenges.skills} skills, ${challenges.cats} categories`);

const answerKey = await one(
  `select count(*)::int c from public.learning_challenges where answer_key = '{}'::jsonb or skill_slug is null`
);
check('every challenge has an answer key and a skill', answerKey.c === 0, `${answerKey.c} missing`);

/* ---------------- identity ---------------- */

await db.exec(`insert into auth.users (id) values ('${A}'), ('${B}');`);

await asOwner(async () => {
  await db.query(`insert into public.profiles (id, handle, display_name, country, education_stage)
                  values ($1, 'ada', 'Ada Lovelace', 'AR', 'university')`, [A]);
  await db.query(`insert into public.profiles (id, handle, display_name, visibility)
                  values ($1, 'grace', 'Grace Hopper', 'unlisted')`, [B]);
  return true;
});

const badHandle = await fails(
  `insert into public.profiles (id, handle, display_name) values ('33333333-3333-4333-8333-333333333333', 'Bad Handle!', 'X')`
);
check('handle format is enforced', /check constraint|violates/i.test(badHandle || ''), badHandle ? 'rejected' : 'accepted');

const dupHandle = await fails(
  `insert into public.profiles (id, handle, display_name) values ('44444444-4444-4444-8444-444444444444', 'ada', 'Copycat')`
);
check('handles are unique', /duplicate|unique/i.test(dupHandle || ''), dupHandle ? 'rejected' : 'accepted');

/* ---------------- xp ---------------- */

const first = await asOwner(() => one(`select public.icon_award_xp($1, 'test', 'one', 100, 'k1') r`, [A]));
check('xp is awarded once', first.r.awarded === true && num(first.r.xp) === 100, JSON.stringify(first.r));

const again = await asOwner(() => one(`select public.icon_award_xp($1, 'test', 'one', 100, 'k1') r`, [A]));
check('the same award is idempotent', again.r.awarded === false && num(again.r.xp) === 100, JSON.stringify(again.r));

const events = await one('select count(*)::int c from public.xp_events where user_id = $1', [A]);
check('one xp event row per award', events.c === 1, `${events.c} rows`);

const ranked = await asOwner(() => one(`select public.icon_award_xp($1, 'test', 'two', 1000, 'k2') r`, [A]));
const profile = await one('select xp, rank_index from public.profiles where id = $1', [A]);
check('rank follows xp', num(profile.xp) === 1100 && profile.rank_index === 4, `xp ${profile.xp} rank ${profile.rank_index}`);
check('award reports the new rank', ranked.r.rank === 4, JSON.stringify(ranked.r));

const achieve = await asOwner(() => one(`select public.icon_grant_achievement($1, 'first-challenge') a`, [A]));
const achieveAgain = await asOwner(() => one(`select public.icon_grant_achievement($1, 'first-challenge') a`, [A]));
const afterAchievement = await one('select xp from public.profiles where id = $1', [A]);
check('achievement is granted once and pays its bonus',
  achieve.a === true && achieveAgain.a === false && num(afterAchievement.xp) === 1150,
  `xp ${afterAchievement.xp}`);

/* ---------------- rls: profiles ---------------- */

const seenByA = await asUser(A, () => all('select handle from public.profiles order by handle'));
check('a player sees public profiles plus their own only',
  seenByA.length === 1 && seenByA[0].handle === 'ada',
  JSON.stringify(seenByA.map((r) => r.handle)));

const crossInsert = await asUser(A, () =>
  fails(`insert into public.profiles (id, handle, display_name) values ($1, 'mallory', 'Mallory')`, [B])
);
check('cannot create a profile for someone else', crossInsert !== null, crossInsert ? 'blocked' : 'allowed');

const crossUpdate = await asUser(A, async () =>
  (await db.query(`update public.profiles set display_name = 'HACKED' where id = $1`, [B])).affectedRows
);
check('cannot edit someone else profile', crossUpdate === 0, `${crossUpdate} rows`);

const ownUpdate = await asUser(A, async () =>
  (await db.query(`update public.profiles set bio = 'Analyst, engine' where id = $1`, [A])).affectedRows
);
check('can edit my own profile', ownUpdate === 1, `${ownUpdate} rows`);

/* ---------------- rls: challenges ---------------- */

const answerKeyLeak = await asUser(A, () => fails('select answer_key from public.learning_challenges'));
check('answer_key is not selectable by players', answerKeyLeak !== null, answerKeyLeak ? 'blocked' : 'LEAKED');

const publicChallengeCols = await asUser(A, () => all('select title, xp_reward from public.learning_challenges'));
check('challenge questions are readable', Array.isArray(publicChallengeCols), `${publicChallengeCols.length} rows`);

/* ---------------- learning ---------------- */

const ch1 = (await one(`insert into public.learning_challenges
  (category_slug, title, kind, answer_key, xp_reward, skill_slug)
  values ('programming', 'Variables', 'choice', '{"answer":"2"}'::jsonb, 25, 'programming')
  returning id`)).id;
const ch2 = (await one(`insert into public.learning_challenges
  (category_slug, title, kind, answer_key, xp_reward, skill_slug)
  values ('mathematics', 'Sum it', 'number', '{"value":"42"}'::jsonb, 25, 'data')
  returning id`)).id;

const passed = await asUser(A, () =>
  one(`select public.icon_submit_challenge($1, $2, '{"answer":"2"}'::jsonb) r`, [A, ch1])
);
check('a correct answer passes and pays xp',
  passed.r.status === 'passed' && passed.r.passed === true && num(passed.r.xp) === 1175,
  JSON.stringify(passed.r));

const repeated = await asUser(A, () =>
  one(`select public.icon_submit_challenge($1, $2, '{"answer":"2"}'::jsonb) r`, [A, ch1])
);
check('resubmitting a solved challenge pays nothing',
  repeated.r.status === 'repeat' && num(repeated.r.xp) === 1175,
  JSON.stringify(repeated.r));

const wrong = await asUser(A, () =>
  one(`select public.icon_submit_challenge($1, $2, '{"value":"41"}'::jsonb) r`, [A, ch2])
);
check('a wrong answer fails without paying xp',
  wrong.r.status === 'failed' && wrong.r.passed === false && num(wrong.r.xp) === 1175,
  JSON.stringify(wrong.r));

const rightNumber = await asUser(A, () =>
  one(`select public.icon_submit_challenge($1, $2, '{"value":"42"}'::jsonb) r`, [A, ch2])
);
check('numeric answers are scored on the server', rightNumber.r.status === 'passed', JSON.stringify(rightNumber.r));

const skill = await one(`select level, xp from public.player_skills where user_id = $1 and skill_slug = 'programming'`, [A]);
check('passing a challenge raises the skill', skill && skill.xp === 1 && skill.level === 1, JSON.stringify(skill));

const crossSubmit = await asUser(A, () =>
  fails(`select public.icon_submit_challenge($1, $2, '{"answer":"2"}'::jsonb)`, [B, ch1])
);
check('cannot submit on behalf of another player', crossSubmit !== null, crossSubmit ? 'blocked' : 'allowed');

const attemptsForB = await asUser(B, () => all('select id from public.learning_attempts'));
check('another player cannot read my attempts', attemptsForB.length === 0, `${attemptsForB.length} rows`);

/* ---------------- startup + launch ---------------- */

const draft = (await one(`insert into public.startups
  (user_id, step, name, industry_slug, currency, initial_capital_minor, status)
  values ($1, 13, 'Nova', 'saas', 'INR', 50000000, 'draft') returning id`, [A])).id;

const beforeLaunch = await one('select count(*)::int c from public.companies where owner_id = $1', [A]);
check('a draft is not a company yet', beforeLaunch.c === 0, `${beforeLaunch.c} companies`);

const companyId = (await asOwner(() => one('select public.icon_launch_startup($1, $2) c', [A, draft]))).c;
const company = await one('select currency, cash_minor, status from public.companies where id = $1', [companyId]);
check('launch creates the company in its chosen currency',
  company.currency.trim() === 'INR' && num(company.cash_minor) === 50000000 && company.status === 'active',
  JSON.stringify(company));

const product = await one('select count(*)::int c from public.products where company_id = $1', [companyId]);
const member = await one('select role from public.company_members where company_id = $1 and user_id = $2', [companyId, A]);
check('launch creates the first product and the founder seat', product.c === 1 && member.role === 'ceo', `${product.c} products`);

const seedRow = await one(`select kind, amount_minor, balance_after_minor from public.ledger_transactions where company_id = $1`, [companyId]);
check('opening capital is posted to the ledger',
  seedRow.kind === 'seed_capital' && num(seedRow.amount_minor) === 50000000 && num(seedRow.balance_after_minor) === 50000000,
  JSON.stringify(seedRow));

const relaunch = await fails('select public.icon_launch_startup($1, $2)', [A, draft]);
check('a startup cannot launch twice', relaunch !== null, relaunch ? 'blocked' : 'allowed');

const currencyChange = await fails(`update public.companies set currency = 'USD' where id = $1`, [companyId]);
check('company currency is immutable', currencyChange !== null, currencyChange ? 'blocked' : 'allowed');

/* ---------------- ledger ---------------- */

const saleId = (await asOwner(() =>
  one(`select public.icon_post_transaction($1, 'sale', 1000000, 'sale', null, 's1', 'First sale') t`, [companyId])
)).t;
const afterSale = await one('select cash_minor from public.companies where id = $1', [companyId]);
check('a sale increases cash', num(afterSale.cash_minor) === 51000000, String(afterSale.cash_minor));

const balance = await one('select balance_after_minor from public.ledger_transactions where id = $1', [saleId]);
check('balance_after matches the running total', num(balance.balance_after_minor) === 51000000, String(balance.balance_after_minor));

const saleAgain = (await asOwner(() =>
  one(`select public.icon_post_transaction($1, 'sale', 1000000, 'sale', null, 's1', 'Duplicate') t`, [companyId])
)).t;
const rowsAfterDup = await one('select count(*)::int c from public.ledger_transactions where company_id = $1', [companyId]);
const afterDup = await one('select cash_minor from public.companies where id = $1', [companyId]);
check('the same idempotency key posts once',
  saleAgain === saleId && rowsAfterDup.c === 2 && num(afterDup.cash_minor) === 51000000,
  `rows ${rowsAfterDup.c}`);

const refundPositive = await fails(`select public.icon_post_transaction($1, 'refund', 500)`, [companyId]);
check('refunds cannot be positive', refundPositive !== null, refundPositive ? 'blocked' : 'allowed');

const overdraft = await fails(`select public.icon_post_transaction($1, 'salary', -999999999999)`, [companyId]);
check('cash cannot go negative', overdraft !== null, overdraft ? 'blocked' : 'allowed');

const mismatched = await fails(
  `insert into public.ledger_transactions (company_id, kind, amount_minor, currency, balance_after_minor)
   values ($1, 'sale', 1, 'USD', 1)`,
  [companyId]
);
check('ledger rows must match the company currency', mismatched !== null, mismatched ? 'blocked' : 'allowed');

const tamper = await fails(`update public.ledger_transactions set memo = 'edited' where id = $1`, [saleId]);
check('ledger rows cannot be edited', tamper !== null, tamper ? 'blocked' : 'allowed');

const erase = await fails(`delete from public.ledger_transactions where id = $1`, [saleId]);
check('ledger rows cannot be deleted', erase !== null, erase ? 'blocked' : 'allowed');

const driftBefore = await asOwner(() => one('select public.icon_reconcile_ledger($1) d', [companyId]));
check('cash projection matches the ledger', num(driftBefore.d) === 0, String(driftBefore.d));

await db.query('update public.companies set cash_minor = cash_minor + 1 where id = $1', [companyId]);
const driftAfter = await asOwner(() => one('select public.icon_reconcile_ledger($1) d', [companyId]));
check('drift is detected as a signed difference', num(driftAfter.d) === -1, String(driftAfter.d));
await db.query('update public.companies set cash_minor = cash_minor - 1 where id = $1', [companyId]);

/* ---------------- valuation ---------------- */

await asOwner(() => one('select public.icon_recompute_valuation($1) v', [companyId]));
const valued = await one('select valuation_minor from public.companies where id = $1', [companyId]);
check('valuation is computed from revenue', num(valued.valuation_minor) === 12000000, String(valued.valuation_minor));

/* ---------------- milestones ---------------- */

const pick = (s) => (typeof s === 'string' ? JSON.parse(s) : s);
const status0 = pick((await asOwner(() => one('select public.icon_milestone_status($1) s', [A]))).s);
check('fresh progress reports INR only, nothing achieved',
  status0.INR && status0.INR.valuation_achieved === false && status0.INR.revenue_achieved === false,
  JSON.stringify(status0));

// Revenue 20,001,000,000 -> valuation 240,012,000,000: valuation milestone only.
await asOwner(() => one(`select public.icon_post_transaction($1, 'sale', 20000000000, 'sale', null, 'big1') t`, [companyId]));
await asOwner(() => one('select public.icon_recompute_valuation($1) v', [companyId]));
const statusValuation = pick((await asOwner(() => one('select public.icon_milestone_status($1) s', [A]))).s);
check('valuation milestone does not imply revenue milestone',
  statusValuation.INR.valuation_achieved === true &&
  statusValuation.INR.revenue_achieved === false &&
  statusValuation.INR.dual_achieved === false,
  JSON.stringify(statusValuation.INR));

// Push cumulative revenue past the target.
await asOwner(() => one(`select public.icon_post_transaction($1, 'sale', 180000000000, 'sale', null, 'big2') t`, [companyId]));
await asOwner(() => one('select public.icon_recompute_valuation($1) v', [companyId]));
const statusBoth = pick((await asOwner(() => one('select public.icon_milestone_status($1) s', [A]))).s);
check('both milestones in one currency unlock the dual icon',
  statusBoth.INR.valuation_achieved === true &&
  statusBoth.INR.revenue_achieved === true &&
  statusBoth.INR.dual_achieved === true,
  JSON.stringify(statusBoth.INR));

const target = 200000000000;
check('revenue counts ledger sales only', num(statusBoth.INR.revenue_minor) === 200001000000,
  String(statusBoth.INR.revenue_minor));
check('valuation is a separate number', num(statusBoth.INR.valuation_minor) !== num(statusBoth.INR.revenue_minor),
  `valuation ${statusBoth.INR.valuation_minor} vs target ${target}`);

const recorded = await one(`select amount_minor from public.milestone_progress
  where user_id = $1 and kind = 'revenue' and currency = 'INR'`, [A]);
check('milestone progress is recorded', num(recorded.amount_minor) === 200001000000, String(recorded.amount_minor));

/* ---------------- currencies never mix ---------------- */

const usdDraft = (await one(`insert into public.startups
  (user_id, step, name, industry_slug, currency, initial_capital_minor, status)
  values ($1, 13, 'Nova US', 'ai-ml', 'USD', 0, 'draft') returning id`, [A])).id;
const usdCompany = (await asOwner(() => one('select public.icon_launch_startup($1, $2) c', [A, usdDraft]))).c;
await asOwner(() => one(`select public.icon_post_transaction($1, 'sale', 50000000000, 'sale', null, 'usd1') t`, [usdCompany]));

const mixed = pick((await asOwner(() => one('select public.icon_milestone_status($1) s', [A]))).s);
check('USD and INR are tracked separately',
  mixed.INR && mixed.USD &&
  num(mixed.INR.revenue_minor) === 200001000000 &&
  num(mixed.USD.revenue_minor) === 50000000000,
  `INR ${mixed.INR.revenue_minor} · USD ${mixed.USD.revenue_minor}`);
check('a new currency does not inherit the other currency milestones',
  mixed.USD.dual_achieved === false && mixed.USD.revenue_achieved === false,
  JSON.stringify(mixed.USD));

/* ---------------- client permissions ---------------- */

const clientPost = await asUser(A, () =>
  fails(`select public.icon_post_transaction($1, 'sale', 1, null, null, 'hack')`, [companyId])
);
check('players cannot post money', clientPost !== null, clientPost ? 'blocked' : 'ALLOWED');

const clientXp = await asUser(A, () => fails(`select public.icon_award_xp($1, 'cheat', 'x', 9999, 'cheat')`, [A]));
check('players cannot award themselves xp', clientXp !== null, clientXp ? 'blocked' : 'ALLOWED');

const clientLaunch = await asUser(A, () =>
  fails(`select public.icon_launch_startup($1, $2)`, [B, draft])
);
check('players cannot launch a company for someone else', clientLaunch !== null, clientLaunch ? 'blocked' : 'allowed');

const ownStatus = await asUser(A, () => one('select public.icon_milestone_status() s'));
check('a player can read their own milestone status', ownStatus.s !== null, 'ok');

/* ---------------- summary ---------------- */

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) process.exit(1);
