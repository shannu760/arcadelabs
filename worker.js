/* Static asset Worker for Freebuff Sites.
   Student Icon owns the root; the arcade lives under /arcade/.
   Legacy arcade URLs are redirected permanently so shared links survive.

   Every response — redirects, assets, not-found — carries the same security
   headers as the Vercel deployment (see server/api/headers.mjs). Keep the two
   lists in step. */

const LEGACY_PAGES = {
  '/memory.html': '/arcade/memory.html',
  '/race.html': '/arcade/race.html',
  '/chess.html': '/arcade/chess.html',
  '/labs.html': '/arcade/labs.html',
};

const SECURITY_HEADERS = {
  'content-security-policy':
    "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'self'; form-action 'self'; manifest-src 'self'; img-src 'self' data: https:; font-src 'self' data: https://fonts.gstatic.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; script-src 'self' 'unsafe-inline' https://pagead2.googlesyndication.com https://*.googlesyndication.com https://*.google.com https://*.adtrafficquality.google https://challenges.cloudflare.com; connect-src 'self' https://*.supabase.co https://pagead2.googlesyndication.com https://*.googlesyndication.com https://*.google.com https://*.doubleclick.net https://*.adtrafficquality.google https://challenges.cloudflare.com; frame-src 'self' https://googleads.g.doubleclick.net https://*.google.com https://*.adtrafficquality.google https://challenges.cloudflare.com; upgrade-insecure-requests",
  'strict-transport-security': 'max-age=63072000; includeSubDomains; preload',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'SAMEORIGIN',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'cross-origin-opener-policy': 'same-origin',
  'x-permitted-cross-domain-policies': 'none',
};

function withHeaders(response) {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    if (!headers.has(name)) headers.set(name, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    let target = LEGACY_PAGES[url.pathname];

    if (!target && url.pathname.startsWith('/labs/')) {
      target = `/arcade${url.pathname}`;
    }

    if (target) {
      return withHeaders(
        new Response(`Moved permanently to ${target}`, {
          status: 308,
          headers: { location: target, 'content-type': 'text/plain; charset=utf-8' },
        })
      );
    }

    return withHeaders(await env.ASSETS.fetch(request));
  },
};
