/* ARCADE LABS — shared page shell.
   Renders the arcade header strip (level, XP, K-Points, streak, daily cap) and
   the post-game result card. Every game page uses this so the progression
   system looks and behaves identically everywhere, without touching the
   existing pixel.css rules. */

import { DAILY_KP_CAP, levelFromXp } from './rules.js';
import { history, profile, submitSession, todaySummary } from './store.js';
import { cloudEnabled, currentUser, submitSession as submitCloud } from './cloud.js';

export function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export function sessionId(slug) {
  return `${slug}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/* ------------------------------------------------------------------ */
/* header                                                             */
/* ------------------------------------------------------------------ */

export function mountHeader() {
  const host = document.querySelector('[data-arcade-header]');
  if (!host) return;
  host.innerHTML = `
    <div class="arcade-strip" data-arcade-strip>
      <div class="arcade-stat">
        <span class="arcade-label">LEVEL</span>
        <span class="arcade-value" data-stat-level>1</span>
        <span class="arcade-sub" data-stat-xp>0 / 100 XP</span>
      </div>
      <div class="arcade-bar"><i data-stat-bar style="width:0%"></i></div>
      <div class="arcade-stat">
        <span class="arcade-label">K-POINTS</span>
        <span class="arcade-value accent" data-stat-kp>0</span>
        <span class="arcade-sub" data-stat-cap>0 / 100 today</span>
      </div>
      <div class="arcade-stat">
        <span class="arcade-label">STREAK</span>
        <span class="arcade-value" data-stat-streak>0</span>
        <span class="arcade-sub" data-stat-longest>best 0</span>
      </div>
      <div class="arcade-stat">
        <span class="arcade-label">MODE</span>
        <span class="arcade-value small" data-stat-mode>LOCAL</span>
        <span class="arcade-sub" data-stat-note>this browser</span>
      </div>
    </div>`;
  refreshHeader();
}

export function refreshHeader() {
  const host = document.querySelector('[data-arcade-strip]');
  if (!host) return;
  const p = profile();
  const lvl = levelFromXp(p.totalXp);
  const day = todaySummary();
  const set = (sel, text) => {
    const node = host.querySelector(sel);
    if (node) node.textContent = text;
  };
  set('[data-stat-level]', String(lvl.level));
  set('[data-stat-xp]', `${lvl.intoLevel} / ${lvl.need} XP`);
  set('[data-stat-kp]', String(p.kPoints));
  set('[data-stat-cap]', `${day.kp} / ${DAILY_KP_CAP} today`);
  set('[data-stat-streak]', String(p.currentStreak));
  set('[data-stat-longest]', `best ${p.longestStreak}`);
  const bar = host.querySelector('[data-stat-bar]');
  if (bar) bar.style.width = `${Math.min(100, Math.round((lvl.intoLevel / lvl.need) * 100))}%`;

  if (cloudEnabled()) {
    set('[data-stat-mode]', 'CLOUD');
    set('[data-stat-note]', 'synced');
  }
}

/* ------------------------------------------------------------------ */
/* session submission (local ledger + optional cloud verification)    */
/* ------------------------------------------------------------------ */

export async function finishSession(slug, payload) {
  const id = sessionId(slug);
  const local = submitSession(slug, payload, { sessionId: id });

  // In cloud mode the database recalculates everything and its totals win.
  if (cloudEnabled()) {
    try {
      const user = await currentUser();
      if (user) {
        const res = await submitCloud(slug, payload, id);
        if (res?.ok && res.result && !res.result.duplicate) applyServerTotals(res.result);
      }
    } catch (err) {
      console.warn('[arcade] cloud sync failed, local record kept:', err);
    }
  }

  refreshHeader();
  return local;
}

function applyServerTotals(result) {
  try {
    const raw = JSON.parse(localStorage.getItem('arcade:labs:v1') || '{}');
    if (typeof result.levelTotalXp === 'number') raw.totalXp = result.levelTotalXp;
    if (typeof result.kPoints === 'number') raw.kPoints = result.kPoints;
    if (typeof result.currentStreak === 'number') raw.currentStreak = result.currentStreak;
    if (typeof result.longestStreak === 'number') raw.longestStreak = result.longestStreak;
    localStorage.setItem('arcade:labs:v1', JSON.stringify(raw));
  } catch {
    /* ignore: local cache is best-effort */
  }
}

/* ------------------------------------------------------------------ */
/* result card                                                        */
/* ------------------------------------------------------------------ */

const pct = (n) => (typeof n === 'number' ? `${Math.round(n * 100)}%` : '—');

export function showResult(host, result, { title = 'Session complete', againLabel = 'Play again', onAgain } = {}) {
  const p = profile();
  const lvl = levelFromXp(p.totalXp);
  const day = todaySummary();

  const rows = [
    ['SCORE', String(result.score)],
    ['XP EARNED', `+${result.xp}`],
    ['K-POINTS', `+${result.kp}${result.capped ? ' (daily cap)' : ''}`],
    ['ACCURACY', pct(result.accuracy)],
  ];

  const extras = [];
  for (const lu of result.levelUps || []) extras.push(`LEVEL ${lu.level} reached · +${lu.kp} KP`);
  for (const a of result.achievements || []) extras.push(`ACHIEVEMENT · ${a.title} +${a.xp} XP +${a.kp} KP`);
  for (const c of result.challenges || []) extras.push(`DAILY · ${c.title} +${c.xp} XP +${c.kp} KP`);
  if (result.streak && result.streak.day > 1) extras.push(`STREAK day ${result.streak.day} · +${result.streak.kp} KP`);
  if (result.rejected) extras.push('Session did not meet the minimum completion bar — no rewards.');

  const card = el(`
    <div class="result-card">
      <h2 class="result-title">${title}</h2>
      ${result.rejected ? '' : `<div class="result-score">${result.score}</div>`}
      <div class="result-rows">
        ${rows
          .map(
            ([k, v]) => `<div class="result-row"><span>${k}</span><b>${v}</b></div>`,
          )
          .join('')}
      </div>
      ${extras.length ? `<ul class="result-extras">${extras.map((x) => `<li>${x}</li>`).join('')}</ul>` : ''}
      <div class="result-foot">
        <span>LVL ${lvl.level} · ${lvl.intoLevel}/${lvl.need} XP</span>
        <span>${day.remaining} KP left today</span>
      </div>
      <div class="overlay-actions">
        <button class="btn sm" type="button" data-again>${againLabel}</button>
        <a class="btn ghost sm" href="../labs.html">Arcade Labs</a>
      </div>
    </div>`);

  host.innerHTML = '';
  host.appendChild(card);
  host.hidden = false;
  const btn = card.querySelector('[data-again]');
  if (btn && onAgain) btn.addEventListener('click', onAgain);
  return card;
}

/* ------------------------------------------------------------------ */
/* misc                                                               */
/* ------------------------------------------------------------------ */

export function bestFor(slug) {
  return profile().best[slug] || 0;
}

export function recentFor(slug, limit = 5) {
  return history()
    .filter((s) => s.slug === slug)
    .slice(0, limit);
}

export function shuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function pick(list, n) {
  return shuffle(list).slice(0, n);
}

export function formatClock(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
