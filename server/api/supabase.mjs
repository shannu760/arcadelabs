/* Supabase Auth client, server side.

   Only public values are used: the project URL and the anon key. The anon key
   is designed to be public; it is not a secret and it is never sent to the
   browser — the browser only ever sees a session token from our own origin.

   No service-role key is used here. Creating an account and reading a session
   are exactly the operations the anon key is allowed to perform, and the user's
   own token authorises their own rows afterwards.

   Everything that talks to Supabase lives in this file so the route handlers
   stay readable and there is one place to check when a request misbehaves.
*/

import { HttpError } from './http.mjs';

const TIMEOUT_MS = 10000;

export const supabaseBase = () => String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');

export const supabaseKey = () => String(process.env.SUPABASE_ANON_KEY || '');

/** Calls a Supabase Auth endpoint with the anon key, optionally as a user. */
export async function callSupabaseAuth(path, { method = 'GET', token, body } = {}) {
  const headers = { apikey: supabaseKey() };
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (token) headers.authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(`${supabaseBase()}/auth/v1${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    throw new HttpError(
      502,
      'auth_unreachable',
      `Could not reach Supabase Auth (${err.name === 'TimeoutError' ? 'timed out' : 'network error'})`
    );
  }

  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  return { status: res.status, data };
}

/** Supabase reports errors under several keys depending on the endpoint. */
export function supabaseMessage(data) {
  if (!data || typeof data !== 'object') return '';
  return String(data.error_description || data.msg || data.message || data.error || '').trim();
}

/** Normalises a GoTrue session into the shape the browser stores. */
export function shapeSession(data) {
  if (!data || typeof data.access_token !== 'string' || !data.access_token) return null;

  const expiresIn = Number(data.expires_in);
  const user = data.user && typeof data.user.id === 'string' ? data.user : null;

  return {
    accessToken: data.access_token,
    refreshToken: typeof data.refresh_token === 'string' ? data.refresh_token : null,
    expiresAt: Date.now() + (Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 3600) * 1000,
    user: user ? { id: user.id, email: typeof user.email === 'string' ? user.email : null } : null,
  };
}

export const shapeUser = (data) => {
  const user = data?.user ?? data;
  if (!user || typeof user.id !== 'string') return null;
  return { id: user.id, email: typeof user.email === 'string' ? user.email : null };
};
