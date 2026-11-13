/* F3 API checks — real HTTP against a spawned server and a temporary database.

   Proves the session/profile slice end to end:
     * unauthenticated calls are refused
     * sync creates exactly one profile, idempotently
     * handles are validated, unique and immutable
     * patches are whitelisted and validated
     * public profiles respect visibility, unlisted ones stay hidden
     * interests and careers round-trip
*/

import { spawn } from 'node:child_process';
import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { levelForXp, nextLevelXp, skillProgress } from '../server/api/skills.mjs';

const PORT = Number(process.env.TEST_PORT || 8099);
const BASE = `http://127.0.0.1:${PORT}`;
const DB_PATH = ':memory:';

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

const call = async (path, { method = 'GET', user, body } = {}) => {
  const headers = {};
  if (user) headers['x-dev-user'] = user;
  if (body !== undefined) headers['content-type'] = 'application/json';

  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, json };
};

const child = spawn(process.execPath, ['server.mjs'], {
  env: { ...process.env, PORT: String(PORT), ICON_DB_PATH: DB_PATH },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let logs = '';
child.stdout.on('data', (d) => (logs += d));
child.stderr.on('data', (d) => (logs += d));

const waitForHealth = async () => {
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/api/health`);
      if (res.ok) return await res.json();
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`server did not become ready\n${logs}`);
};

const shutdown = async () => {
  child.kill();
  await new Promise((r) => setTimeout(r, 300));
  await rm(DB_PATH, { recursive: true, force: true }).catch(() => {});
};

try {
  const health = await waitForHealth();
  check('health endpoint reports a live database', health.ok === true && health.db === 'pglite', JSON.stringify({ auth: health.auth, ranks: health.ranks }));
  check('migrations are applied on boot', health.ranks === 11 && health.industries === 20, `ranks ${health.ranks} industries ${health.industries}`);
  check('dev auth mode is active locally', health.auth === 'dev', health.auth);

  // The level mapping is tested directly, without HTTP or a database, so a
  // change to the thresholds fails here rather than silently disagreeing with
  // icon_submit_challenge().
  const mappingCases = [
    { xp: 0, level: 0, next: 1 },
    { xp: 1, level: 1, next: 3 },
    { xp: 2, level: 1, next: 3 },
    { xp: 3, level: 2, next: 6 },
    { xp: 5, level: 2, next: 6 },
    { xp: 6, level: 3, next: 9 },
    { xp: 9, level: 4, next: 12 },
    { xp: 12, level: 5, next: null },
    { xp: 41, level: 5, next: null },
  ];
  const wrongMapping = mappingCases.filter((entry) => {
    const mapped = skillProgress(entry.xp, 5);
    return mapped.level !== entry.level || mapped.nextAtXp !== entry.next;
  });
  check(
    'level mapping: 1 XP is level 1, then every 3 XP, capped at 5',
    wrongMapping.length === 0,
    wrongMapping.length ? JSON.stringify(wrongMapping[0], null, 0) : `${mappingCases.length} cases`
  );
  check(
    'an untrained skill is level 0 and one XP away from level 1',
    levelForXp(0, 5) === 0 && nextLevelXp(0, 5) === 1 && skillProgress(0, 5).progress === 0,
    JSON.stringify(skillProgress(0, 5))
  );
  check(
    'progress is measured inside the current level band',
    skillProgress(2, 5).progress === 0.5 && skillProgress(12, 5).progress === 1 && skillProgress(4, 5).progress > 0,
    JSON.stringify({ at2: skillProgress(2, 5).progress, at4: skillProgress(4, 5).progress, at12: skillProgress(12, 5).progress })
  );

  const careers = await call('/api/careers');
  check('career paths are published for onboarding', careers.status === 200 && careers.json?.careers?.length === 10, String(careers.json?.careers?.length));

  const anon = await call('/api/me');
  check('unauthenticated /api/me is refused', anon.status === 401, String(anon.status));

  const badHandle = await call('/api/session/sync', { method: 'POST', user: A, body: { handle: 'No Spaces!' } });
  check('invalid handle is rejected', badHandle.status === 400 && badHandle.json?.error?.code === 'invalid_handle', String(badHandle.status));

  const created = await call('/api/session/sync', { method: 'POST', user: A, body: { handle: 'ada', displayName: 'Ada Lovelace' } });
  check('sync creates the profile', created.status === 201 && created.json?.created === true && created.json?.profile?.handle === 'ada', JSON.stringify(created.json?.profile?.handle));

  const again = await call('/api/session/sync', { method: 'POST', user: A, body: { handle: 'ada', displayName: 'Ada L.' } });
  check('sync is idempotent', again.status === 200 && again.json?.created === false && again.json?.profile?.displayName === 'Ada L.', JSON.stringify(again.json?.created));

  const me = await call('/api/me', { user: A });
  check('profile reads back', me.status === 200 && me.json?.profile?.displayName === 'Ada L.', me.json?.profile?.displayName);

  const patched = await call('/api/me', { method: 'PATCH', user: A, body: { bio: 'Analyst, engine designer', country: 'gb', educationStage: 'university' } });
  check('profile patch applies and normalises country', patched.status === 200 && patched.json?.profile?.country === 'GB' && patched.json?.profile?.bio === 'Analyst, engine designer', JSON.stringify(patched.json?.profile?.country));

  const badVisibility = await call('/api/me', { method: 'PATCH', user: A, body: { visibility: 'secret' } });
  check('unknown visibility is rejected', badVisibility.status === 400 && badVisibility.json?.error?.code === 'invalid_visibility', String(badVisibility.status));

  const emptyPatch = await call('/api/me', { method: 'PATCH', user: A, body: { notAField: 1 } });
  check('non-whitelisted fields cannot be patched', emptyPatch.status === 400 && emptyPatch.json?.error?.code === 'nothing_to_update', String(emptyPatch.status));

  const publicView = await call('/api/profiles/ada', { user: B });
  check('public profile is readable by another player', publicView.status === 200 && publicView.json?.profile?.handle === 'ada' && publicView.json?.isOwner === false, String(publicView.status));

  const stolenHandle = await call('/api/session/sync', { method: 'POST', user: B, body: { handle: 'ada', displayName: 'Copycat' } });
  check('handles are unique across players', stolenHandle.status === 409 && stolenHandle.json?.error?.code === 'handle_taken', String(stolenHandle.status));

  const second = await call('/api/session/sync', { method: 'POST', user: B, body: { handle: 'grace', displayName: 'Grace Hopper' } });
  check('a second player can onboard', second.status === 201 && second.json?.profile?.handle === 'grace', String(second.status));

  const interests = await call('/api/me/interests', { method: 'PUT', user: A, body: { interests: ['ai', 'space', 'ai'], careers: ['ai-engineer', 'made-up-career'] } });
  const stored = interests.json?.profile;
  check('interests deduplicate and careers are validated',
    interests.status === 200 &&
    JSON.stringify(stored?.interests) === JSON.stringify(['ai', 'space']) &&
    JSON.stringify(stored?.careers) === JSON.stringify(['ai-engineer']),
    JSON.stringify({ interests: stored?.interests, careers: stored?.careers }));

  const hidden = await call('/api/me', { method: 'PATCH', user: B, body: { visibility: 'unlisted' } });
  check('a player can hide their profile', hidden.status === 200 && hidden.json?.profile?.visibility === 'unlisted', hidden.json?.profile?.visibility);

  const unseen = await call('/api/profiles/grace', { user: A });
  check('unlisted profiles are invisible to others', unseen.status === 404, String(unseen.status));

  const ownView = await call('/api/profiles/grace', { user: B });
  check('owners can still see their own hidden profile', ownView.status === 200 && ownView.json?.isOwner === true, String(ownView.status));

  const missing = await call('/api/profiles/nobody');
  check('unknown handles 404', missing.status === 404, String(missing.status));

  const anonHidden = await call('/api/profiles/grace');
  check(
    'an unlisted profile 404s without a session too',
    anonHidden.status === 404 && anonHidden.json?.error?.code === 'not_found',
    String(anonHidden.status)
  );
  check(
    'an unlisted profile does not leak the handle or name',
    !/grace|Grace Hopper/i.test(JSON.stringify(anonHidden.json || {})),
    JSON.stringify(anonHidden.json).slice(0, 60)
  );

  const malformed = await call('/api/profiles/Bad%20Handle!');
  check(
    'a malformed handle is rejected by the public profile route',
    malformed.status === 400 && malformed.json?.error?.code === 'invalid_handle',
    String(malformed.status)
  );

  const tooShort = await call('/api/profiles/ab');
  check(
    'a too-short handle is rejected',
    tooShort.status === 400 && tooShort.json?.error?.code === 'invalid_handle',
    String(tooShort.status)
  );

  const pageRes = await fetch(`${BASE}/ada`);
  const pageHtml = await pageRes.text();
  check(
    'the profile page is served at /{handle}',
    pageRes.status === 200 &&
      /text\/html/.test(pageRes.headers.get('content-type') || '') &&
      pageHtml.includes('si-profile'),
    `HTTP ${pageRes.status}`
  );

  const notAHandle = await fetch(`${BASE}/ab`);
  check('a non-handle path is not rewritten to the profile page', notAHandle.status === 404, String(notAHandle.status));

  const unlistedPage = await fetch(`${BASE}/grace`);
  check('an unlisted player is still served the page shell (the API decides)', unlistedPage.status === 200, String(unlistedPage.status));

  const tree = await call('/api/skills');
  const treeBranches = tree.json?.branches || [];
  const treeSkills = treeBranches.flatMap((branch) => branch.skills || []);
  check(
    'the skill tree is public and complete',
    tree.status === 200 && treeBranches.length === 3 && treeSkills.length === 16,
    `${treeBranches.length} branches, ${treeSkills.length} skills`
  );
  check(
    'a signed-out caller gets the tree with no levels',
    treeSkills.every((skill) => skill.level === 0 && skill.xp === 0),
    `level sum ${tree.json?.totals?.levels}`
  );
  check(
    'every skill carries a level cap between 1 and 10',
    treeSkills.every((skill) => skill.maxLevel >= 1 && skill.maxLevel <= 10),
    `caps ${[...new Set(treeSkills.map((skill) => skill.maxLevel))].join(',')}`
  );

  const myTree = await call('/api/skills', { user: A });
  check(
    'a signed-in player gets their own levels',
    myTree.status === 200 && myTree.json?.totals?.skills === 16 && myTree.json?.totals?.started === 0,
    JSON.stringify(myTree.json?.totals)
  );

  const challengeList = await call('/api/challenges');
  const challenges = challengeList.json?.challenges || [];
  const listBody = JSON.stringify(challenges);
  check(
    'the challenge list is public and seeded',
    challengeList.status === 200 && challenges.length === 9,
    `${challenges.length} challenges`
  );
  check(
    'the challenge list never exposes answers or explanations',
    !listBody.includes('answer_key') && !listBody.includes('explanation') && !listBody.includes('answerKey'),
    `${listBody.length} bytes`
  );

  const binary = challenges.find((entry) => entry.title === 'Binary to decimal');
  check('challenges name the skill they train', Boolean(binary?.skill) && binary?.xpReward === 10, JSON.stringify({ skill: binary?.skill, xpReward: binary?.xpReward }));

  const beforeXp = (await call('/api/me', { user: A })).json?.profile?.xp;
  const wrongAnswer = await call(`/api/challenges/${binary.id}/submit`, {
    method: 'POST',
    user: A,
    body: { answers: { value: '12' } },
  });
  const afterWrongXp = (await call('/api/me', { user: A })).json?.profile?.xp;
  check(
    'a wrong answer fails without awarding XP',
    wrongAnswer.status === 200 && wrongAnswer.json?.passed === false && afterWrongXp === beforeXp,
    JSON.stringify({ status: wrongAnswer.json?.status, xp: afterWrongXp })
  );
  check('a failed attempt returns no explanation', wrongAnswer.json?.explanation === null, String(wrongAnswer.json?.explanation));

  const rightAnswer = await call(`/api/challenges/${binary.id}/submit`, {
    method: 'POST',
    user: A,
    body: { answers: { value: '11' } },
  });
  check(
    'a correct answer passes and awards its XP',
    rightAnswer.status === 200 &&
      rightAnswer.json?.passed === true &&
      rightAnswer.json?.status === 'passed' &&
      Number(rightAnswer.json?.xp) === Number(beforeXp) + 10,
    JSON.stringify({ status: rightAnswer.json?.status, xp: rightAnswer.json?.xp })
  );
  check(
    'passing returns the explanation',
    typeof rightAnswer.json?.explanation === 'string' && rightAnswer.json.explanation.includes('1011'),
    String(rightAnswer.json?.explanation).slice(0, 40)
  );
  check(
    'passing a skill challenge moves that skill to level 1',
    rightAnswer.json?.skill === 'programming' && Number(rightAnswer.json?.skill_level) === 1,
    JSON.stringify({ skill: rightAnswer.json?.skill, level: rightAnswer.json?.skill_level })
  );

  const xpAfterPass = (await call('/api/me', { user: A })).json?.profile?.xp;
  const replay = await call(`/api/challenges/${binary.id}/submit`, {
    method: 'POST',
    user: A,
    body: { answers: { value: '11' } },
  });
  const afterReplayXp = (await call('/api/me', { user: A })).json?.profile?.xp;
  check(
    'resubmitting a passed challenge pays nothing',
    replay.json?.status === 'repeat' && afterReplayXp === xpAfterPass,
    JSON.stringify({ status: replay.json?.status, before: xpAfterPass, after: afterReplayXp })
  );

  const treeAfter = await call('/api/skills', { user: A });
  const programming = treeAfter.json?.branches
    ?.flatMap((branch) => branch.skills)
    .find((skill) => skill.slug === 'programming');
  check(
    'the skill tree reflects the earned level and next threshold',
    programming?.level === 1 && programming?.xp === 1 && programming?.nextAtXp === 3,
    JSON.stringify({ level: programming?.level, xp: programming?.xp, next: programming?.nextAtXp })
  );

  const markedPassed = await call('/api/challenges', { user: A });
  const passedFlags = (markedPassed.json?.challenges || []).filter((entry) => entry.passed);
  check(
    'the list marks the challenge as passed for its player only',
    passedFlags.length === 1 && passedFlags[0].id === binary.id,
    `${passedFlags.length} passed`
  );

  const anonymousSubmit = await call(`/api/challenges/${binary.id}/submit`, {
    method: 'POST',
    body: { answers: { value: '11' } },
  });
  check('submitting without a player is refused', anonymousSubmit.status === 401, String(anonymousSubmit.status));

  const unknown = await call('/api/nope', { user: A });
  check('unknown endpoints 404 with a JSON error', unknown.status === 404 && unknown.json?.error?.code === 'not_found', String(unknown.status));

  const noAuthMe = await call('/api/me', { user: 'not-a-uuid' });
  check('a malformed dev identity is treated as signed out', noAuthMe.status === 401, String(noAuthMe.status));
} catch (err) {
  check('suite ran to completion', false, err.message);
} finally {
  await shutdown();
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) process.exit(1);
