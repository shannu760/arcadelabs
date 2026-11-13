/* Live verification against a real Supabase project.

   The local suites (.labtest/auth.mjs) prove our wiring against a stand-in.
   This script proves the same flow against an actual hosted project, talking
   only to our own API — never to Supabase directly, and never through a
   service-role key.

   It creates one real account at verify.<timestamp>@student-icon.test — a
   domain that cannot receive mail, so the account is inert unless you confirm
   it manually. Nothing is deleted afterwards: without a service-role key this
   project cannot delete auth users, so the test account stays until you remove
   it in the Supabase dashboard.

   Exit codes: 0 all checks passed, 1 a check failed, 2 the project requires
   email confirmation so the account-owner checks could not run yet.

   Usage:  npm run dev            (in another terminal, with .env configured)
           npm run verify:live
           npm run test:live      (the same checks against the local stub)
*/

const BASE = String(process.env.VERIFY_BASE || 'http://127.0.0.1:8080').replace(/\/+$/, '');

let passed = 0;
let failed = 0;

/** Thrown to leave main() with an exit code, so nothing keeps the process open. */
class Stop {
  constructor(code) {
    this.code = code;
  }
}

const record = (ok, label, detail = '') => {
  if (ok) passed += 1;
  else failed += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`);
};

const summarise = () => {
  console.log(`\n${passed}/${passed + failed} live checks passed`);
};

async function call(path, { method = 'GET', body, token } = {}) {
  // No keep-alive: sockets must not still be open when the process exits.
  // Node on Windows aborts with a libuv assertion if a process exits while an
  // idle keep-alive socket is mid-close.
  const headers = { connection: 'close' };
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (token) headers.authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    });
  } catch (err) {
    console.log(`\nCannot reach ${BASE}${path} — ${err.name}: ${err.message}`);
    console.log('Start the server first: npm run dev');
    throw new Stop(1);
  }

  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { status: res.status, data };
}

function escalate(label, status, data) {
  const message = data?.message || data?.msg || data?.error_description || '';
  console.log(`\nStopped at: ${label} (HTTP ${status})`);
  if (message) console.log(`  ${message}`);
  console.log('\nThis is a real result from the project, not a wiring fault. Read it before retrying.');
  summarise();
  throw new Stop(1);
}

async function main() {
  const stamp = Date.now();
  const email = process.env.VERIFY_EMAIL || `verify.${stamp}@student-icon.test`;
  const password = process.env.VERIFY_PASSWORD || `Si-${stamp}-aA1`;

  // 1. The server must be in Supabase mode at all.
  const config = await call('/api/auth/config');
  if (config.status !== 200) escalate('GET /api/auth/config', config.status, config.data);
  record(config.data?.mode === 'supabase', 'server is in Supabase mode', `mode=${config.data?.mode}`);
  if (config.data?.mode !== 'supabase') {
    console.log('\nSUPABASE_URL / SUPABASE_ANON_KEY are not loaded. Run `npm run check:auth`,');
    console.log('then restart the server. Nothing else in this script was attempted.');
    summarise();
    throw new Stop(1);
  }
  record(JSON.stringify(config.data).indexOf('eyJ') === -1, 'config response leaks no key');

  // 2. Network path: a deliberately wrong password must come back as a clean 401
  //    from the project, not a 502. That proves credentials and TLS work, and
  //    it creates nothing.
  const bogus = await call('/api/auth/signin', {
    method: 'POST',
    body: { email: `no.such.player.${stamp}@student-icon.test`, password: 'not-the-password' },
  });
  record(bogus.status === 401, 'wrong credentials rejected (reached the project)', `HTTP ${bogus.status}`);
  if (bogus.status === 502) escalate('sign-in network path', bogus.status, bogus.data);

  // 3. Real sign-up. A 409 means this address already exists, which is normal on
  //    a re-run — carry on with it instead of failing the whole verification.
  const signup = await call('/api/auth/signup', { method: 'POST', body: { email, password } });
  const existing = signup.status === 409;
  if (existing) {
    record(true, 'account already exists (re-run on this address)', `HTTP ${signup.status}`);
  } else {
    record(signup.status === 200, 'sign-up accepted', `HTTP ${signup.status}`);
    if (signup.status !== 200) escalate('sign-up', signup.status, signup.data);
  }

  const needsConfirmation = !existing && Boolean(signup.data?.needsConfirmation);
  if (!existing) {
    console.log(`      project requires email confirmation: ${needsConfirmation ? 'yes' : 'no'}`);
    if (!needsConfirmation && !signup.data?.session) escalate('sign-up returned a session', 200, signup.data);

    // 4. Duplicate sign-up must be refused, not silently repeated.
    const duplicate = await call('/api/auth/signup', { method: 'POST', body: { email, password } });
    record(duplicate.status === 409, 'duplicate email refused', `HTTP ${duplicate.status}`);
  }

  let session = signup.data?.session || null;

  // 5. Either the account is usable now, or the project is waiting on a
  //    confirmation click this script cannot make. Both are reported honestly:
  //    confirmation pending exits 2 with the account-owner checks clearly not run.
  if (existing || needsConfirmation) {
    const signin = await call('/api/auth/signin', { method: 'POST', body: { email, password } });

    if (signin.status === 200) {
      record(true, existing ? 'existing account can sign in' : 'confirmed account can sign in', 'HTTP 200');
      session = signin.data.session;
    } else {
      record(
        signin.status === 401 || signin.status === 403,
        'unconfirmed account cannot sign in yet',
        `HTTP ${signin.status} ${JSON.stringify(signin.data)}`
      );
      console.log('\nThis project requires email confirmation, so the account-owner checks');
      console.log('below could not run. Everything above is a real result.');
      console.log('Confirm that address, then re-run with the same VERIFY_EMAIL / VERIFY_PASSWORD.');
      summarise();
      throw new Stop(2);
    }
  } else {
    const signin = await call('/api/auth/signin', { method: 'POST', body: { email, password } });
    if (signin.status !== 200) escalate('sign-in with the new account', signin.status, signin.data);
    record(true, 'new account can sign in', 'HTTP 200');
    session = signin.data.session;
  }

  // 6. The access token must be honoured by our own protected routes.
  const me = await call('/api/me', { token: session.accessToken });
  record(me.status === 200 || me.status === 404, 'access token verified by the API', `HTTP ${me.status}`);
  if (me.status === 401) escalate('token verification', me.status, me.data);

  const handle = `live${String(stamp).slice(-6)}`;
  const sync = await call('/api/session/sync', {
    method: 'POST',
    token: session.accessToken,
    body: { handle, displayName: 'Live Check' },
  });
  record(sync.status === 201, 'player created by session sync', `HTTP ${sync.status} handle=${handle}`);
  if (sync.status >= 400) escalate('session sync', sync.status, sync.data);

  const profile = await call('/api/me', { token: session.accessToken });
  record(
    profile.status === 200 && profile.data?.profile?.handle === handle,
    'profile readable and scoped to the account',
    `HTTP ${profile.status}`
  );

  const patch = await call('/api/me', {
    method: 'PATCH',
    token: session.accessToken,
    body: { displayName: 'Live Check', bio: 'Written by npm run verify:live.' },
  });
  record(patch.status === 200, 'profile written to Postgres', `HTTP ${patch.status}`);

  const anon = await call('/api/me');
  record(anon.status === 401, 'no token means no access', `HTTP ${anon.status}`);

  // 7. Refresh rotation, and replay of a spent refresh token.
  if (session.refreshToken) {
    const refreshed = await call('/api/auth/refresh', {
      method: 'POST',
      body: { refreshToken: session.refreshToken },
    });
    record(refreshed.status === 200, 'refresh token rotates', `HTTP ${refreshed.status}`);

    const replay = await call('/api/auth/refresh', {
      method: 'POST',
      body: { refreshToken: session.refreshToken },
    });
    record(replay.status === 401, 'spent refresh token rejected', `HTTP ${replay.status}`);

    if (refreshed.status === 200) session = refreshed.data.session;
  }

  // 8. Sign-out must kill the token.
  const out = await call('/api/auth/signout', { method: 'POST', token: session.accessToken });
  record(out.status === 200, 'sign-out accepted', `HTTP ${out.status}`);

  const after = await call('/api/me', { token: session.accessToken });
  record(after.status === 401, 'token dead after sign-out', `HTTP ${after.status}`);

  summarise();
  if (process.env.VERIFY_STUB === '1') {
    console.log('\nTarget was the local Supabase stub — nothing to clean up.');
  } else {
    console.log(`\nTest account left behind: ${email}`);
    console.log('This project has no service-role key, so it cannot delete auth users.');
    console.log('Remove that user in the Supabase dashboard (Authentication → Users).');
  }

  return failed === 0 ? 0 : 1;
}

// Set exitCode and let Node close sockets on its own. Calling process.exit here
// aborts on Windows with a libuv assertion while connections are still closing.
main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err) => {
    if (err instanceof Stop) process.exitCode = err.code;
    else {
      console.log(`unexpected error: ${err?.stack || err}`);
      process.exitCode = 1;
    }
  });
