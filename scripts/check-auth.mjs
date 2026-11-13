/* "Are my account settings actually being picked up?"

   Prints what the server will see, then asks Supabase whether the project URL
   and anon key are valid. Values are never printed — only presence, shape and
   the project host.

   Usage: npm run check:auth
*/

import '../server/api/env.mjs';

const base = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const key = String(process.env.SUPABASE_ANON_KEY || '');

if (!base || !key) {
  console.log('accounts: dev identity only');
  console.log(`  SUPABASE_URL:      ${base ? 'set' : 'MISSING'}`);
  console.log(`  SUPABASE_ANON_KEY: ${key ? 'set' : 'MISSING'}`);
  console.log('');
  console.log('Add both to the project .env, then restart the server.');
  console.log('Until then every player is a loopback dev identity.');
  process.exit(1);
}

let host = '';
try {
  host = new URL(base).host;
} catch {
  console.log(`accounts: SUPABASE_URL is not a valid URL (${base.length} characters)`);
  process.exit(1);
}

console.log('accounts: Supabase configured');
console.log(`  project host: ${host}`);
console.log(`  anon key:     ${key.length} characters${key.startsWith('eyJ') ? ' (JWT)' : ' (unusual shape — expected a JWT)'}`);

try {
  const res = await fetch(`${base}/auth/v1/settings`, {
    headers: { apikey: key },
    signal: AbortSignal.timeout(10000),
  });
  const data = await res.json().catch(() => ({}));

  if (res.status !== 200) {
    console.log(`  reachable:    no — HTTP ${res.status}`);
    const message = data.msg || data.message || data.error_description || '';
    if (message) console.log(`  message:      ${message}`);
    console.log('  a 401 here means the anon key does not belong to this project.');
    process.exit(1);
  }

  console.log('  reachable:    yes');
  console.log(`  sign-up open: ${data.disable_signup ? 'no (sign-ups disabled in this project)' : 'yes'}`);
  console.log(
    `  confirmation: ${data.mailer_autoconfirm ? 'not required — sign-up returns a session immediately' : 'required — players must click the emailed link before signing in'}`
  );
} catch (err) {
  console.log(`  reachable:    no — ${err.name === 'TimeoutError' ? 'timed out' : err.message}`);
  process.exit(1);
}
