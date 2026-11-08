import { DAILY_CHALLENGES, GAMES, levelFromXp } from './rules.js';
import { KP_SHOP, buy, history, profile, todaySummary } from './store.js';
import { mountHeader, refreshHeader } from './shell.js';
import { cloudEnabled } from './cloud.js';

/* Games whose mechanic is actually implemented. Everything else is listed but
   locked, so nobody lands on a page that cannot be played. */
const READY = new Set([
  'brain-battle',
  '2048-challenge',
  'word-master',
  'typing-ninja',
  'sudoku-master',
  'code-escape',
]);

const ART = {
  'brain-battle': '??',
  'memory-champion': '▣',
  '2048-challenge': '2048',
  'word-master': 'ABC',
  'typing-ninja': '⌨',
  'code-escape': '</>',
  'sudoku-master': '9×9',
  'geo-genius': '◍',
  'physics-lab': 'ƒ',
  'startup-tycoon': '▲',
  'idea-forge': '✦',
};

function card(game) {
  const p = profile();
  const best = p.best[game.slug];
  const ready = READY.has(game.slug);
  const el = document.createElement(ready ? 'a' : 'div');
  el.className = `game-card labs-card ${ready ? '' : 'is-soon'}`;
  if (ready) el.href = game.href.replace('./', './');
  el.innerHTML = `
    <div class="card-art labs-art ${game.accent}">
      <span class="labs-glyph">${ART[game.slug] || '•'}</span>
      <div class="checker"></div>
    </div>
    <div class="card-body">
      <div class="card-tags">
        <span class="tag ${ready ? '' : 'hot'}">${game.category.toUpperCase()}</span>
        ${ready ? `<span class="tag">BEST ${best ?? '—'}</span>` : '<span class="tag hot">IN PROGRESS</span>'}
      </div>
      <h3>${game.title}</h3>
      <p>${game.blurb}</p>
      <span class="card-cta">${ready ? 'PLAY' : 'COMING SOON'}</span>
    </div>`;
  return el;
}

function renderGames() {
  const host = document.getElementById('labsGrid');
  host.innerHTML = '';
  for (const g of GAMES) host.appendChild(card(g));
}

function renderDaily() {
  const host = document.getElementById('dailyPanel');
  const day = todaySummary();
  host.innerHTML = '';
  for (const c of DAILY_CHALLENGES) {
    const done = Boolean(day.challenges[c.slug]);
    const row = document.createElement('div');
    row.className = `labs-row ${done ? 'is-done' : ''}`;
    row.innerHTML = `
      <div>
        <b>${c.title}</b>
        <span>${c.desc}</span>
      </div>
      <span class="labs-reward">${done ? 'CLAIMED' : `+${c.xp} XP · +${c.kp} KP`}</span>`;
    host.appendChild(row);
  }
  const cap = document.getElementById('dailyCap');
  if (cap) cap.textContent = `${day.kp} / 100 KP TODAY`;
}

function renderShop() {
  const host = document.getElementById('shopPanel');
  const p = profile();
  const bal = document.getElementById('kpBalance');
  if (bal) bal.textContent = `${p.kPoints} KP`;
  host.innerHTML = '';
  for (const item of KP_SHOP) {
    const owned = p.purchases.some((x) => x.id === item.id);
    const row = document.createElement('div');
    row.className = `labs-row ${owned ? 'is-done' : ''}`;
    row.innerHTML = `
      <div><b>${item.title}</b><span>${owned ? 'Owned' : 'Virtual cosmetic'}</span></div>
      <button class="btn ghost sm" type="button" ${owned || p.kPoints < item.kp ? 'disabled' : ''}>
        ${owned ? 'OWNED' : `${item.kp} KP`}
      </button>`;
    const btn = row.querySelector('button');
    btn.addEventListener('click', () => {
      const res = buy(item.id);
      if (!res.ok) {
        btn.textContent = res.reason.toUpperCase();
        return;
      }
      refreshAll();
    });
    host.appendChild(row);
  }
}

function renderRecent() {
  const host = document.getElementById('recentPanel');
  const rows = history().slice(0, 6);
  if (!rows.length) {
    host.innerHTML = '<p class="muted" style="margin:8px 0 0">No sessions yet. Pick a game above.</p>';
    return;
  }
  host.innerHTML = rows
    .map((s) => {
      const g = GAMES.find((x) => x.slug === s.slug);
      return `<div class="labs-row">
        <div><b>${g ? g.title : s.slug}</b><span>${new Date(s.at).toLocaleString()}</span></div>
        <span class="labs-reward">${s.score} PTS</span>
      </div>`;
    })
    .join('');
}

function refreshAll() {
  renderDaily();
  renderShop();
  renderRecent();
  refreshHeader();
  renderGames();
}

mountHeader();
renderGames();
renderDaily();
renderShop();
renderRecent();

const note = document.getElementById('modeNote');
if (note && cloudEnabled()) {
  note.innerHTML = 'Cloud mode is configured. Signed-in sessions are verified and paid out by Postgres.';
}

const p = profile();
const lvl = levelFromXp(p.totalXp);
document.title = `Arcade Labs — LVL ${lvl.level}`;
