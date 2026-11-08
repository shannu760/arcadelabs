/* ARCADE LABS — shared rules engine.
   Pure functions only: no DOM, no storage, no network. Every number in this
   file comes from the ARCADE LABS economy specification. The same rules are
   mirrored in supabase/migrations/0001_arcade_labs.sql so a session submitted
   to the database is recalculated server-side and never trusted from here. */

export const DAILY_KP_CAP = 100;
export const DAILY_CHALLENGE_KP_CAP = 20;
export const TOURNAMENT_KP_CAP = 10;
export const TZ = 'Asia/Kolkata';

/* ------------------------------------------------------------------ */
/* game catalogue                                                      */
/* ------------------------------------------------------------------ */

export const GAMES = [
  {
    slug: 'brain-battle',
    title: 'Brain Battle',
    blurb: 'Six subjects. Four options. A clock that never waits.',
    category: 'Quiz',
    accent: 'lime',
    href: './labs/brain-battle.html',
  },
  {
    slug: 'memory-champion',
    title: 'Memory Champion',
    blurb: 'Objects, sequences and 20 items with 60 seconds to burn them in.',
    category: 'Memory',
    accent: 'pink',
    href: './memory.html',
  },
  {
    slug: '2048-challenge',
    title: '2048 Challenge',
    blurb: 'Merge, slide, survive. The classic, with real tile rules.',
    category: 'Puzzle',
    accent: 'gold',
    href: './labs/2048.html',
  },
  {
    slug: 'word-master',
    title: 'Word Master',
    blurb: 'Six attempts, five letters, zero mercy.',
    category: 'Word',
    accent: 'cyan',
    href: './labs/word-master.html',
  },
  {
    slug: 'typing-ninja',
    title: 'Typing Ninja',
    blurb: '30, 60 or 120 seconds. Speed means nothing without accuracy.',
    category: 'Skill',
    accent: 'lime',
    href: './labs/typing-ninja.html',
  },
  {
    slug: 'code-escape',
    title: 'Code Escape',
    blurb: 'Python, C and Java puzzles: predict, debug, complete.',
    category: 'Code',
    accent: 'violet',
    href: './labs/code-escape.html',
  },
  {
    slug: 'sudoku-master',
    title: 'Sudoku Master',
    blurb: 'Generated puzzles with exactly one solution.',
    category: 'Puzzle',
    accent: 'cyan',
    href: './labs/sudoku.html',
  },
  {
    slug: 'geo-genius',
    title: 'Geo Genius',
    blurb: 'States, capitals, flags and landmarks against the clock.',
    category: 'Quiz',
    accent: 'gold',
    href: './labs/geo-genius.html',
  },
  {
    slug: 'physics-lab',
    title: 'Physics Lab',
    blurb: 'Numbers, formulas and simulations that obey the laws.',
    category: 'Science',
    accent: 'pink',
    href: './labs/physics-lab.html',
  },
  {
    slug: 'startup-tycoon',
    title: 'Startup Tycoon',
    blurb: 'Run a fictional company. Every choice costs something.',
    category: 'Simulation',
    accent: 'lime',
    href: './labs/startup-tycoon.html',
  },
  {
    slug: 'idea-forge',
    title: 'SCI-FI Idea Forge',
    blurb: 'Invent the future, get scored on it, spend Idea Points on powers.',
    category: 'Creative',
    accent: 'violet',
    href: './labs/idea-forge.html',
  },
];

export const GAME_BY_SLUG = Object.fromEntries(GAMES.map((g) => [g.slug, g]));

/* ------------------------------------------------------------------ */
/* levels: 100 x current level, cumulative and permanent               */
/* ------------------------------------------------------------------ */

export function xpToNext(level) {
  return 100 * Math.max(1, level);
}

export function levelFromXp(totalXp) {
  let level = 1;
  let remaining = Math.max(0, Math.floor(totalXp || 0));
  while (remaining >= xpToNext(level)) {
    remaining -= xpToNext(level);
    level += 1;
  }
  return { level, intoLevel: remaining, need: xpToNext(level), totalXp: totalXp || 0 };
}

/** K-Points granted for a single level-up. 10 per level, +25 on every 5th. */
export function levelUpKp(level) {
  return 10 + (level % 5 === 0 ? 25 : 0);
}

/* ------------------------------------------------------------------ */
/* streaks                                                            */
/* ------------------------------------------------------------------ */

export const STREAK_REWARDS = [0, 2, 3, 4, 5, 6, 15];

/**
 * K-Points for a streak of `day` consecutive days. Day 1 pays nothing and the
 * seven-day table repeats afterwards.
 */
export function streakKp(day) {
  if (day <= 1) return 0;
  const idx = ((day - 1) % 7) + 1;
  return STREAK_REWARDS[idx - 1];
}

/* ------------------------------------------------------------------ */
/* achievements                                                       */
/* ------------------------------------------------------------------ */

export const ACHIEVEMENTS = [
  {
    slug: 'first-victory',
    title: 'First Victory',
    desc: 'Complete your first valid game.',
    xp: 10,
    kp: 2,
    test: (c) => c.sessions >= 1,
  },
  {
    slug: 'brain-master',
    title: 'Brain Master',
    desc: 'Complete 10 quizzes.',
    xp: 25,
    kp: 5,
    test: (c) => (c.byGame['brain-battle'] || 0) >= 10,
  },
  {
    slug: 'memory-expert',
    title: 'Memory Expert',
    desc: 'Complete 10 memory games.',
    xp: 25,
    kp: 5,
    test: (c) => (c.byGame['memory-champion'] || 0) >= 10,
  },
  {
    slug: 'coding-beginner',
    title: 'Coding Beginner',
    desc: 'Complete 5 coding challenges.',
    xp: 20,
    kp: 5,
    test: (c) => c.codingChallenges >= 5,
  },
  {
    slug: 'coding-expert',
    title: 'Coding Expert',
    desc: 'Complete 50 coding challenges.',
    xp: 100,
    kp: 15,
    test: (c) => c.codingChallenges >= 50,
  },
  {
    slug: 'puzzle-solver',
    title: 'Puzzle Solver',
    desc: 'Complete 20 puzzles.',
    xp: 40,
    kp: 8,
    test: (c) => c.puzzles >= 20,
  },
  {
    slug: 'seven-day-streak',
    title: 'Seven-Day Streak',
    desc: 'Keep a streak alive for seven days.',
    xp: 50,
    kp: 15,
    test: (c) => c.streak >= 7,
  },
  {
    slug: 'quiz-champion',
    title: 'Quiz Champion',
    desc: 'Finish 10 quizzes with perfect accuracy.',
    xp: 50,
    kp: 10,
    test: (c) => c.perfectQuizzes >= 10,
  },
  {
    slug: 'perfect-score',
    title: 'Perfect Score',
    desc: 'Hit 100% accuracy in a valid game.',
    xp: 25,
    kp: 5,
    test: (c) => c.perfectGames >= 1,
  },
  {
    slug: 'tournament-winner',
    title: 'Tournament Winner',
    desc: 'Win a verified tournament.',
    xp: 100,
    kp: 20,
    test: (c) => c.tournamentWins >= 1,
  },
  {
    slug: 'decade',
    title: 'Double Digits',
    desc: 'Reach level 10.',
    xp: 0,
    kp: 0,
    test: (c) => c.level >= 10,
  },
];

/* ------------------------------------------------------------------ */
/* daily challenges                                                   */
/* ------------------------------------------------------------------ */

export const DAILY_CHALLENGES = [
  {
    slug: 'daily-any',
    title: 'Open the arcade',
    desc: 'Complete any one valid game.',
    xp: 10,
    kp: 2,
  },
  {
    slug: 'daily-accuracy',
    title: 'Sharp shooter',
    desc: 'Reach at least 80% accuracy in a quiz.',
    xp: 15,
    kp: 3,
  },
  {
    slug: 'daily-three',
    title: 'Triple threat',
    desc: 'Complete three different games today.',
    xp: 20,
    kp: 5,
  },
];

/* ------------------------------------------------------------------ */
/* helpers                                                            */
/* ------------------------------------------------------------------ */

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const int = (n) => Math.max(0, Math.round(Number(n) || 0));
const pct = (n) => clamp(Number(n) || 0, 0, 1);

/** Speed bonus for Brain Battle: 20 / 15 / 10 / 5 by share of the timer used. */
export function speedBonus(elapsedMs, limitMs) {
  if (!limitMs) return 5;
  const frac = clamp(elapsedMs / limitMs, 0, 1);
  if (frac <= 0.25) return 20;
  if (frac <= 0.5) return 15;
  if (frac <= 0.75) return 10;
  return 5;
}

/**
 * Word Master letter scoring. Duplicate letters are handled with the classic
 * two-pass algorithm so a repeated guess letter cannot double-count.
 */
export function scoreGuess(target, guess) {
  const t = String(target || '').toLowerCase();
  const g = String(guess || '').toLowerCase();
  const marks = new Array(g.length).fill('absent');
  const pool = t.split('');

  for (let i = 0; i < g.length; i++) {
    if (g[i] === pool[i]) {
      marks[i] = 'correct';
      pool[i] = null;
    }
  }
  for (let i = 0; i < g.length; i++) {
    if (marks[i] === 'correct') continue;
    const at = pool.indexOf(g[i]);
    if (at !== -1 && pool[at] !== null) {
      marks[i] = 'present';
      pool[at] = null;
    }
  }

  let score = 0;
  for (const m of marks) score += m === 'correct' ? 10 : m === 'present' ? 5 : 0;
  return { marks, score, solved: g === t };
}

export const WORD_SOLVE_BONUS = { 1: 100, 2: 80, 3: 60, 4: 40, 5: 20, 6: 10 };

/* ------------------------------------------------------------------ */
/* per-game reward calculation                                        */
/* ------------------------------------------------------------------ */

const empty = (maxKp) => ({ score: 0, xp: 0, kp: 0, maxKp, accuracy: null, meta: {} });

function brainBattle(p) {
  const out = empty(10);
  const answers = Array.isArray(p.answers) ? p.answers : [];
  if (answers.length < 5) return out; // minimum valid completion
  let score = 0;
  let correct = 0;
  for (const a of answers) {
    if (!a || !a.correct) continue;
    correct += 1;
    score += 100 + speedBonus(a.elapsedMs, a.limitMs);
  }
  const accuracy = correct / answers.length;
  out.score = score;
  out.accuracy = accuracy;
  out.xp = 10 + 5 * correct + (correct === answers.length ? 20 : 0);
  out.kp = Math.min(10, Math.floor(accuracy * 10));
  out.meta = { correct, answered: answers.length, perfect: correct === answers.length };
  return out;
}

function memoryChampion(p) {
  const out = empty(10);
  const rounds = Array.isArray(p.rounds) ? p.rounds : [];
  if (!rounds.length) return out;
  let score = 0;
  let hits = 0;
  let total = 0;
  let perfectRounds = 0;
  for (const r of rounds) {
    const correct = int(r.correct);
    const size = int(r.total);
    hits += Math.min(correct, size);
    total += size;
    score += 10 * Math.min(correct, size);
    if (size > 0 && correct >= size) {
      perfectRounds += 1;
      score += 25;
    }
  }
  if (perfectRounds === rounds.length) score += 50;
  const accuracy = total ? hits / total : 0;
  out.score = score;
  out.accuracy = accuracy;
  out.xp = 10 + 5 * rounds.length + (perfectRounds === rounds.length ? 20 : 0);
  out.kp = Math.min(10, Math.floor(accuracy * 10));
  out.meta = { rounds: rounds.length, perfectRounds, hits, total };
  return out;
}

function challenge2048(p) {
  const out = empty(8);
  const score = int(p.score);
  const highest = int(p.highestTile);
  if (int(p.moves) < 10) return out; // must be a real session
  out.score = score;
  out.xp = 5 + (highest >= 512 ? 5 : 0) + (highest >= 1024 ? 10 : 0) + (highest >= 2048 ? 25 : 0);
  out.kp = (highest >= 512 ? 1 : 0) + (highest >= 1024 ? 2 : 0) + (highest >= 2048 ? 5 : 0);
  out.meta = { highestTile: highest, moves: int(p.moves), won: !!p.won };
  return out;
}

function wordMaster(p) {
  const out = empty(8);
  const attempts = Array.isArray(p.attempts) ? p.attempts : [];
  const target = String(p.target || '');
  if (!target || !attempts.length) return out;
  let score = 0;
  let letters = 0;
  attempts.forEach((guess) => {
    const r = scoreGuess(target, guess);
    score += r.score;
    letters += r.marks.length;
  });
  const solvedAt = attempts.findIndex((g) => String(g).toLowerCase() === target.toLowerCase()) + 1;
  const solved = solvedAt > 0;
  if (solved) score += WORD_SOLVE_BONUS[solvedAt] || 0;
  out.score = score;
  out.accuracy = letters ? null : null;
  out.xp = 5 + (solved ? 15 : 0) + (solved && solvedAt <= 3 ? 10 : 0);
  out.kp = solved ? (solvedAt <= 2 ? 8 : solvedAt <= 4 ? 6 : 4) : 0;
  out.meta = { attempts: attempts.length, solved, solvedAt };
  return out;
}

function typingNinja(p) {
  const out = empty(5);
  const seconds = Number(p.durationSec) || 0;
  const correct = int(p.correctChars);
  const incorrect = int(p.incorrectChars);
  if (seconds < 5 || correct + incorrect < 10) return out;
  const total = correct + incorrect;
  const accuracy = total ? correct / total : 0;
  const wpm = Math.round(correct / 5 / (seconds / 60));
  out.score = wpm; // score = verified words per minute
  out.accuracy = accuracy;
  out.xp = 5 + (accuracy >= 0.9 ? 5 : 0) + (accuracy >= 0.98 ? 10 : 0);
  // speed without accuracy earns nothing
  out.kp = accuracy >= 0.98 ? 5 : accuracy >= 0.9 ? 2 : 0;
  out.meta = { wpm, correct, incorrect, seconds };
  return out;
}

const DIFF_POINTS = { basic: 10, intermediate: 20, advanced: 30 };
const DIFF_XP = { basic: 5, intermediate: 10, advanced: 15 };
const DIFF_KP = { basic: 1, intermediate: 2, advanced: 3 };

function codeEscape(p) {
  const out = empty(10);
  const items = Array.isArray(p.challenges) ? p.challenges : [];
  if (!items.length) return out;
  let score = 0;
  let xp = 0;
  let kp = 0;
  let correctCount = 0;
  for (const it of items) {
    const diff = DIFF_POINTS[it.difficulty] ? it.difficulty : 'basic';
    if (it.correct) {
      correctCount += 1;
      score += DIFF_POINTS[diff];
      xp += DIFF_XP[diff];
      kp += DIFF_KP[diff];
    }
  }
  if (items.every((it) => it.correct)) xp += 20;
  out.score = score;
  out.xp = xp;
  out.kp = Math.min(10, kp);
  out.accuracy = correctCount / items.length;
  out.meta = { challenges: items.length, correct: correctCount };
  return out;
}

const SUDOKU_MULT = { easy: 1, medium: 1.5, hard: 2 };
const SUDOKU_XP = { easy: 5, medium: 10, hard: 15 };
const SUDOKU_KP = { easy: 1, medium: 2, hard: 3 };

function sudokuMaster(p) {
  const out = empty(3);
  if (!p.solved) return out;
  const diff = SUDOKU_MULT[p.difficulty] ? p.difficulty : 'easy';
  const hints = clamp(int(p.hints), 0, 5);
  const penalty = 1 - Math.min(0.5, 0.1 * hints);
  out.score = Math.round(100 * SUDOKU_MULT[diff] * penalty);
  out.xp = SUDOKU_XP[diff];
  out.kp = SUDOKU_KP[diff];
  out.accuracy = 1;
  out.meta = { difficulty: diff, hints, seconds: int(p.seconds) };
  return out;
}

function geoGenius(p) {
  const out = empty(4);
  const answers = Array.isArray(p.answers) ? p.answers : [];
  if (answers.length < 5) return out;
  const correct = answers.filter((a) => a && a.correct).length;
  const perfect = correct === answers.length;
  out.score = correct * 10 + (perfect ? 25 : 0);
  out.accuracy = correct / answers.length;
  out.xp = 5 + (perfect ? 10 : 0);
  out.kp = 2 + (perfect ? 2 : 0);
  out.meta = { correct, answered: answers.length, perfect };
  return out;
}

function physicsLab(p) {
  const out = empty(10);
  const items = Array.isArray(p.experiments) ? p.experiments : [];
  if (!items.length) return out;
  let score = 0;
  let xp = 0;
  let kp = 0;
  let correct = 0;
  for (const it of items) {
    const diff = DIFF_POINTS[it.difficulty] ? it.difficulty : 'basic';
    if (!it.correct) continue;
    correct += 1;
    score += DIFF_POINTS[diff] + (int(it.hintsUsed) === 0 ? 10 : 0);
    xp += DIFF_XP[diff];
    kp += DIFF_KP[diff];
  }
  if (items.every((it) => it.correct)) xp += 20;
  out.score = score;
  out.xp = xp;
  out.kp = Math.min(10, kp);
  out.accuracy = correct / items.length;
  out.meta = { experiments: items.length, correct };
  return out;
}

function startupTycoon(p) {
  const out = empty(5);
  if (!p.completed) return out;
  const parts = {
    profitability: clamp(Number(p.profitability) || 0, 0, 40),
    satisfaction: clamp(Number(p.satisfaction) || 0, 0, 25),
    resources: clamp(Number(p.resources) || 0, 0, 20),
    decisions: clamp(Number(p.decisions) || 0, 0, 15),
  };
  const score = Math.round(parts.profitability + parts.satisfaction + parts.resources + parts.decisions);
  out.score = score;
  out.xp = 10 + (score >= 70 ? 5 : 0) + (score >= 90 ? 10 : 0);
  out.kp = (score >= 70 ? 2 : 0) + (score >= 90 ? 3 : 0);
  out.meta = parts;
  return out;
}

const CALCULATORS = {
  'brain-battle': brainBattle,
  'memory-champion': memoryChampion,
  '2048-challenge': challenge2048,
  'word-master': wordMaster,
  'typing-ninja': typingNinja,
  'code-escape': codeEscape,
  'sudoku-master': sudokuMaster,
  'geo-genius': geoGenius,
  'physics-lab': physicsLab,
  'startup-tycoon': startupTycoon,
};

export function computeReward(slug, payload = {}) {
  const fn = CALCULATORS[slug];
  if (!fn) throw new Error(`Unknown game: ${slug}`);
  const out = fn(payload);
  out.score = int(out.score);
  out.xp = int(out.xp);
  out.kp = int(out.kp);
  return out;
}

/* ------------------------------------------------------------------ */
/* date buckets (Asia/Kolkata)                                        */
/* ------------------------------------------------------------------ */

/** YYYY-MM-DD in Asia/Kolkata, independent of the machine's timezone. */
export function kolkataDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (t) => parts.find((p) => p.type === t)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function dayDiff(a, b) {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
}
