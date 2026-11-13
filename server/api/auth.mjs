/* Who is calling?

   Two modes, chosen by environment:

   supabase  SUPABASE_URL + SUPABASE_ANON_KEY are set. The bearer token is
             checked against Supabase Auth's own /auth/v1/user endpoint, so no
             signing keys or crypto live in this project. Works with any
             project without configuration beyond the two public values.

   dev       No Supabase configured. Accepts an `x-dev-user` UUID, but only for
             loopback callers and never when NODE_ENV=production. This is a
             development convenience, not an auth system.
*/

import { supabaseBase, supabaseKey } from './supabase.mjs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LOOPBACK_RE = /^(127\.0\.0\.1|::1|::ffff:127\.0\.0\.1)$/;

export const supabaseConfigured = () =>
  Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY);

export const authMode = () => (supabaseConfigured() ? 'supabase' : 'dev');

export async function authenticate(req) {
  return supabaseConfigured() ? verifyWithSupabase(req) : devSession(req);
}

function devSession(req) {
  if (process.env.NODE_ENV === 'production') return null;

  const remote = req.socket?.remoteAddress || '';
  if (remote && !LOOPBACK_RE.test(remote)) return null;

  const id = String(req.headers['x-dev-user'] || '').trim();
  if (!UUID_RE.test(id)) return null;

  return { userId: id, mode: 'dev', email: null };
}

async function verifyWithSupabase(req) {
  const header = String(req.headers.authorization || '');
  if (!header.startsWith('Bearer ')) return null;

  const token = header.slice(7).trim();
  if (!token) return null;

  let res;
  try {
    res = await fetch(`${supabaseBase()}/auth/v1/user`, {
      headers: {
        apikey: supabaseKey(),
        authorization: `Bearer ${token}`,
      },
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    return null;
  }

  if (!res.ok) return null;

  const user = await res.json().catch(() => null);
  if (!user || typeof user.id !== 'string' || !UUID_RE.test(user.id)) return null;

  return { userId: user.id, mode: 'supabase', email: user.email || null };
}

export { UUID_RE };
