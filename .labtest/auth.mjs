/* Account checks — real HTTP against a spawned server in supabase mode.

   The Supabase Auth API is replaced by .labtest/supabase-stub.mjs, a local
   stand-in that speaks the same REST shape. Everything under test is ours:
   sign-up proxy, session shaping, bearer verification, refresh, sign-out,
   error mapping and throttling.

   What this cannot prove: that a hosted Supabase project behaves the same way.
   That needs the real URL and anon key.
*/

import { spawn } from 'node:child_process';
import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { startStub } from './supabase-stub.mjs';

const PORT = Number(process.env.TEST_PORT || 8098);
const STUB_PORT = Number(process.env.STUB_PORT || 8101);
const BASE = `http://127.0.0.1:${PORT}`;
const STUB = `http://127.0.0.1:${STUB_PORT}`;
const ANON = 'test-anon-key';
const DB_PATH = ':memory:';

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};

const call = async (path, { method = 'GET', body, token, dev } = {}) => {
  const headers = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (token) headers.authorization = `Bearer ${token}`;
  if (dev) headers['x-dev-user'] = dev;

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
  return { status: res.status, json, raw: res };
};

const confirmInStub = (email) =>
  fetch(`${STUB}/auth/v1/admin/confirm`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', apikey: ANON },
    body: JSON.stringify({ email }),
  });

const stub = await startStub(STUB_PORT);

const child = spawn(process.execPath, ['server.mjs'], {
  env: {
    ...process.env,
    PORT: String(PORT),
    ICON_DB_PATH: DB_PATH,
    SUPABASE_URL: STUB,
    SUPABASE_ANON_KEY: ANON,
  },
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
  await new Promise((r) => stub.close(r));
  await rm(DB_PATH, { recursive: true, force: true }).catch(() => {});
};

const EMAIL = 'ada@example.com';
const PASSWORD = 'correct-horse-9';

try {
  const health = await waitForHealth();
  check('server runs in supabase auth mode', health.auth === 'supabase', health.auth);

  const config = await call('/api/auth/config');
  check(
    'auth config reports supabase and leaks no key',
    config.status === 200 &&
      config.json?.provider === 'supabase' &&
      config.json?.minPasswordLength === 8 &&
      !JSON.stringify(config.json).includes(ANON),
    JSON.stringify(config.json)
  );

  const devAttempt = await call('/api/me', { dev: '11111111-1111-4111-8111-111111111111' });
  check('dev identity is refused once real auth is configured', devAttempt.status === 401, String(devAttempt.status));

  const bogus = await call('/api/me', { token: 'not-a-real-token' });
  check('an unknown bearer token is refused', bogus.status === 401, String(bogus.status));

  const weak = await call('/api/auth/signup', { method: 'POST', body: { email: EMAIL, password: 'short' } });
  check('a weak password is rejected before reaching Supabase', weak.status === 400 && weak.json?.error?.code === 'weak_password', String(weak.status));

  const badEmail = await call('/api/auth/signup', { method: 'POST', body: { email: 'nope', password: PASSWORD } });
  check('an invalid email is rejected', badEmail.status === 400 && badEmail.json?.error?.code === 'invalid_email', String(badEmail.status));

  const signup = await call('/api/auth/signup', { method: 'POST', body: { email: EMAIL, password: PASSWORD } });
  const signupRaw = JSON.stringify(signup.json);
  check(
    'sign-up asks for email confirmation and returns no session',
    signup.status === 200 && signup.json?.needsConfirmation === true && signup.json?.session === null,
    JSON.stringify({ status: signup.status, needsConfirmation: signup.json?.needsConfirmation })
  );
  check('the password never comes back in a response', !signupRaw.includes(PASSWORD), signupRaw.length + ' bytes');

  const early = await call('/api/auth/signin', { method: 'POST', body: { email: EMAIL, password: PASSWORD } });
  check('signing in before confirming is refused clearly', early.status === 403 && early.json?.error?.code === 'email_unconfirmed', String(early.status));

  await confirmInStub(EMAIL);

  const wrongPassword = await call('/api/auth/signin', { method: 'POST', body: { email: EMAIL, password: 'wrong-password' } });
  check('a wrong password is refused', wrongPassword.status === 401 && wrongPassword.json?.error?.code === 'invalid_credentials', String(wrongPassword.status));

  const signin = await call('/api/auth/signin', { method: 'POST', body: { email: EMAIL, password: PASSWORD } });
  const session = signin.json?.session;
  check(
    'sign-in returns a session with a user id',
    signin.status === 200 &&
      typeof session?.accessToken === 'string' &&
      typeof session?.refreshToken === 'string' &&
      Number.isFinite(session?.expiresAt) &&
      /^[0-9a-f-]{36}$/i.test(session?.user?.id || ''),
    String(signin.status)
  );

  const noProfile = await call('/api/me', { token: session.accessToken });
  check('a signed-in account without a player gets no_profile', noProfile.status === 404 && noProfile.json?.error?.code === 'no_profile', String(noProfile.status));

  const sync = await call('/api/session/sync', {
    method: 'POST',
    token: session.accessToken,
    body: { handle: 'ada', displayName: 'Ada Lovelace' },
  });
  check('the account can create its player with a bearer token', sync.status === 201 && sync.json?.profile?.handle === 'ada', String(sync.status));

  const me = await call('/api/me', { token: session.accessToken });
  check('the profile is scoped to the account', me.status === 200 && me.json?.profile?.id === session.user.id, me.json?.profile?.handle);

  const refreshed = await call('/api/auth/refresh', { method: 'POST', body: { refreshToken: session.refreshToken } });
  const next = refreshed.json?.session;
  check(
    'refresh issues a new access token',
    refreshed.status === 200 && typeof next?.accessToken === 'string' && next.accessToken !== session.accessToken,
    String(refreshed.status)
  );

  const afterRefresh = await call('/api/me', { token: next?.accessToken });
  check('the refreshed token is accepted by the API', afterRefresh.status === 200, String(afterRefresh.status));

  const stale = await call('/api/auth/refresh', { method: 'POST', body: { refreshToken: session.refreshToken } });
  check('a used refresh token cannot be replayed', stale.status === 401 && stale.json?.error?.code === 'session_expired', String(stale.status));

  const duplicate = await call('/api/auth/signup', { method: 'POST', body: { email: EMAIL, password: PASSWORD } });
  check('a second sign-up with the same email is refused', duplicate.status === 409 && duplicate.json?.error?.code === 'email_taken', String(duplicate.status));

  const recover = await call('/api/auth/recover', { method: 'POST', body: { email: 'nobody@example.com' } });
  check('password reset never reveals whether an address exists', recover.status === 200 && recover.json?.ok === true, String(recover.status));

  // Throttling, using an address of its own so earlier checks cannot skew it.
  const attempts = [];
  for (let i = 0; i < 10; i += 1) {
    const res = await call('/api/auth/signin', { method: 'POST', body: { email: 'throttle@example.com', password: 'wrong-password' } });
    attempts.push(res.status);
  }
  check(
    'repeated failed sign-ins are throttled',
    attempts.includes(429) && attempts[attempts.length - 1] === 429,
    attempts.join(',')
  );

  const other = await call('/api/auth/signup', { method: 'POST', body: { email: 'grace@example.com', password: PASSWORD } });
  await confirmInStub('grace@example.com');
  const otherSignin = await call('/api/auth/signin', { method: 'POST', body: { email: 'grace@example.com', password: PASSWORD } });
  check(
    'throttling one address does not block another account',
    other.status === 200 && otherSignin.status === 200,
    String(otherSignin.status)
  );

  const signout = await call('/api/auth/signout', { method: 'POST', token: next.accessToken });
  check('sign-out succeeds', signout.status === 200 && signout.json?.ok === true, String(signout.status));

  const revoked = await call('/api/me', { token: next.accessToken });
  check('the token is dead after sign-out', revoked.status === 401, String(revoked.status));
} catch (err) {
  check('suite ran to completion', false, err.message);
} finally {
  await shutdown();
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) process.exit(1);
