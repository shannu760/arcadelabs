import { SPRITE_NAMES, spriteSVG, mountSprites } from './sprites.js';

mountSprites();

const GRIDS = {
  easy: { pairs: 6, cols: 4, name: 'EASY' },
  normal: { pairs: 8, cols: 4, name: 'NORMAL' },
  hard: { pairs: 12, cols: 6, name: 'HARD' },
};

const BEST_KEY = 'ppa:memory:best';
const MUTE_KEY = 'ppa:muted';

const boardEl = document.getElementById('board');
const hudEl = document.getElementById('hud');
const statsHud = document.getElementById('statsHud');
const panel1 = document.getElementById('hud1');
const panel2 = document.getElementById('hud2');
const hud1Name = document.getElementById('hud1Name');
const hud1Val = document.getElementById('hud1Val');
const hud1Bar = document.getElementById('hud1Bar');
const hud1Right = document.getElementById('hud1Right');
const hud2Val = document.getElementById('hud2Val');
const hud2Bar = document.getElementById('hud2Bar');
const hud2Right = document.getElementById('hud2Right');
const statTime = document.getElementById('statTime');
const statMoves = document.getElementById('statMoves');
const statBest = document.getElementById('statBest');
const modeLabel = document.getElementById('modeLabel');
const winOverlay = document.getElementById('winOverlay');
const winTitle = document.getElementById('winTitle');
const winBody = document.getElementById('winBody');
const againBtn = document.getElementById('againBtn');
const restartBtn = document.getElementById('restartBtn');
const soundBtn = document.getElementById('soundBtn');

/* ---------------- state ---------------- */

const S = {
  mode: 'solo',
  grid: 'normal',
  deck: [],
  cards: [],
  first: null,
  lock: false,
  turn: 0,
  scores: [0, 0],
  moves: 0,
  lives: [3, 3], // Player 1 and Player 2 lives (versus mode)
  startedAt: 0,
  running: false,
  elapsed: 0,
  muted: localStorage.getItem(MUTE_KEY) === '1',
};

/* ---------------- helpers ---------------- */

function shuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const pad2 = (n) => String(n).padStart(2, '0');
function clock(ms) {
  return `${Math.floor(ms / 60000)}:${pad2(Math.floor((ms % 60000) / 1000))}`;
}

function readBests() {
  try {
    const raw = JSON.parse(localStorage.getItem(BEST_KEY) || '{}');
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
}

function bestFor(grid) {
  const entry = readBests()[grid];
  return entry && typeof entry.ms === 'number' ? entry : null;
}

function saveBest(ms, moves) {
  const all = readBests();
  const current = all[S.grid];
  const isBest = !current || typeof current.ms !== 'number' || ms < current.ms;
  if (isBest) {
    all[S.grid] = { ms, moves };
    try {
      localStorage.setItem(BEST_KEY, JSON.stringify(all));
    } catch { /* storage may be full or blocked */ }
  }
  return isBest;
}

/* ---------------- sound ---------------- */

let audioCtx = null;

function tone(freq, dur = 0.09, type = 'square', vol = 0.05, delay = 0) {
  if (S.muted) return;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    audioCtx = audioCtx || new AC();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const t0 = audioCtx.currentTime + delay;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  } catch { /* audio is a bonus, never a blocker */ }
}

function applySoundLabel() {
  soundBtn.textContent = S.muted ? 'SFX OFF' : 'SFX ON';
  soundBtn.setAttribute('aria-pressed', String(!S.muted));
}

/* ---------------- clock ---------------- */

function tickClock() {
  if (!S.running) return;
  S.elapsed = performance.now() - S.startedAt;
  statTime.textContent = clock(S.elapsed);
}

function startClock() {
  if (S.mode !== 'solo' || S.running) return;
  S.running = true;
  S.startedAt = performance.now();
  clearInterval(S.timer);
  S.timer = setInterval(tickClock, 120);
}

function stopClock() {
  S.running = false;
  clearInterval(S.timer);
  S.timer = null;
}

/* ---------------- board ---------------- */

function newGame() {
  const cfg = GRIDS[S.grid];
  stopClock();

  S.deck = shuffle(
    shuffle(SPRITE_NAMES)
      .slice(0, cfg.pairs)
      .flatMap((name) => [{ name, matched: false }, { name, matched: false }])
  );
  S.cards = [];
  S.first = null;
  S.lock = false;
  S.turn = 0;
  S.scores = [0, 0];
  S.moves = 0;
  S.elapsed = 0;
  S.startedAt = 0;
  S.lives = [3, 3]; // reset lives for both players
  winOverlay.hidden = true;

  boardEl.innerHTML = '';
  boardEl.style.setProperty('--cols', String(cfg.cols));

  S.deck.forEach((card, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'card';
    btn.setAttribute('aria-label', `Face-down card ${i + 1}`);
    btn.innerHTML = `<span class="card-inner"><span class="card-face card-back"></span><span class="card-face card-front">${spriteSVG(card.name)}</span></span>`;
    btn.addEventListener('click', () => flip(i));
    boardEl.appendChild(btn);
    S.cards.push(btn);
  });

  statTime.textContent = '0:00';
  statMoves.textContent = '0';
  const best = bestFor(S.grid);
  statBest.textContent = best ? clock(best.ms) : '—';
  modeLabel.textContent = `${S.mode === 'solo' ? 'SOLO' : '2 PLAYERS'} · ${cfg.pairs} PAIRS`;

  updateHUD();
}

function updateHUD() {
  const cfg = GRIDS[S.grid];
  const solo = S.mode === 'solo';

  hudEl.classList.toggle('one', solo);
  panel2.hidden = solo;
  statsHud.hidden = !solo;

  hud1Name.textContent = solo ? 'PAIRS FOUND' : 'PLAYER 1';
  hud1Val.textContent = String(S.scores[0]);
  hud1Bar.style.width = `${(S.scores[0] / cfg.pairs) * 100}%`;
  hud1Right.textContent = `${S.scores[0]} / ${cfg.pairs} · LIVES ${S.lives[0]}`;
  hud1Name.setAttribute('title', `Lives: ${S.lives[0]}`);
  panel1.classList.toggle('active', !solo && S.turn === 0);

  hud2Val.textContent = String(S.scores[1]);
  hud2Bar.style.width = `${(S.scores[1] / cfg.pairs) * 100}%`;
  hud2Right.textContent = `${S.scores[1]} / ${cfg.pairs} · LIVES ${S.lives[1]}`;
  hud2Val.setAttribute('title', `Lives: ${S.lives[1]}`);
  panel2.classList.toggle('active', !solo && S.turn === 1);

  statMoves.textContent = String(S.moves);
  statTime.textContent = clock(S.elapsed);
}

function flip(index) {
  const btn = S.cards[index];
  const card = S.deck[index];
  if (!btn || !card || S.lock || card.matched || btn.classList.contains('flipped')) return;

  startClock();
  btn.classList.add('flipped');
  btn.setAttribute('aria-label', 'Face-up card');
  tone(520, 0.05, 'square', 0.035);

  if (S.first === null) {
    S.first = index;
    return;
  }

  const a = S.first;
  const b = index;
  S.first = null;
  S.moves++;
  statMoves.textContent = String(S.moves);

  if (S.deck[a].name === S.deck[b].name) {
    S.lock = true;
    window.setTimeout(() => {
      S.deck[a].matched = true;
      S.deck[b].matched = true;
      [a, b].forEach((i) => {
        S.cards[i].classList.remove('flipped');
        S.cards[i].classList.add('matched');
        S.cards[i].setAttribute('aria-label', 'Matched card');
      });
      S.scores[S.turn]++;
      S.lock = false;
      updateHUD();
      tone(660, 0.07, 'square', 0.05);
      tone(990, 0.1, 'square', 0.045, 0.07);
      if (S.scores[0] + S.scores[1] === GRIDS[S.grid].pairs) endGame();
    }, 240);
  } else {
    // WRONG MATCH: the player who just flipped loses a life.
    // Turn only switches below, so S.turn is still the player who just moved.
    S.lock = true;
    S.lives[S.turn] = Math.max(0, S.lives[S.turn] - 1);
    updateHUD();
    // Lives are tracked but game continues until all pairs matched
    // (removing immediate end-game on 0 lives so player can complete the board)
    tone(190, 0.1, 'triangle', 0.03);
    window.setTimeout(() => {
      [a, b].forEach((i) => {
        S.cards[i].classList.remove('flipped', 'shake');
        S.cards[i].setAttribute('aria-label', 'Face-down card');
      });
      // switch turn after mismatch
      if (S.mode === 'versus') S.turn = S.turn === 0 ? 1 : 0;
      S.lock = false;
      updateHUD();
    }, 820);
  }

  updateHUD();
}

function endGame(winnerIdx = null) {
  stopClock();
  S.elapsed = performance.now() - S.startedAt;
  statTime.textContent = clock(S.elapsed);
  updateHUD();

  tone(660, 0.09, 'square', 0.05);
  tone(880, 0.09, 'square', 0.05, 0.1);
  tone(1170, 0.18, 'square', 0.05, 0.2);

  winBody.innerHTML = '';

  if (S.mode === 'solo') {
    const isBest = saveBest(S.elapsed, S.moves);
    const best = bestFor(S.grid);
    winTitle.textContent = isBest ? 'New record!' : 'Board cleared';
    winBody.innerHTML = `
      <p style="margin:0">Time <b style="color:var(--neon)">${clock(S.elapsed)}</b> · Moves <b style="color:var(--text)">${S.moves}</b></p>
      <p style="margin:0" class="muted">Best on ${GRIDS[S.grid].name}: ${best ? clock(best.ms) : clock(S.elapsed)}</p>
    `;
    statBest.textContent = best ? clock(best.ms) : '—';
  } else {
    // versus with lives
    if (winnerIdx === null) {
      // game ended because all pairs matched (scores filled); compare scores
      const [a, b] = S.scores;
      winnerIdx = a >= b ? 1 : 2; // player with more pairs wins
    }
    const winner = winnerIdx === 1 ? 0 : 1; // 0-based index
    winTitle.textContent = `Player ${winner + 1} wins`;
    winBody.innerHTML = `
      <p style="margin:0"><b style="color:var(--neon)">P1 ${S.scores[0]}</b> &nbsp;—&nbsp; <b style="color:var(--pink)">P2 ${S.scores[1]}</b></p>
      <p style="margin:0" class="muted">${S.moves} moves · ${clock(S.elapsed)} on the clock</p>
      <p style="margin:0" class="muted">Lives: P1 ${S.lives[0]} / P2 ${S.lives[1]}</p>
    `;
  }

  winOverlay.hidden = false;
  againBtn.focus({ preventScroll: true });
}

/* ---------------- controls ---------------- */

document.querySelectorAll('[data-mode]').forEach((btn) => {
  btn.addEventListener('click', () => {
    if (S.mode === btn.dataset.mode) return;
    S.mode = btn.dataset.mode;
    document.querySelectorAll('[data-mode]').forEach((other) => {
      const on = other === btn;
      other.classList.toggle('is-active', on);
      other.classList.toggle('ghost', !on);
      other.setAttribute('aria-pressed', String(on));
    });
    newGame();
    tone(420, 0.05, 'square', 0.03);
  });
});

document.querySelectorAll('[data-grid]').forEach((btn) => {
  btn.addEventListener('click', () => {
    if (S.grid === btn.dataset.grid) return;
    S.grid = btn.dataset.grid;
    document.querySelectorAll('[data-grid]').forEach((other) => {
      const on = other === btn;
      other.classList.toggle('is-active', on);
      other.classList.toggle('ghost', !on);
      other.setAttribute('aria-pressed', String(on));
    });
    newGame();
    tone(420, 0.05, 'square', 0.03);
  });
});

restartBtn.addEventListener('click', () => {
  newGame();
  tone(360, 0.06, 'square', 0.04);
});

againBtn.addEventListener('click', () => {
  newGame();
});

soundBtn.addEventListener('click', () => {
  S.muted = !S.muted;
  localStorage.setItem(MUTE_KEY, S.muted ? '1' : '0');
  applySoundLabel();
  if (!S.muted) tone(560, 0.06, 'square', 0.04);
});

document.addEventListener('keydown', (e) => {
  if (e.code !== 'KeyR' || e.metaKey || e.ctrlKey) return;
  const tag = document.activeElement && document.activeElement.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;
  newGame();
});

applySoundLabel();
newGame();