/* ARCADE LABS — Supabase bridge.

   Loaded lazily: nothing is fetched while config.js is blank, so local mode
   costs zero network and zero dependencies. When configured, every reward is
   recomputed inside Postgres (see supabase/migrations) and the client only
   submits raw session facts. The browser never decides XP or K-Points. */

import { SUPABASE, isConfigured } from './config.js';

const CDN = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

let clientPromise = null;

export function cloudEnabled() {
  return isConfigured();
}

export function getClient() {
  if (!cloudEnabled()) return Promise.resolve(null);
  if (!clientPromise) {
    clientPromise = import(CDN)
      .then(({ createClient }) =>
        createClient(SUPABASE.url.trim(), SUPABASE.anonKey.trim(), {
          auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
        }),
      )
      .catch((err) => {
        console.warn('[arcade] Supabase SDK failed to load:', err);
        return null;
      });
  }
  return clientPromise;
}

export async function currentUser() {
  const sb = await getClient();
  if (!sb) return null;
  const { data } = await sb.auth.getUser();
  return data?.user ?? null;
}

export async function signUp(email, password, nickname) {
  const sb = await getClient();
  if (!sb) return { ok: false, reason: 'Cloud mode is not configured.' };
  const { data, error } = await sb.auth.signUp({
    email,
    password,
    options: { data: { nickname } },
  });
  if (error) return { ok: false, reason: error.message };
  return { ok: true, user: data.user, needsConfirm: !data.session };
}

export async function signIn(email, password) {
  const sb = await getClient();
  if (!sb) return { ok: false, reason: 'Cloud mode is not configured.' };
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, reason: error.message };
  return { ok: true, user: data.user };
}

export async function signOut() {
  const sb = await getClient();
  if (sb) await sb.auth.signOut();
}

export async function fetchProfile() {
  const sb = await getClient();
  if (!sb) return null;
  const { data, error } = await sb.from('arcade_profiles').select('*').maybeSingle();
  if (error) {
    console.warn('[arcade] profile fetch failed:', error.message);
    return null;
  }
  return data;
}

/**
 * Send a finished session to Postgres for verification and rewards.
 * `payload` carries raw facts only; the database owns the math.
 */
export async function submitSession(slug, payload, clientId) {
  const sb = await getClient();
  if (!sb) return null;
  const { data, error } = await sb.rpc('arcade_complete_session', {
    p_game_slug: slug,
    p_payload: payload,
    p_client_id: clientId,
  });
  if (error) {
    console.warn('[arcade] session rejected by server:', error.message);
    return { ok: false, reason: error.message };
  }
  return { ok: true, result: data };
}

/* Code Escape: read the published challenge bank from Postgres. Returns null
   when cloud mode is off or the table has not been migrated yet, so callers
   can fall back to the bundled bank. */
export async function fetchCodeChallenges() {
  const sb = await getClient();
  if (!sb) return null;
  const { data, error } = await sb
    .from('arcade_code_challenges')
    .select('slug, level, difficulty, language, kind, title, prompt, code, options, answer, explain, source')
    .eq('is_active', true)
    .order('level', { ascending: true });
  if (error) {
    console.warn('[arcade] challenge bank unavailable:', error.message);
    return null;
  }
  return data || [];
}

/** Persist solved challenges and return the server-computed unlock level. */
export async function syncCodeSolves(slugs) {
  const sb = await getClient();
  if (!sb || !slugs?.length) return null;
  const { data, error } = await sb.rpc('arcade_code_solve', { p_slugs: slugs });
  if (error) {
    console.warn('[arcade] code progress not synced:', error.message);
    return null;
  }
  return data;
}

export async function fetchCodeProgress() {
  const sb = await getClient();
  if (!sb) return null;
  const { data, error } = await sb.rpc('arcade_code_progress');
  if (error) {
    console.warn('[arcade] code progress unavailable:', error.message);
    return null;
  }
  return data;
}

export async function fetchLeaderboard(kind, { gameSlug = null, limit = 25, offset = 0 } = {}) {
  const sb = await getClient();
  if (!sb) return [];
  const { data, error } = await sb.rpc('arcade_leaderboard', {
    p_kind: kind,
    p_game: gameSlug,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) {
    console.warn('[arcade] leaderboard failed:', error.message);
    return [];
  }
  return data || [];
}

export async function claimShopItem(itemId) {
  const sb = await getClient();
  if (!sb) return { ok: false, reason: 'Cloud mode is not configured.' };
  const { data, error } = await sb.rpc('arcade_purchase', { p_item: itemId });
  if (error) return { ok: false, reason: error.message };
  return { ok: true, ...data };
}

export async function onAuthChange(cb) {
  const sb = await getClient();
  if (!sb) return () => {};
  const { data } = sb.auth.onAuthStateChange((_event, session) => cb(session?.user ?? null));
  return () => data.subscription.unsubscribe();
}
