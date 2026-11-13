/* Runs scripts/verify-live.mjs against the local Supabase stub, twice.

   Purpose: prove the verifier itself works. Without real credentials the live
   checker stops at its first check, so everything after it had never run.

   The two passes exist because the verifier has two paths depending on whether
   the project requires email confirmation — and the account-owner checks can
   only run once the address is confirmed:

     pass 1  fresh address, stub requires confirmation
             → exercises sign-up, duplicate refusal, confirmation gating,
               and the honest exit 2 ("account-owner checks not run")
     pass 2  the same address, now confirmed through the stub's test hook
             → exercises sign-in, token verification, profile creation,
               profile write, refresh rotation and replay, sign-out revocation

   Together every check in the verifier executes. This proves the verifier and
   our wiring; it says nothing about hosted Supabase. For that, put the real
   project values in .env and run `npm run verify:live` directly.

   Usage: npm run test:live
*/

import { spawn } from 'node:child_process';
import { startStub } from './supabase-stub.mjs';

const SERVER_PORT = Number(process.env.TEST_PORT || 8097);
const STUB_PORT = Number(process.env.STUB_PORT || 8102);
const ANON = 'test-anon-key';
const BASE = `http://127.0.0.1:${SERVER_PORT}`;
const STUB = `http://127.0.0.1:${STUB_PORT}`;

// Confirmation required: the stub behaves like a default Supabase project.
delete process.env.STUB_AUTOCONFIRM;

const stamp = Date.now();
const email = `verify.${stamp}@student-icon.test`;
const password = `Si-${stamp}-aA1`;

const stub = await startStub(STUB_PORT);

const child = spawn(process.execPath, ['server.mjs'], {
  env: {
    ...process.env,
    PORT: String(SERVER_PORT),
    ICON_DB_PATH: ':memory:',
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
};

const runVerifier = (label) =>
  new Promise((resolve) => {
    console.log(`\n──── ${label} ────`);
    const verifier = spawn(process.execPath, ['scripts/verify-live.mjs'], {
      env: {
        ...process.env,
        VERIFY_BASE: BASE,
        VERIFY_STUB: '1',
        VERIFY_EMAIL: email,
        VERIFY_PASSWORD: password,
      },
      stdio: 'inherit',
    });
    verifier.on('exit', (code) => resolve(code ?? 1));
  });

const confirmInStub = async () => {
  const res = await fetch(`${STUB}/auth/v1/admin/confirm`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', apikey: ANON },
    body: JSON.stringify({ email }),
  });
  return res.status;
};

let ok = false;
try {
  const health = await waitForHealth();
  if (health.auth !== 'supabase') {
    throw new Error(`server is in ${health.auth} auth mode, expected supabase\n${logs}`);
  }

  console.log(`verifier target: ${BASE} (server) → ${STUB} (stub)`);
  console.log(`test address:    ${email}`);

  const first = await runVerifier('pass 1 — fresh account, confirmation required');
  if (first !== 2) {
    console.log(`\npass 1 exited ${first}, expected 2 (confirmation pending).`);
  } else {
    const status = await confirmInStub();
    console.log(`\nconfirmed the address through the stub (HTTP ${status})`);

    const second = await runVerifier('pass 2 — same account, now confirmed');
    ok = second === 0;
    if (!ok) console.log(`\npass 2 exited ${second}, expected 0.`);
  }
} catch (err) {
  console.log(`harness failed: ${err.message}`);
} finally {
  await shutdown();
}

console.log(ok ? '\nharness: every verifier check executed and passed' : '\nharness: FAILED');
process.exit(ok ? 0 : 1);
