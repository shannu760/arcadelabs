/* Student Icon — session store (browser).

   Holds the Supabase access token pair this origin received from our own
   /api/auth/* routes. It is a token, not a password: the password never reaches
   this code, and the Supabase anon key is never sent to the browser.

   Storage is localStorage, which means any script on this origin could read the
   token. That is the normal trade-off for a same-origin app with no cookie
   domain of its own; if the app grows third-party scripts this should move to
   an HttpOnly cookie set by the server.
*/

const KEY = 'si.session';
const SKEW_MS = 30000;

export function loadSession() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const session = JSON.parse(raw);
    if (!session || typeof session.accessToken !== 'string' || !session.accessToken) return null;
    return session;
  } catch {
    return null;
  }
}

export function saveSession(session) {
  try {
    localStorage.setItem(KEY, JSON.stringify(session));
  } catch {
    /* storage full or blocked: the session simply will not survive a reload */
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing to do */
  }
}

const isExpired = (session) =>
  !session?.accessToken ||
  !Number.isFinite(session.expiresAt) ||
  Date.now() > session.expiresAt - SKEW_MS;

async function refreshSession(refreshToken) {
  if (!refreshToken) return null;

  const res = await fetch('/api/auth/refresh', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  }).catch(() => null);

  if (!res || !res.ok) {
    clearSession();
    return null;
  }

  const data = await res.json().catch(() => null);
  if (!data?.session) {
    clearSession();
    return null;
  }

  saveSession(data.session);
  return data.session;
}

/** Returns a session that is still valid, refreshing it if it has expired. */
export async function ensureFresh(session = loadSession()) {
  if (!session) return null;
  if (!isExpired(session)) return session;
  if (!session.refreshToken) {
    clearSession();
    return null;
  }
  return refreshSession(session.refreshToken);
}

/** Reads tokens Supabase appends to the redirect URL after email confirmation. */
export function captureUrlSession() {
  const hash = location.hash.startsWith('#') ? location.hash.slice(1) : '';
  const query = location.search.startsWith('?') ? location.search.slice(1) : '';
  const params = new URLSearchParams(hash || query);

  const accessToken = params.get('access_token');
  const error = params.get('error_description') || params.get('error');

  if (accessToken) {
    const expiresIn = Number(params.get('expires_in'));
    saveSession({
      accessToken,
      refreshToken: params.get('refresh_token') || null,
      expiresAt:
        Date.now() + (Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 3600) * 1000,
      user: null,
    });
    history.replaceState(null, '', location.pathname);
    return { notice: 'Email confirmed. Finish setting up your player.' };
  }

  if (error) {
    history.replaceState(null, '', location.pathname);
    return { error: decodeURIComponent(error.replace(/\+/g, ' ')) };
  }

  return null;
}

export async function signOutRequest() {
  const session = loadSession();

  try {
    await fetch('/api/auth/signout', {
      method: 'POST',
      headers: session?.accessToken ? { authorization: `Bearer ${session.accessToken}` } : {},
    });
  } catch {
    /* the client still drops its tokens below */
  }

  clearSession();
}
