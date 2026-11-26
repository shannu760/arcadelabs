/* Post-deploy smoke test.

     node scripts/smoke.mjs                         # checks production
     node scripts/smoke.mjs http://127.0.0.1:8080   # checks a local server
     BASE_URL=https://… node scripts/smoke.mjs

   Checks what a visitor and a crawler actually depend on, and exits non-zero if
   any of it is wrong — that is what the uptime workflow acts on. It never signs
   in, never writes and never prints a secret.
*/
const base = (process.argv[2] || process.env.BASE_URL || 'https://arcadelabs-eight.vercel.app').replace(
  /\/+$/,
  ''
);

const results = [];

async function check(name, path, test) {
  const started = Date.now();
  let res = null;
  let body = '';
  let error = null;

  try {
    res = await fetch(base + path, {
      redirect: 'manual',
      headers: { 'user-agent': 'student-icon-smoke/1.0' },
      signal: AbortSignal.timeout(15000),
    });
    body = await res.text();
  } catch (err) {
    error = err;
  }

  const ms = Date.now() - started;

  if (error) {
    results.push({ name, ok: false, detail: error.message, ms });
    return;
  }

  let verdict = { ok: false, detail: `HTTP ${res.status}` };
  try {
    verdict = test(res, body) || verdict;
  } catch (err) {
    verdict = { ok: false, detail: err.message };
  }

  results.push({ name, ok: verdict.ok, detail: verdict.detail, ms });
}

const json = (res, body) => {
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
};

await check('landing page', '/', (res, body) => ({
  ok: res.status === 200 && /Student Icon/i.test(body),
  detail: `HTTP ${res.status}, ${body.length} bytes`,
}));

await check('security headers', '/', (res) => {
  const csp = res.headers.get('content-security-policy') || '';
  const hsts = res.headers.get('strict-transport-security') || '';
  return {
    ok: Boolean(csp) && Boolean(hsts) && res.headers.get('x-content-type-options') === 'nosniff',
    detail: csp ? 'csp + hsts present' : 'csp missing',
  };
});

await check('robots.txt', '/robots.txt', (res, body) => ({
  ok: res.status === 200 && /Sitemap:/i.test(body),
  detail: `HTTP ${res.status}`,
}));

await check('sitemap.xml', '/sitemap.xml', (res, body) => ({
  ok: res.status === 200 && /<urlset/.test(body) && /<loc>/.test(body),
  detail: `HTTP ${res.status}, ${(body.match(/<loc>/g) || []).length} urls`,
}));

await check('ads.txt', '/ads.txt', (res, body) => ({
  ok: res.status === 200 && /google\.com/i.test(body),
  detail: `HTTP ${res.status}`,
}));

await check('privacy policy', '/privacy.html', (res) => ({
  ok: res.status === 200,
  detail: `HTTP ${res.status}`,
}));

await check('arcade', '/arcade/index.html', (res, body) => ({
  ok: res.status === 200 && /ARCADE/i.test(body),
  detail: `HTTP ${res.status}`,
}));

await check('auth config', '/api/auth/config', (res, body) => {
  const data = json(res, body);
  return {
    ok: res.status === 200 && typeof data?.mode === 'string',
    detail: `HTTP ${res.status}, mode=${data?.mode ?? 'none'}`,
  };
});

/* The database is what the free Supabase tier pauses, so this is also the
   keep-alive: the request runs a real query. */
await check('health + database', '/api/health', (res, body) => {
  const data = json(res, body);
  return {
    ok: res.status === 200 && data?.ok === true && typeof data?.db === 'string',
    detail: `HTTP ${res.status}, ${data?.db ?? ''} ${data?.error?.code ?? ''}`.trim(),
  };
});

await check('signed-out guard', '/api/me', (res) => ({
  ok: res.status === 401,
  detail: `HTTP ${res.status}`,
}));

/* Unknown API paths answer 404 to a signed-in caller and 401 to anyone else:
   the session guard runs before the route table. Either is a healthy answer. */
await check('unknown endpoint', '/api/nope', (res, body) => ({
  ok: (res.status === 404 || res.status === 401) && /"error"/.test(body),
  detail: `HTTP ${res.status}`,
}));

await check('legacy arcade redirect', '/labs.html', (res) => ({
  ok: res.status === 308 && res.headers.get('location') === '/arcade/labs.html',
  detail: `HTTP ${res.status} -> ${res.headers.get('location')}`,
}));

for (const result of results) {
  console.log(`${result.ok ? 'PASS' : 'FAIL'}  ${result.name}  (${result.ms}ms) — ${result.detail}`);
}

const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed against ${base}`);
if (failed.length) process.exit(1);
