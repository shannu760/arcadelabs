import { mountSprites } from './sprites.js';

mountSprites();

const BRAND = `<svg viewBox="0 0 9 7" shape-rendering="crispEdges" aria-hidden="true">
  <rect x="0" y="2" width="9" height="3" fill="#5949b0"/>
  <rect x="1" y="1" width="7" height="5" fill="#5949b0"/>
  <rect x="2" y="3" width="3" height="1" fill="#c8ff3d"/>
  <rect x="3" y="2" width="1" height="3" fill="#c8ff3d"/>
  <rect x="6" y="2" width="1" height="1" fill="#ff3f8e"/>
  <rect x="7" y="3" width="1" height="1" fill="#38f2ff"/>
</svg>`;

document.querySelectorAll('.brand-slot').forEach((el) => {
  el.innerHTML = BRAND;
});

/* ---------- local records ---------- */

const pad = (n) => String(n).padStart(2, '0');
const clock = (ms) => `${Math.floor(ms / 60000)}:${pad(Math.floor((ms % 60000) / 1000))}`;

let memoryBest = '—';
try {
  const all = JSON.parse(localStorage.getItem('ppa:memory:best') || '{}');
  const times = Object.values(all)
    .map((v) => (v && typeof v.ms === 'number' ? v.ms : null))
    .filter((n) => typeof n === 'number' && n > 0);
  if (times.length) memoryBest = clock(Math.min(...times));
} catch { /* broken storage is not fatal */ }

let raceBest = '—';
const raceRaw = Number(localStorage.getItem('ppa:race:best') || 0);
if (raceRaw > 0) raceBest = `${Math.floor(raceRaw)} m`;

let chessBest = '—';
const chessLevel = Number(localStorage.getItem('ppa:chess:best') || 0);
if (chessLevel > 0) {
  const names = ['PAWN', 'KNIGHT', 'BISHOP', 'ROOK', 'QUEEN', 'KING', 'MASTER', 'GRANDMASTER'];
  chessBest = names[Math.min(chessLevel, names.length) - 1] || `LVL ${chessLevel}`;
}

const memEl = document.getElementById('recMemory');
const raceEl = document.getElementById('recRace');
const chessEl = document.getElementById('recChess');
if (memEl) memEl.textContent = memoryBest;
if (raceEl) raceEl.textContent = raceBest;
if (chessEl) chessEl.textContent = chessBest;
