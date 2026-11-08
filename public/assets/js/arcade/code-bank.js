/* Code Escape question store.

   Source of truth for the questions is data/code-challenges.js, so the game
   works with zero network. When Supabase is configured (see config.js) the
   same questions are read from public.arcade_code_challenges and cached in
   this browser, which means the ladder can still be opened later while
   offline. Only raw rows are cached — never anything user specific. */

import { CHALLENGES } from './data/code-challenges.js';
import { cloudEnabled, fetchCodeChallenges } from './cloud.js';

const CACHE_KEY = 'arcade:codebank:v1';
const CACHE_TTL = 6 * 60 * 60 * 1000; // re-read the database at most every 6h

function normalise(row) {
  return {
    id: String(row.slug ?? row.id ?? ''),
    level: Number(row.level) || 1,
    difficulty: row.difficulty || 'basic',
    language: String(row.language || 'python').toLowerCase(),
    kind: row.kind || 'predict',
    title: row.title || 'Challenge',
    prompt: row.prompt || '',
    code: row.code || '',
    options: Array.isArray(row.options) ? row.options : [],
    answer: Number(row.answer) || 0,
    explain: row.explain || '',
    source: row.source || 'original',
  };
}

/* A row is only usable if the game can actually render it. */
function usable(item) {
  return item.id && item.prompt && Array.isArray(item.options) && item.options.length >= 2 && item.level >= 1;
}

function readCache() {
  try {
    const raw = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    if (!raw || !Array.isArray(raw.items)) return null;
    const items = raw.items.map(normalise).filter(usable);
    if (!items.length) return null;
    return { items, at: Number(raw.at) || 0 };
  } catch {
    return null;
  }
}

function writeCache(items) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), items }));
  } catch {
    /* storage full or blocked: the bundled bank still works */
  }
}

/**
 * Load the challenge bank.
 * @returns {Promise<{ items: object[], source: 'cloud'|'cache'|'bundled', syncedAt: number|null }>}
 */
export async function loadChallenges({ force = false } = {}) {
  const cache = readCache();

  if (!cloudEnabled()) {
    return { items: CHALLENGES, source: 'bundled', syncedAt: cache?.at ?? null };
  }

  if (cache && !force && Date.now() - cache.at < CACHE_TTL) {
    return { items: cache.items, source: 'cache', syncedAt: cache.at };
  }

  try {
    const rows = await fetchCodeChallenges();
    const items = (rows || []).map(normalise).filter(usable);
    if (items.length) {
      writeCache(items);
      return { items, source: 'cloud', syncedAt: Date.now() };
    }
  } catch (err) {
    console.warn('[code-escape] challenge fetch failed, using the local copy:', err);
  }

  if (cache) return { items: cache.items, source: 'cache', syncedAt: cache.at };
  return { items: CHALLENGES, source: 'bundled', syncedAt: null };
}

export const BANK_SOURCE_NOTE = {
  cloud: 'QUESTIONS SYNCED FROM THE ARCADE DATABASE',
  cache: 'OFFLINE COPY · LAST SYNCED',
  bundled: 'LOCAL QUESTION BANK',
};
