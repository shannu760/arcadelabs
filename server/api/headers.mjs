/* Security headers, one definition.

   The CSP is deliberately explicit about where scripts may come from: self,
   Google's ad stack (AdSense loads its own scripts from several hosts) and
   Cloudflare Turnstile. `'unsafe-inline'` stays for now because the pages carry
   one inline script each (`document.documentElement.classList.add('js')`);
   removing it is the next tightening step, and it is called out in the runbook.

   Vercel applies the same policy from vercel.json, and worker.js applies it on
   Sites. Keep the three in step when this list changes.
*/

export const SITE_ORIGIN = (process.env.SITE_URL || 'https://arcadelabs-eight.vercel.app').replace(
  /\/+$/,
  ''
);

const DIRECTIVES = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'self'",
  "form-action 'self'",
  "manifest-src 'self'",
  "img-src 'self' data: https:",
  "font-src 'self' data: https://fonts.gstatic.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "script-src 'self' 'unsafe-inline' https://pagead2.googlesyndication.com https://*.googlesyndication.com https://*.google.com https://*.adtrafficquality.google https://challenges.cloudflare.com",
  "connect-src 'self' https://*.supabase.co https://pagead2.googlesyndication.com https://*.googlesyndication.com https://*.google.com https://*.doubleclick.net https://*.adtrafficquality.google https://challenges.cloudflare.com",
  "frame-src 'self' https://googleads.g.doubleclick.net https://*.google.com https://*.adtrafficquality.google https://challenges.cloudflare.com",
  'upgrade-insecure-requests',
];

export const SECURITY_HEADERS = {
  'content-security-policy': DIRECTIVES.join('; '),
  'strict-transport-security': 'max-age=63072000; includeSubDomains; preload',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'SAMEORIGIN',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'cross-origin-opener-policy': 'same-origin',
  'x-permitted-cross-domain-policies': 'none',
};

/** Applies the headers to a Node response without overwriting anything set. */
export function applySecurityHeaders(res) {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    if (!res.getHeader(name)) res.setHeader(name, value);
  }
}
