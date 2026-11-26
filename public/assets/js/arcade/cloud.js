/* ARCADE — the same account as the rest of Student Icon.

   This used to be a second identity system: a Supabase client in the browser
   with its own copied anon key and a free-text nickname, so an arcade "account"
   was not the player account at all. It now delegates to the same-origin
   /api/arcade/* and /api/auth/* routes, so one sign-in covers both halves of
   the universe and the reward maths still runs inside Postgres.

   Local mode remains the fallback: with no session, or no API answering, every
   game still plays and records stay in this browser (store.js).
*/

import { loadSession, saveSession, ensureFresh, signOutRequest } from '../icon/session.js';

/* True when the arcade can reach an account. The header says ACCOUNT when a
   session exists and LOCAL MODE when it does not; both are normal. */
export function cloudEnabled() {
  return true;
}

async function request(path, { method = 'GET', body } = {}) {
  const session = await ensureFresh(loadSession());
  const headers = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (session?.accessToken) headers.authorization = `Bearer ${session.accessToken}`;

  let res;
  try {
    res = await fetch(path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (err) {
    return { status: 0, data: null, error: err };
  }

  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

export async function currentUser() {
  const session = await ensureFresh(loadSession());
  if (!session?.accessToken) return null;

  const me = await request('/api/me');
  if (me.status === 401) return null;
  // 200 signed in with a player, 404 signed in without one: both are accounts.
  if (me.status !== 200 && me.status !== 404) return null;

  return session.user || { id: null, email: null };
}

export async function signUp(email, password, nickname) {
  const res = await fetch('/api/auth/signup', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  }).catch(() => null);

  if (!res) return { ok: false, reason: 'The API is not reachable.' };
  const data = await res.json().catch(() => null);
  if (!res.ok) return { ok: false, reason: data?.error?.message || 'Could not create the account' };

  if (data?.session) saveSession(data.session);
  else request('/api/session/sync', { method: 'POST', body: { handle: nickname, displayName: nickname } });

  return { ok: true, user: data?.user || null, needsConfirm: !data?.session };
}

export async function signIn(email, password) {
  const res = await fetch('/api/auth/signin', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  }).catch(() => null);

  if (!res) return { ok: false, reason: 'The API is not reachable.' };
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.session) {
    return { ok: false, reason: data?.error?.message || 'Could not sign in' };
  }

  saveSession(data.session);
  return { ok: true, user: data.session.user };
}

export async function signOut() {
  await signOutRequest();
}

export async function fetchProfile() {
  const { status, data } = await request('/api/arcade/profile');
  return status === 200 ? data?.profile || null : null;
}

/**
 * Send a finished session to the server for verification and rewards.
 * `payload` carries raw facts only; the database owns the math.
 */
export async function submitSession(slug, payload, clientId) {
  const { status, data } = await request('/api/arcade/sessions', {
    method: 'POST',
    body: { game: slug, payload, clientId },
  });

  if (status !== 200) {
    console.warn('[arcade] session rejected by server:', data?.error?.message || status);
    return { ok: false, reason: data?.error?.message || `HTTP ${status}` };
  }
  return { ok: true, result: data?.result || null };
}

/* Code Escape: read the published challenge bank from the server. Returns null
   when the API is unavailable, so callers fall back to the bundled bank. */
export async function fetchCodeChallenges() {
  const { status, data } = await request('/api/arcade/challenges');
  if (status !== 200 || !Array.isArray(data?.challenges)) return null;
  return data.challenges;
}

/** Persist solved challenges and return the server-computed unlock level. */
export async function syncCodeSolves(slugs) {
  if (!slugs?.length) return null;
  const { status, data } = await request('/api/arcade/code-solves', {
    method: 'POST',
    body: { slugs },
  });
  return status === 200 ? data?.result || null : null;
}
