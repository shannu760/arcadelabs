/* Account routes: sign up, sign in, refresh, sign out, password reset.

   The browser never holds the Supabase anon key and never talks to Supabase
   directly. It posts to these same-origin routes, gets back an access token,
   and then sends that token as `Authorization: Bearer …` — which auth.mjs
   verifies against Supabase on every request.

   Throttling is shared: the counter lives in Postgres (see ratelimit.mjs), so
   several instances cannot each hand out the full allowance. Without a
   database it falls back to this process's memory and says so in the log.

   Sign-up can require a Cloudflare Turnstile check. It is off until
   TURNSTILE_SECRET_KEY and TURNSTILE_SITE_KEY are set, so a deployment without
   them keeps working; a deployment with them refuses a sign-up that has no
   valid token.
*/

import { HttpError, readJson, send, fail } from './http.mjs';
import { authenticate, authMode, supabaseConfigured } from './auth.mjs';
import { throttle, clientIp } from './ratelimit.mjs';
import {
  callSupabaseAuth,
  probeSupabaseAuth,
  shapeSession,
  shapeUser,
  supabaseMessage,
} from './supabase.mjs';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MIN_PASSWORD = 8;

/* Account emails go out through Supabase's own mailer, which allows only a few
   an hour. When that runs out the provider answers 429, and its string ("email
   rate limit exceeded") reads like a bug in the site. It is not: it is an email
   limit, the wait is the fix, and the two forms must say exactly that. */
const EMAIL_LIMIT_CODES = new Set(['over_email_send_rate_limit', 'email_send_rate_limit']);

function isEmailLimit(status, data) {
  if (status !== 429) return false;
  const code = String(data?.error_code || data?.error || '');
  if (EMAIL_LIMIT_CODES.has(code)) return true;
  const message = supabaseMessage(data);
  return /email/i.test(message) && /rate limit/i.test(message);
}

const EMAIL_LIMIT_SIGNUP =
  'The site has reached its hourly limit for sending confirmation emails, so a new account cannot be created right now. Try again in about an hour. If you already have an account, sign in instead.';

const EMAIL_LIMIT_SIGNIN =
  'The site has reached its hourly limit for sending account emails, so this sign-in cannot be finished right now. Try again in about an hour.';

/* ------------------------------------------------------------- turnstile */

const turnstileSecret = () => String(process.env.TURNSTILE_SECRET_KEY || '').trim();
const turnstileSiteKey = () => String(process.env.TURNSTILE_SITE_KEY || '').trim();

async function verifyHuman(token) {
  if (!turnstileSecret()) return;
  if (!token) {
    throw new HttpError(400, 'captcha_required', 'Complete the human check, then try again.');
  }

  let data = null;
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret: turnstileSecret(), response: String(token) }),
      signal: AbortSignal.timeout(8000),
    });
    data = await res.json();
  } catch {
    throw new HttpError(502, 'captcha_unreachable', 'The human check could not be verified. Try again.');
  }

  if (!data?.success) {
    throw new HttpError(400, 'captcha_failed', 'The human check did not pass. Try again.');
  }
}

const credentials = (body) => {
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');

  if (!EMAIL_RE.test(email) || email.length > 254) {
    throw new HttpError(400, 'invalid_email', 'Enter a valid email address');
  }
  if (password.length < MIN_PASSWORD) {
    throw new HttpError(400, 'weak_password', `Passwords need at least ${MIN_PASSWORD} characters`);
  }
  return { email, password };
};

const requireSupabase = () => {
  if (!supabaseConfigured()) {
    throw new HttpError(
      503,
      'auth_not_configured',
      'Accounts are not connected yet. Set SUPABASE_URL and SUPABASE_ANON_KEY (or SUPABASE_PUBLISHABLE_KEY).'
    );
  }
};

/* Maps a failed GoTrue sign-in to a message a person can act on. */
function signinFailure(status, data) {
  const code = String(data?.error_code || data?.error || '');
  if (isEmailLimit(status, data)) return new HttpError(429, 'email_rate_limited', EMAIL_LIMIT_SIGNIN);
  if (status === 429) return new HttpError(429, 'rate_limited', 'Too many attempts. Try again shortly.');
  if (code === 'email_not_confirmed') {
    return new HttpError(403, 'email_unconfirmed', 'Confirm your email address first, then sign in.');
  }
  if (status === 400 || status === 401) {
    return new HttpError(401, 'invalid_credentials', 'That email and password do not match');
  }
  return new HttpError(400, 'signin_failed', supabaseMessage(data) || 'Could not sign in');
}

export async function handleAuth(req, res, url, method, path) {
  const ip = clientIp(req);

  if (path === '/api/auth/config' && method === 'GET') {
    /* Configured and reachable are different questions. A paused Supabase
       project keeps its URL set, so the sign-in layer used to offer a form that
       could only fail. It now gets `reachable: false` and can say so. */
    const probe = supabaseConfigured()
      ? await probeSupabaseAuth()
      : { reachable: false, host: '', detail: 'not_configured' };

    return send(res, 200, {
      mode: authMode(),
      provider: supabaseConfigured() ? 'supabase' : 'dev',
      minPasswordLength: MIN_PASSWORD,
      turnstileSiteKey: turnstileSiteKey() || null,
      reachable: probe.reachable,
      authHost: probe.host || null,
      authDetail: probe.detail,
      /* Which build is serving this request. Vercel sets the commit for a git
         deployment; 'dev' locally. Without it, "did my change deploy?" and
         "did my environment change?" look identical from the outside. */
      build: String(process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 7) || 'dev',
    });
  }

  if (path === '/api/auth/signup' && method === 'POST') {
    requireSupabase();
    const body = await readJson(req);
    const { email, password } = credentials(body);
    await throttle(`signup:${ip}`, 10, 60 * 60 * 1000);
    await verifyHuman(body.turnstileToken);

    const { status, data } = await callSupabaseAuth('/signup', {
      method: 'POST',
      body: { email, password },
    });

    if (status >= 400) {
      const code = String(data?.error_code || '');
      if (code === 'user_already_exists' || /already registered/i.test(supabaseMessage(data))) {
        return fail(res, 409, 'email_taken', 'An account with that email already exists');
      }
      if (isEmailLimit(status, data)) {
        return fail(res, 429, 'email_rate_limited', EMAIL_LIMIT_SIGNUP);
      }
      return fail(
        res,
        status === 429 ? 429 : 400,
        'signup_failed',
        supabaseMessage(data) || 'Could not create the account'
      );
    }

    const session = shapeSession(data);
    return send(res, 200, {
      needsConfirmation: !session,
      session,
      user: shapeUser(data),
      email,
    });
  }

  if (path === '/api/auth/signin' && method === 'POST') {
    requireSupabase();
    const body = await readJson(req);
    const { email, password } = credentials(body);
    await throttle(`signin:${ip}:${email}`, 8, 10 * 60 * 1000);

    const { status, data } = await callSupabaseAuth('/token?grant_type=password', {
      method: 'POST',
      body: { email, password },
    });

    const session = status < 400 ? shapeSession(data) : null;
    if (!session) throw signinFailure(status, data);

    return send(res, 200, { session });
  }

  if (path === '/api/auth/refresh' && method === 'POST') {
    requireSupabase();
    const body = await readJson(req);
    const refreshToken = String(body.refreshToken || '');
    if (!refreshToken) throw new HttpError(400, 'missing_refresh_token', 'Send the refresh token');

    const { status, data } = await callSupabaseAuth('/token?grant_type=refresh_token', {
      method: 'POST',
      body: { refresh_token: refreshToken },
    });

    const session = status < 400 ? shapeSession(data) : null;
    if (!session) {
      return fail(res, 401, 'session_expired', 'That session has ended. Sign in again.');
    }

    return send(res, 200, { session });
  }

  if (path === '/api/auth/signout' && method === 'POST') {
    const session = await authenticate(req);
    if (!session) return fail(res, 401, 'unauthorized', 'Sign in to continue');

    const header = String(req.headers.authorization || '');
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';

    if (supabaseConfigured() && token) {
      // Best effort: a revoked or expired token should still let the client go.
      await callSupabaseAuth('/logout', { method: 'POST', token }).catch(() => null);
    }

    return send(res, 200, { ok: true });
  }

  /* Changing the address on an account. Supabase sends a confirmation to the
     new address (and, when secure email change is on, to the old one too) and
     the change only takes effect once that link is followed. */
  if (path === '/api/auth/email' && method === 'POST') {
    requireSupabase();
    const session = await authenticate(req);
    if (!session) return fail(res, 401, 'unauthorized', 'Sign in to continue');

    await throttle(`email-change:${session.userId}`, 5, 60 * 60 * 1000);

    const body = await readJson(req);
    const email = String(body.email || '').trim().toLowerCase();
    if (!EMAIL_RE.test(email) || email.length > 254) {
      throw new HttpError(400, 'invalid_email', 'Enter a valid email address');
    }

    const header = String(req.headers.authorization || '');
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';

    const { status, data } = await callSupabaseAuth('/user', {
      method: 'PUT',
      token,
      body: { email },
    });

    if (status >= 400) {
      return fail(
        res,
        status === 429 ? 429 : 400,
        'email_change_failed',
        supabaseMessage(data) || 'Could not start the email change'
      );
    }

    return send(res, 200, {
      ok: true,
      message: `Check ${email} for a confirmation link. Your address changes only after you follow it.`,
    });
  }

  if (path === '/api/auth/recover' && method === 'POST') {
    requireSupabase();
    const body = await readJson(req);
    const email = String(body.email || '').trim().toLowerCase();
    if (!EMAIL_RE.test(email)) throw new HttpError(400, 'invalid_email', 'Enter a valid email address');
    await throttle(`recover:${ip}`, 5, 60 * 60 * 1000);

    // Never report whether the address exists.
    await callSupabaseAuth('/recover', { method: 'POST', body: { email } }).catch(() => null);

    return send(res, 200, {
      ok: true,
      message: 'If that address has an account, a reset link is on its way.',
    });
  }

  return fail(res, 404, 'not_found', `${method} ${path} is not an endpoint`);
}
