/* ARCADE LABS — progression engine.
   Applies the exact reward pipeline from the specification:
   validate -> score -> XP -> K-Points -> daily cap -> level -> achievements
   -> daily challenges -> streak -> leaderboard -> ledger.

   The ledger is append-only and keyed by idempotency keys, so submitting the
   same session twice can never pay out twice. When Supabase is configured the
   server recalculates all of this again; this local copy is the offline
   mirror and the instant UI cache. */

import {
  ACHIEVEMENTS,
  DAILY_CHALLENGES,
  DAILY_CHALLENGE_KP_CAP,
  DAILY_KP_CAP,
  computeReward,
  dayDiff,
  kolkataDate,
  levelFromXp,
  levelUpKp,
  streakKp,
} from './rules.js';

const KEY = 'arcade:labs:v1';

export const KP_SHOP = [
  { id: 'theme-basic', title: 'Basic profile theme', kp: 50 },
  { id: 'theme-premium', title: 'Premium profile theme', kp: 100 },
  { id: 'avatar-accessory', title: 'Avatar accessory', kp: 75 },
  { id: 'badge-special', title: 'Special badge', kp: 100 },
  { id: 'profile-decoration', title: 'Profile decoration', kp: 150 },
  { id: 'challenge-pack', title: 'Special challenge pack', kp: 200 },
];

const emptyDays = (date) => ({ date, kp: 0, categories: {}, games: [], challenges: {} });

/* Code Escape keeps its own solved set so the level ladder survives a reload.
   Matching rows live in arcade_code_solves; this is the offline mirror. */
const emptyCode = () => ({ solved: [] });

function blank() {
  const today = kolkataDate();
  return {
    version: 1,
    userId: null,
    nickname: 'PLAYER',
    totalXp: 0,
    kPoints: 0,
    currentStreak: 0,
    longestStreak: 0,
    lastSessionDate: null,
    lastStreakDate: null,
    sessions: [],
    byGame: {},
    best: {},
    perfectQuizzes: 0,
    perfectGames: 0,
    codingChallenges: 0,
    puzzles: 0,
    tournamentWins: 0,
    achievements: [],
    ledger: [],
    purchases: [],
    daily: emptyDays(today),
    streakHistory: [],
    code: emptyCode(),
  };
}

let state = null;

function read() {
  if (state) return state;
  try {
    const raw = localStorage.getItem(KEY);
    state = raw ? { ...blank(), ...JSON.parse(raw) } : blank();
  } catch {
    state = blank();
  }
  return state;
}

function write() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage full or blocked: the in-memory state still works for this tab */
  }
}

function ensureDay() {
  const s = read();
  const today = kolkataDate();
  if (!s.daily || s.daily.date !== today) {
    s.daily = emptyDays(today);
    write();
  }
  return s.daily;
}

/* ------------------------------------------------------------------ */
/* ledger                                                             */
/* ------------------------------------------------------------------ */

function ledgerHas(key) {
  return read().ledger.some((row) => row.idempotencyKey === key);
}

function ledgerAdd({ sourceType, sourceId, rewardType, amount, key, status = 'verified', reason = '' }) {
  const s = read();
  if (!amount) return;
  if (ledgerHas(key)) return;
  s.ledger.push({
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    userId: s.userId,
    sourceType,
    sourceId,
    rewardType,
    amount,
    reason,
    status,
    date: kolkataDate(),
    createdAt: new Date().toISOString(),
    idempotencyKey: key,
  });
  write();
}

/* ------------------------------------------------------------------ */
/* K-Points with the daily cap                                        */
/* ------------------------------------------------------------------ */

function grantKp(amount, category, sourceType, sourceId, key, reason) {
  const s = read();
  const day = ensureDay();
  if (amount <= 0) return 0;

  // category ceilings sit under the global cap, never above it
  const ceiling = category === 'daily' ? DAILY_CHALLENGE_KP_CAP : DAILY_KP_CAP;
  const used = day.categories[category] || 0;
  const room = Math.min(DAILY_KP_CAP - day.kp, ceiling - used);
  const granted = Math.max(0, Math.min(amount, room));
  if (granted === 0) return 0;

  day.kp += granted;
  day.categories[category] = used + granted;
  s.kPoints += granted;
  ledgerAdd({ sourceType, sourceId, rewardType: 'kp', amount: granted, key, reason });
  write();
  return granted;
}

function grantXp(amount, sourceType, sourceId, key, reason) {
  const s = read();
  if (amount <= 0) return 0;
  s.totalXp += amount;
  ledgerAdd({ sourceType, sourceId, rewardType: 'xp', amount, key, reason });
  write();
  return amount;
}

/* ------------------------------------------------------------------ */
/* levels                                                             */
/* ------------------------------------------------------------------ */

function applyLevelUps(result) {
  const s = read();
  let guard = 0;
  while (guard++ < 500) {
    const { level, need, intoLevel } = levelFromXp(s.totalXp);
    if (intoLevel < need) break;
    const next = level + 1;
    const key = `level:${next}`;
    if (ledgerHas(key)) break;
    const granted = grantKp(levelUpKp(next), 'level', 'level-up', String(next), key, `Reached level ${next}`);
    result.levelUps.push({ level: next, kp: granted });
    if (next % 5 === 0) result.milestones.push(`Level ${next} milestone`);
    if (next % 10 === 0) result.milestones.push(`Level ${next} badge unlocked`);
  }
  result.level = levelFromXp(s.totalXp);
}

/* ------------------------------------------------------------------ */
/* achievements + daily challenges                                    */
/* ------------------------------------------------------------------ */

function achievementContext() {
  const s = read();
  return {
    sessions: s.sessions.length,
    byGame: s.byGame,
    perfectGames: s.perfectGames,
    perfectQuizzes: s.perfectQuizzes,
    codingChallenges: s.codingChallenges,
    puzzles: s.puzzles,
    streak: s.currentStreak,
    tournamentWins: s.tournamentWins,
    level: levelFromXp(s.totalXp).level,
  };
}

function evaluateAchievements(result) {
  const s = read();
  const ctx = achievementContext();
  for (const a of ACHIEVEMENTS) {
    if (s.achievements.some((x) => x.slug === a.slug)) continue;
    let ok = false;
    try {
      ok = a.test(ctx);
    } catch {
      ok = false;
    }
    if (!ok) continue;
    s.achievements.push({ slug: a.slug, title: a.title, at: new Date().toISOString() });
    const key = `achievement:${a.slug}`;
    const xp = grantXp(a.xp, 'achievement', a.slug, `${key}:xp`, a.title);
    const kp = grantKp(a.kp, 'achievement', 'achievement', a.slug, `${key}:kp`, a.title);
    result.achievements.push({ ...a, xp, kp });
  }
  write();
}

function evaluateDailyChallenges(result) {
  const s = read();
  const day = ensureDay();
  const distinct = new Set(day.games);
  const last = s.sessions[s.sessions.length - 1] || {};

  for (const c of DAILY_CHALLENGES) {
    if (day.challenges[c.slug]) continue;
    let ok = false;
    if (c.slug === 'daily-any') ok = distinct.size >= 1;
    if (c.slug === 'daily-accuracy') ok = typeof last.accuracy === 'number' && last.accuracy >= 0.8;
    if (c.slug === 'daily-three') ok = distinct.size >= 3;
    if (!ok) continue;

    day.challenges[c.slug] = new Date().toISOString();
    const key = `daily:${c.slug}:${day.date}`;
    const xp = grantXp(c.xp, 'daily-challenge', c.slug, `${key}:xp`, c.title);
    const kp = grantKp(c.kp, 'daily', 'daily-challenge', c.slug, `${key}:kp`, c.title);
    result.challenges.push({ ...c, xp, kp });
  }
  write();
}

/* ------------------------------------------------------------------ */
/* streak                                                             */
/* ------------------------------------------------------------------ */

function updateStreak(result) {
  const s = read();
  const today = kolkataDate();
  if (s.lastStreakDate === today) return;

  const gap = s.lastStreakDate ? dayDiff(s.lastStreakDate, today) : null;
  s.currentStreak = gap === 1 ? s.currentStreak + 1 : 1;
  s.lastStreakDate = today;
  if (s.currentStreak > s.longestStreak) s.longestStreak = s.currentStreak;
  s.streakHistory.push({ date: today, streak: s.currentStreak });

  const kp = grantKp(streakKp(s.currentStreak), 'streak', 'streak', today, `streak:${today}`, `Day ${s.currentStreak} streak`);
  result.streak = { day: s.currentStreak, kp };
  write();
}

/* ------------------------------------------------------------------ */
/* public API                                                         */
/* ------------------------------------------------------------------ */

export function profile() {
  const s = read();
  return { ...s, level: levelFromXp(s.totalXp) };
}

export function history() {
  return [...read().sessions].reverse();
}

export function todaySummary() {
  const day = ensureDay();
  return { ...day, remaining: Math.max(0, DAILY_KP_CAP - day.kp) };
}

/**
 * Submit a finished game session.
 * @param {string} slug     game slug
 * @param {object} payload  raw session facts (answers, rounds, ...)
 * @param {object} [options] { sessionId } makes retries idempotent
 */
export function submitSession(slug, payload, options = {}) {
  const s = read();
  const sessionId =
    options.sessionId || `${slug}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const sessionKey = `session:${sessionId}`;

  const existing = s.sessions.find((x) => x.sessionKey === sessionKey);
  if (existing) return { ...existing.result, duplicate: true };

  const calc = computeReward(slug, payload);
  const result = {
    sessionId,
    slug,
    score: calc.score,
    xp: 0,
    kp: 0,
    accuracy: calc.accuracy,
    maxKp: calc.maxKp,
    levelUps: [],
    milestones: [],
    achievements: [],
    challenges: [],
    streak: null,
    capped: false,
    meta: calc.meta,
  };

  // A session that fails the minimum completion bar earns nothing at all.
  if (calc.xp === 0 && calc.score === 0) {
    result.rejected = true;
    return result;
  }

  s.sessions.push({
    sessionKey,
    slug,
    score: calc.score,
    accuracy: calc.accuracy,
    at: new Date().toISOString(),
    date: kolkataDate(),
    result,
  });

  s.byGame[slug] = (s.byGame[slug] || 0) + 1;
  s.lastSessionDate = kolkataDate();

  const best = s.best[slug] || 0;
  if (calc.score > best) s.best[slug] = calc.score;
  result.personalBest = calc.score >= best;

  if (calc.accuracy === 1) s.perfectGames += 1;
  if (slug === 'brain-battle' && calc.meta.perfect) s.perfectQuizzes += 1;
  if (slug === 'code-escape') s.codingChallenges += calc.meta.correct || 0;
  if (slug === 'sudoku-master' || slug === '2048-challenge') s.puzzles += 1;

  const day = ensureDay();
  if (!day.games.includes(slug)) day.games.push(slug);

  result.xp = grantXp(calc.xp, 'game', slug, `${sessionKey}:xp`, `Completed ${slug}`);
  result.kp = grantKp(calc.kp, slug, 'game', slug, `${sessionKey}:kp`, `Completed ${slug}`);
  result.capped = result.kp < calc.kp;

  applyLevelUps(result);
  evaluateAchievements(result);
  evaluateDailyChallenges(result);
  updateStreak(result);

  write();
  semantic(result);
  return result;
}

function semantic() {
  /* placeholder kept intentionally empty: cloud sync is handled by cloud.js */
}

/* ------------------------------------------------------------------ */
/* spending                                                           */
/* ------------------------------------------------------------------ */

export function buy(itemId) {
  const s = read();
  const item = KP_SHOP.find((i) => i.id === itemId);
  if (!item) return { ok: false, reason: 'Unknown item' };
  if (s.purchases.some((p) => p.id === itemId)) return { ok: false, reason: 'Already owned' };
  if (s.kPoints < item.kp) return { ok: false, reason: 'Not enough K-Points' };

  s.kPoints -= item.kp;
  s.purchases.push({ id: itemId, title: item.title, kp: item.kp, at: new Date().toISOString() });
  ledgerAdd({
    sourceType: 'purchase',
    sourceId: itemId,
    rewardType: 'kp-spend',
    amount: -item.kp,
    key: `purchase:${itemId}`,
    reason: item.title,
  });
  write();
  return { ok: true, balance: s.kPoints, item };
}

/* ------------------------------------------------------------------ */
/* code escape ladder                                                 */
/* ------------------------------------------------------------------ */

export function codeSolvedIds() {
  const s = read();
  return Array.isArray(s.code?.solved) ? [...s.code.solved] : [];
}

/**
 * Record correctly answered challenges. Returns only the ids that were new,
 * so the caller can tell the player what actually changed.
 */
export function recordCodeSolves(ids) {
  const s = read();
  if (!s.code || !Array.isArray(s.code.solved)) s.code = emptyCode();
  const set = new Set(s.code.solved);
  const added = [];
  for (const id of ids || []) {
    if (!id || set.has(id)) continue;
    set.add(id);
    added.push(id);
  }
  if (added.length) {
    s.code.solved = [...set];
    write();
  }
  return added;
}

export function localLeaderboard(kind = 'xp-all') {
  const s = read();
  const { level } = levelFromXp(s.totalXp);
  return [{ name: s.nickname, value: kind === 'game' ? s.totalXp : s.totalXp, level }];
}

export function resetLocal() {
  state = blank();
  write();
}

export function setNickname(name) {
  const s = read();
  s.nickname = String(name || 'PLAYER').slice(0, 18).toUpperCase() || 'PLAYER';
  write();
}
