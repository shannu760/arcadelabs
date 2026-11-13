/* Account routes: sign up, sign in, refresh, sign out, password reset.

   The browser never holds the Supabase anon key and never talks to Supabase
   directly. It posts to these same-origin routes, gets back an access token,
   and then sends that token as `Authorization: Bearer …` — which auth.mjs
   verifies against Supabase on every request.

   Throttling is in memory and therefore per process. That is honest for this
   single-process foundation build; a multi-instance deployment needs a shared
   counter (Redis or an edge rate limiter) before launch.
*/

import { HttpError, readJson, send, fail } from './http.mjs';
import { authenticate, authMode, supabaseConfigured } from './auth.mjs';
import {
  callSupabaseAuth,
  shapeSession,
  shapeUser,
  supabaseMessage,
} from './supabase.mjs';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MIN_PASSWORD = 8;

const buckets = new Map();

function throttle(key, max, windowMs) {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }

  bucket.count += 1;
  if (bucket.count > max) {
    throw new HttpError(429, 'rate_limited', 'Too many attempts. Try again in a few minutes.');
  }
}

/* Keeps the map from growing without bound on a long-running process. */
function sweep() {
  if (buckets.size < 500) return;
  const now = Date.now();
  for (const [key, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(key);
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
      'Accounts are not connected yet. Set SUPABASE_URL and SUPABASE_ANON_KEY.'
    );
  }
};

/* Maps a failed GoTrue sign-in to a message a person can act on. */
function signinFailure(status, data) {
  const code = String(data?.error_code || data?.error || '');
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
  sweep();

  const ip = req.socket?.remoteAddress || 'unknown';

  if (path === '/api/auth/config' && method === 'GET') {
    return send(res, 200, {
      mode: authMode(),
      provider: supabaseConfigured() ? 'supabase' : 'dev',
      minPasswordLength: MIN_PASSWORD,
    });
  }

  if (path === '/api/auth/signup' && method === 'POST') {
    requireSupabase();
    const body = await readJson(req);
    const { email, password } = credentials(body);
    throttle(`signup:${ip}`, 10, 60 * 60 * 1000);

    const { status, data } = await callSupabaseAuth('/signup', {
      method: 'POST',
      body: { email, password },
    });

    if (status >= 400) {
      const code = String(data?.error_code || '');
      if (code === 'user_already_exists' || /already registered/i.test(supabaseMessage(data))) {
        return fail(res, 409, 'email_taken', 'An account with that email already exists');
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
    throttle(`signin:${ip}:${email}`, 8, 10 * 60 * 1000);

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

  if (path === '/api/auth/recover' && method === 'POST') {
    requireSupabase();
    const body = await readJson(req);
    const email = String(body.email || '').trim().toLowerCase();
    if (!EMAIL_RE.test(email)) throw new HttpError(400, 'invalid_email', 'Enter a valid email address');
    throttle(`recover:${ip}`, 5, 60 * 60 * 1000);

    // Never report whether the address exists.
    await callSupabaseAuth('/recover', { method: 'POST', body: { email } }).catch(() => null);

    return send(res, 200, {
      ok: true,
      message: 'If that address has an account, a reset link is on its way.',
    });
  }

  return fail(res, 404, 'not_found', `${method} ${path} is not an endpoint`);
}
