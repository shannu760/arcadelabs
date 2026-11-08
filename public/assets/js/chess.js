/* Chess — two-player hotseat plus a single-player ladder from Pawn to Grandmaster.
   Pure DOM + a small alpha-beta engine, no dependencies. */

/* ---------------- levels ---------------- */

const LEVELS = [
  { name: 'PAWN',        depth: 1, blunder: 0.55, quiesce: false },
  { name: 'KNIGHT',      depth: 1, blunder: 0.28, quiesce: false },
  { name: 'BISHOP',      depth: 2, blunder: 0.16, quiesce: false },
  { name: 'ROOK',        depth: 2, blunder: 0.07, quiesce: false },
  { name: 'QUEEN',       depth: 3, blunder: 0.03, quiesce: false },
  { name: 'KING',        depth: 3, blunder: 0,    quiesce: false },
  { name: 'MASTER',      depth: 4, blunder: 0,    quiesce: false },
  { name: 'GRANDMASTER', depth: 4, blunder: 0,    quiesce: true },
];

const FILLED = { K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞', P: '♟' };
const NAMES = { K: 'king', Q: 'queen', R: 'rook', B: 'bishop', N: 'knight', P: 'pawn' };
const FILES = 'abcdefgh';

const MATE = 90000;
const MAX_NODES = 220000;
const BEST_KEY = 'ppa:chess:best';
const MUTE_KEY = 'ppa:muted';

/* ---------------- dom ---------------- */

const boardEl = document.getElementById('board');
const statusEl = document.getElementById('statusBar');
const levelRow = document.getElementById('levelRow');
const levelLadder = document.getElementById('levelLadder');
const sideRow = document.getElementById('sideRow');
const hudWhiteVal = document.getElementById('hudWhiteVal');
const hudBlackVal = document.getElementById('hudBlackVal');
const hudWhiteBar = document.getElementById('hudWhiteBar');
const hudBlackBar = document.getElementById('hudBlackBar');
const soundBtn = document.getElementById('soundBtn');
const restartBtn = document.getElementById('restartBtn');
const winOverlay = document.getElementById('winOverlay');
const winTitle = document.getElementById('winTitle');
const winBody = document.getElementById('winBody');
const againBtn = document.getElementById('againBtn');

/* ---------------- state ---------------- */

function startBoard() {
  return [
    ['bR', 'bN', 'bB', 'bQ', 'bK', 'bB', 'bN', 'bR'],
    ['bP', 'bP', 'bP', 'bP', 'bP', 'bP', 'bP', 'bP'],
    ['', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', ''],
    ['wP', 'wP', 'wP', 'wP', 'wP', 'wP', 'wP', 'wP'],
    ['wR', 'wN', 'wB', 'wQ', 'wK', 'wB', 'wN', 'wR'],
  ];
}

const S = {
  b: startBoard(),
  castling: { wK: true, wQ: true, bK: true, bQ: true },
  ep: null,
  turn: 'w',
  selected: null,
  targets: [],
  last: null,
  mode: '2p',
  level: 3,
  humanSide: 'w',
  thinking: false,
  over: false,
  gen: 0,
  matches: { w: 0, b: 0 },
  muted: localStorage.getItem(MUTE_KEY) === '1',
};

/* ---------------- helpers ---------------- */

const inside = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;
const other = (color) => (color === 'w' ? 'b' : 'w');
const squareName = (r, c) => FILES[c] + (8 - r);

/* ---------------- move generation ---------------- */

const KNIGHT_DIRS = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
const KING_DIRS = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
const ROOK_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const BISHOP_DIRS = [[1, 1], [1, -1], [-1, 1], [-1, -1]];

function pseudoMoves(st, color, capturesOnly = false) {
  const b = st.b;
  const out = [];

  const push = (fr, fc, tr, tc, opts = {}) => {
    const piece = b[fr][fc];
    const captured = opts.ep ? b[fr][tc] : b[tr][tc];
    if (capturesOnly && !captured) return;
    out.push({
      fr, fc, tr, tc, piece,
      captured: captured || '',
      promo: opts.promo || null,
      castle: opts.castle || null,
      ep: !!opts.ep,
    });
  };

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = b[r][c];
      if (!p || p[0] !== color) continue;
      const type = p[1];

      if (type === 'P') {
        const dir = color === 'w' ? -1 : 1;
        const startRow = color === 'w' ? 6 : 1;
        const promoRow = color === 'w' ? 0 : 7;
        const one = r + dir;

        if (inside(one, c) && !b[one][c]) {
          if (one === promoRow) push(r, c, one, c, { promo: 'Q' });
          else if (!capturesOnly) {
            push(r, c, one, c);
            if (r === startRow && !b[r + 2 * dir][c]) push(r, c, r + 2 * dir, c);
          }
        }

        for (const dc of [-1, 1]) {
          const cc = c + dc;
          if (!inside(one, cc)) continue;
          const tk = b[one][cc];
          if (tk && tk[0] !== color) {
            push(r, c, one, cc, one === promoRow ? { promo: 'Q' } : {});
          } else if (st.ep && st.ep.r === one && st.ep.c === cc) {
            push(r, c, one, cc, { ep: true });
          }
        }
        continue;
      }

      if (type === 'N') {
        for (const [dr, dc] of KNIGHT_DIRS) {
          const rr = r + dr, cc = c + dc;
          if (!inside(rr, cc)) continue;
          const tk = b[rr][cc];
          if (!tk || tk[0] !== color) push(r, c, rr, cc);
        }
        continue;
      }

      if (type === 'K') {
        for (const [dr, dc] of KING_DIRS) {
          const rr = r + dr, cc = c + dc;
          if (!inside(rr, cc)) continue;
          const tk = b[rr][cc];
          if (!tk || tk[0] !== color) push(r, c, rr, cc);
        }

        if (!capturesOnly) {
          const home = color === 'w' ? 7 : 0;
          const foe = other(color);
          if (r === home && c === 4 && !isAttacked(b, home, 4, foe)) {
            if (st.castling[color + 'K'] && b[home][7] === color + 'R' &&
                !b[home][5] && !b[home][6] &&
                !isAttacked(b, home, 5, foe) && !isAttacked(b, home, 6, foe)) {
              push(r, c, home, 6, { castle: 'K' });
            }
            if (st.castling[color + 'Q'] && b[home][0] === color + 'R' &&
                !b[home][1] && !b[home][2] && !b[home][3] &&
                !isAttacked(b, home, 3, foe) && !isAttacked(b, home, 2, foe)) {
              push(r, c, home, 2, { castle: 'Q' });
            }
          }
        }
        continue;
      }

      const dirs = type === 'R' ? ROOK_DIRS : type === 'B' ? BISHOP_DIRS : ROOK_DIRS.concat(BISHOP_DIRS);
      for (const [dr, dc] of dirs) {
        let rr = r + dr, cc = c + dc;
        while (inside(rr, cc)) {
          const tk = b[rr][cc];
          if (!tk) {
            if (!capturesOnly) push(r, c, rr, cc);
          } else {
            if (tk[0] !== color) push(r, c, rr, cc);
            break;
          }
          rr += dr; cc += dc;
        }
      }
    }
  }

  return out;
}

function isAttacked(b, r, c, by) {
  const pawnRow = by === 'w' ? r + 1 : r - 1;
  if (inside(pawnRow, c - 1) && b[pawnRow][c - 1] === by + 'P') return true;
  if (inside(pawnRow, c + 1) && b[pawnRow][c + 1] === by + 'P') return true;

  for (const [dr, dc] of KNIGHT_DIRS) {
    const rr = r + dr, cc = c + dc;
    if (inside(rr, cc) && b[rr][cc] === by + 'N') return true;
  }
  for (const [dr, dc] of KING_DIRS) {
    const rr = r + dr, cc = c + dc;
    if (inside(rr, cc) && b[rr][cc] === by + 'K') return true;
  }
  for (const [dr, dc] of ROOK_DIRS) {
    let rr = r + dr, cc = c + dc;
    while (inside(rr, cc)) {
      const q = b[rr][cc];
      if (q) {
        if (q === by + 'R' || q === by + 'Q') return true;
        break;
      }
      rr += dr; cc += dc;
    }
  }
  for (const [dr, dc] of BISHOP_DIRS) {
    let rr = r + dr, cc = c + dc;
    while (inside(rr, cc)) {
      const q = b[rr][cc];
      if (q) {
        if (q === by + 'B' || q === by + 'Q') return true;
        break;
      }
      rr += dr; cc += dc;
    }
  }
  return false;
}

function findKing(b, color) {
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (b[r][c] === color + 'K') return { r, c };
    }
  }
  return null;
}

function inCheck(st, color) {
  const k = findKing(st.b, color);
  return !!k && isAttacked(st.b, k.r, k.c, other(color));
}

function applyMove(st, m) {
  const b = st.b;
  const undo = {
    piece: b[m.fr][m.fc],
    target: b[m.tr][m.tc],
    epPawn: null,
    rook: null,
    castling: { ...st.castling },
    ep: st.ep,
    turn: st.turn,
  };

  b[m.fr][m.fc] = '';
  if (m.ep) {
    undo.epPawn = b[m.fr][m.tc];
    b[m.fr][m.tc] = '';
  }
  b[m.tr][m.tc] = m.promo ? m.piece[0] + m.promo : m.piece;

  if (m.castle) {
    const home = m.fr;
    const [rf, rt] = m.castle === 'K' ? [7, 5] : [0, 3];
    undo.rook = { fr: home, fc: rf, tr: home, tc: rt };
    b[home][rt] = b[home][rf];
    b[home][rf] = '';
  }

  const color = m.piece[0];
  if (m.piece[1] === 'K') {
    st.castling[color + 'K'] = false;
    st.castling[color + 'Q'] = false;
  }
  if (m.piece[1] === 'R') {
    if (m.fc === 0) st.castling[color + 'Q'] = false;
    if (m.fc === 7) st.castling[color + 'K'] = false;
  }
  if (undo.target && undo.target[1] === 'R') {
    const ec = undo.target[0];
    if (m.tr === 0) st.castling[ec + 'Q'] = false;
    if (m.tr === 7) st.castling[ec + 'K'] = false;
  }

  st.ep = m.piece[1] === 'P' && Math.abs(m.tr - m.fr) === 2
    ? { r: (m.tr + m.fr) / 2, c: m.fc }
    : null;
  st.turn = color === 'w' ? 'b' : 'w';

  return undo;
}

function undoMove(st, m, u) {
  const b = st.b;
  b[m.fr][m.fc] = u.piece;
  b[m.tr][m.tc] = u.target;
  if (m.ep) b[m.fr][m.tc] = u.epPawn;
  if (u.rook) {
    b[u.rook.fr][u.rook.fc] = b[u.rook.tr][u.rook.tc];
    b[u.rook.tr][u.rook.tc] = '';
  }
  st.castling = u.castling;
  st.ep = u.ep;
  st.turn = u.turn;
}

function isLegal(st, m) {
  const color = m.piece[0];
  const u = applyMove(st, m);
  const k = findKing(st.b, color);
  const bad = k && isAttacked(st.b, k.r, k.c, other(color));
  undoMove(st, m, u);
  return !bad;
}

function legalMoves(st, capturesOnly = false) {
  return pseudoMoves(st, st.turn, capturesOnly).filter((m) => isLegal(st, m));
}

/* ---------------- evaluation ---------------- */

const VAL = { P: 100, N: 320, B: 330, R: 500, Q: 900, K: 0 };

const PST = {
  P: [
    0, 0, 0, 0, 0, 0, 0, 0,
    50, 50, 50, 50, 50, 50, 50, 50,
    10, 10, 20, 30, 30, 20, 10, 10,
    5, 5, 10, 25, 25, 10, 5, 5,
    0, 0, 0, 20, 20, 0, 0, 0,
    5, -5, -10, 0, 0, -10, -5, 5,
    5, 10, 10, -20, -20, 10, 10, 5,
    0, 0, 0, 0, 0, 0, 0, 0,
  ],
  N: [
    -50, -40, -30, -30, -30, -30, -40, -50,
    -40, -20, 0, 0, 0, 0, -20, -40,
    -30, 0, 10, 15, 15, 10, 0, -30,
    -30, 5, 15, 20, 20, 15, 5, -30,
    -30, 0, 15, 20, 20, 15, 0, -30,
    -30, 5, 10, 15, 15, 10, 5, -30,
    -40, -20, 0, 5, 5, 0, -20, -40,
    -50, -40, -30, -30, -30, -30, -40, -50,
  ],
  B: [
    -20, -10, -10, -10, -10, -10, -10, -20,
    -10, 0, 0, 0, 0, 0, 0, -10,
    -10, 0, 5, 10, 10, 5, 0, -10,
    -10, 5, 5, 10, 10, 5, 5, -10,
    -10, 0, 10, 10, 10, 10, 0, -10,
    -10, 10, 10, 10, 10, 10, 10, -10,
    -10, 5, 0, 0, 0, 0, 5, -10,
    -20, -10, -10, -10, -10, -10, -10, -20,
  ],
  R: [
    0, 0, 0, 0, 0, 0, 0, 0,
    5, 10, 10, 10, 10, 10, 10, 5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    0, 0, 0, 5, 5, 0, 0, 0,
  ],
  Q: [
    -20, -10, -10, -5, -5, -10, -10, -20,
    -10, 0, 0, 0, 0, 0, 0, -10,
    -10, 0, 5, 5, 5, 5, 0, -10,
    -5, 0, 5, 5, 5, 5, 0, -5,
    0, 0, 5, 5, 5, 5, 0, -5,
    -10, 5, 5, 5, 5, 5, 0, -10,
    -10, 0, 5, 0, 0, 0, 0, -10,
    -20, -10, -10, -5, -5, -10, -10, -20,
  ],
  K: [
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -20, -30, -30, -40, -40, -30, -30, -20,
    -10, -20, -20, -20, -20, -20, -20, -10,
    20, 20, 0, 0, 0, 20, 20, 20,
    20, 30, 10, 0, 0, 10, 30, 20,
  ],
};

function evaluate(st) {
  const b = st.b;
  let score = 0;
  let wBishops = 0;
  let bBishops = 0;

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = b[r][c];
      if (!p) continue;
      const color = p[0];
      const type = p[1];
      const idx = color === 'w' ? r * 8 + c : (7 - r) * 8 + c;
      const value = VAL[type] + (PST[type] ? PST[type][idx] : 0);
      score += color === 'w' ? value : -value;
      if (type === 'B') {
        if (color === 'w') wBishops++;
        else bBishops++;
      }
    }
  }

  if (wBishops >= 2) score += 28;
  if (bBishops >= 2) score -= 28;

  return score;
}

/* ---------------- search ---------------- */

let nodeBudget = 0;

function moveScore(m) {
  let s = 0;
  if (m.captured) s += 10 * VAL[m.captured[1]] - VAL[m.piece[1]] / 10;
  if (m.promo) s += 800;
  if (m.castle) s += 30;
  return s;
}

function orderMoves(moves) {
  moves.sort((a, b) => moveScore(b) - moveScore(a));
}

function quiesce(st, alpha, beta, depth) {
  nodeBudget++;
  const stand = st.turn === 'w' ? evaluate(st) : -evaluate(st);
  if (depth <= 0 || nodeBudget > MAX_NODES) return stand;
  if (stand >= beta) return beta;
  if (stand > alpha) alpha = stand;

  const moves = legalMoves(st, true);
  orderMoves(moves);
  for (const m of moves) {
    const u = applyMove(st, m);
    const sc = -quiesce(st, -beta, -alpha, depth - 1);
    undoMove(st, m, u);
    if (sc >= beta) return beta;
    if (sc > alpha) alpha = sc;
  }
  return alpha;
}

function search(st, depth, alpha, beta, useQuiesce, ply) {
  nodeBudget++;
  if (nodeBudget > MAX_NODES) return st.turn === 'w' ? evaluate(st) : -evaluate(st);

  const moves = legalMoves(st);
  if (!moves.length) {
    if (inCheck(st, st.turn)) return -MATE + ply; // checkmated
    return 0; // stalemate
  }

  if (depth <= 0) {
    return useQuiesce ? quiesce(st, alpha, beta, 3) : (st.turn === 'w' ? evaluate(st) : -evaluate(st));
  }

  orderMoves(moves);
  let best = -Infinity;
  for (const m of moves) {
    const u = applyMove(st, m);
    const sc = -search(st, depth - 1, -beta, -alpha, useQuiesce, ply + 1);
    undoMove(st, m, u);
    if (sc > best) best = sc;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best;
}

function chooseAiMove() {
  const lvl = LEVELS[S.level - 1];
  const st = {
    b: S.b.map((row) => row.slice()),
    castling: { ...S.castling },
    ep: S.ep ? { ...S.ep } : null,
    turn: S.turn,
  };

  const moves = legalMoves(st);
  if (!moves.length) return null;

  if (Math.random() < lvl.blunder) {
    return moves[Math.floor(Math.random() * moves.length)];
  }

  orderMoves(moves);
  nodeBudget = 0;
  const started = performance.now();

  let bestScore = -Infinity;
  let alpha = -Infinity;
  let best = moves[0];

  for (const m of moves) {
    const u = applyMove(st, m);
    const sc = -search(st, lvl.depth - 1, -Infinity, -alpha, lvl.quiesce, 1);
    undoMove(st, m, u);
    if (sc > bestScore) {
      bestScore = sc;
      best = m;
    }
    if (bestScore > alpha) alpha = bestScore;
    if (performance.now() - started > 1800) break;
  }

  return best;
}

/* ---------------- sound ---------------- */

let audioCtx = null;

function tone(freq, dur = 0.08, type = 'square', vol = 0.05, delay = 0) {
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
  } catch { /* audio is optional */ }
}

function applySoundLabel() {
  soundBtn.textContent = S.muted ? 'SFX OFF' : 'SFX ON';
  soundBtn.setAttribute('aria-pressed', String(!S.muted));
}

/* ---------------- render ---------------- */

function render() {
  boardEl.innerHTML = '';

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = S.b[r][c];
      const sq = document.createElement('button');
      sq.type = 'button';
      sq.className = `square ${(r + c) % 2 ? 'dark' : 'light'}`;
      sq.dataset.r = r;
      sq.dataset.c = c;
      sq.setAttribute('role', 'gridcell');

      const label = piece
        ? `${piece[0] === 'w' ? 'White' : 'Black'} ${NAMES[piece[1]]} on ${squareName(r, c)}`
        : `Empty ${squareName(r, c)}`;
      sq.setAttribute('aria-label', label);

      if (piece) {
        const glyph = document.createElement('span');
        glyph.className = `glyph ${piece[0]}`;
        glyph.textContent = FILLED[piece[1]];
        sq.appendChild(glyph);
      }

      if (S.last && ((S.last.fr === r && S.last.fc === c) || (S.last.tr === r && S.last.tc === c))) {
        sq.classList.add('last');
      }

      if (S.selected && S.selected.r === r && S.selected.c === c) {
        sq.classList.add('selected');
      }

      const target = S.targets.find((m) => m.tr === r && m.tc === c);
      if (target) {
        sq.classList.add('legal');
        if (target.captured || target.ep) sq.classList.add('capture');
      }

      if (piece && piece[1] === 'K' && piece[0] === S.turn && inCheck(S, S.turn)) {
        sq.classList.add('check');
      }

      sq.addEventListener('click', () => onSquare(r, c));
      boardEl.appendChild(sq);
    }
  }
}

function updateStatus() {
  if (S.over) return;

  if (S.thinking) {
    statusEl.innerHTML = `AI <b>${LEVELS[S.level - 1].name}</b> IS THINKING…`;
    return;
  }

  const side = S.turn === 'w' ? 'WHITE' : 'BLACK';
  let text = `<b>${side}</b> TO MOVE`;
  if (inCheck(S, S.turn)) text += ' · <b>CHECK!</b>';

  if (S.mode === '1p') {
    const mine = S.turn === S.humanSide;
    text += ` · LEVEL ${S.level} ${LEVELS[S.level - 1].name}`;
    if (!mine) text += ' · AI TURN';
  }

  statusEl.innerHTML = text;
}

function updateHud() {
  hudWhiteVal.textContent = String(S.matches.w);
  hudBlackVal.textContent = String(S.matches.b);
  hudWhiteBar.style.width = `${Math.min(100, (S.matches.w / 3) * 100)}%`;
  hudBlackBar.style.width = `${Math.min(100, (S.matches.b / 3) * 100)}%`;
}

/* ---------------- game flow ---------------- */

function resultOf(st) {
  const moves = legalMoves(st);
  if (!moves.length) {
    return inCheck(st, st.turn)
      ? { type: 'mate', winner: other(st.turn) }
      : { type: 'draw', reason: 'Stalemate — no legal moves' };
  }
  return null;
}

function playMove(m) {
  applyMove(S, m);
  S.last = m;
  S.selected = null;
  S.targets = [];

  if (m.castle) tone(660, 0.07);
  else if (m.captured) tone(220, 0.09, 'triangle', 0.055);
  else tone(520, 0.05, 'square', 0.035);

  render();
  updateHud();

  const result = resultOf(S);
  if (result) {
    finishGame(result);
    return;
  }

  updateStatus();

  if (S.mode === '1p' && S.turn !== S.humanSide) aiTurn();
}

function aiTurn() {
  S.thinking = true;
  updateStatus();
  const gen = S.gen;

  window.setTimeout(() => {
    // a new game, mode switch or side switch cancels this reply
    if (S.over || gen !== S.gen) return;
    const move = chooseAiMove();
    if (gen !== S.gen) return;
    S.thinking = false;
    if (!move) {
      const result = resultOf(S);
      if (result) finishGame(result);
      else updateStatus();
      return;
    }
    playMove(move);
  }, 260);
}

function finishGame(result) {
  S.over = true;
  S.thinking = false;

  if (result.type === 'mate') {
    S.matches[result.winner]++;

    if (S.mode === '1p' && result.winner === S.humanSide) {
      saveBest(S.level);
    }
  }

  updateHud();

  const winnerName = result.type === 'mate'
    ? (result.winner === 'w' ? 'White' : 'Black')
    : '';

  if (result.type === 'mate') {
    winTitle.textContent = `Checkmate — ${winnerName} wins`;
    tone(660, 0.14, 'square', 0.06);
    tone(880, 0.14, 'square', 0.06, 0.1);
    tone(1170, 0.18, 'square', 0.06, 0.2);
  } else {
    winTitle.textContent = 'Draw';
    tone(400, 0.14, 'triangle', 0.05);
  }

  let body = '';
  if (result.type === 'mate') {
    if (S.mode === '1p') {
      const beat = result.winner === S.humanSide
        ? `You beat level ${S.level} — ${LEVELS[S.level - 1].name}.`
        : `The ${LEVELS[S.level - 1].name} engine got you. Try a lower level or take another run.`;
      body += `<p>${beat}</p>`;
    }
    body += `<p>Match score: <b>White ${S.matches.w} – ${S.matches.b} Black</b></p>`;
  } else {
    body += `<p>${result.reason}.</p>`;
    body += `<p>Match score: <b>White ${S.matches.w} – ${S.matches.b} Black</b></p>`;
  }

  const sessionWinner = S.matches.w >= 3 ? 'White' : S.matches.b >= 3 ? 'Black' : null;
  if (sessionWinner) {
    winTitle.textContent = `Session won by ${sessionWinner}`;
    body += `<p><b>First to 3 matches — session over.</b></p>`;
    againBtn.textContent = 'New session';
  } else {
    againBtn.textContent = 'Next match';
  }

  winBody.innerHTML = body;
  winOverlay.hidden = false;
  againBtn.focus({ preventScroll: true });

  statusEl.innerHTML = result.type === 'mate'
    ? `<b>CHECKMATE</b> · ${winnerName} WINS`
    : `<b>DRAW</b> · ${result.reason.toUpperCase()}`;
}

function saveBest(level) {
  try {
    const current = Number(localStorage.getItem(BEST_KEY) || 0);
    if (level > current) localStorage.setItem(BEST_KEY, String(level));
  } catch { /* storage may be blocked */ }
}

function onSquare(r, c) {
  if (S.over || S.thinking) return;
  if (S.mode === '1p' && S.turn !== S.humanSide) return;

  const target = S.targets.find((m) => m.tr === r && m.tc === c);
  if (target) {
    playMove(target);
    return;
  }

  const piece = S.b[r][c];
  if (piece && piece[0] === S.turn) {
    S.selected = { r, c };
    S.targets = legalMoves(S).filter((m) => m.fr === r && m.fc === c);
    tone(540, 0.04, 'square', 0.03);
  } else {
    S.selected = null;
    S.targets = [];
  }
  render();
}

function newGame(resetMatches = false) {
  S.gen++;
  S.b = startBoard();
  S.castling = { wK: true, wQ: true, bK: true, bQ: true };
  S.ep = null;
  S.turn = 'w';
  S.selected = null;
  S.targets = [];
  S.last = null;
  S.thinking = false;
  S.over = false;

  if (resetMatches) S.matches = { w: 0, b: 0 };

  winOverlay.hidden = true;
  againBtn.textContent = 'Next match';

  render();
  updateHud();
  updateStatus();

  if (S.mode === '1p' && S.humanSide === 'b') aiTurn();
}

/* ---------------- controls ---------------- */

function buildLevels() {
  LEVELS.forEach((lvl, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'level-btn';
    btn.dataset.level = String(i + 1);
    btn.textContent = `${i + 1} ${lvl.name}`;
    btn.title = lvl.depth === 1
      ? `${lvl.name} — looks one move ahead`
      : `${lvl.name} — searches ${lvl.depth} plies ahead`;
    btn.addEventListener('click', () => {
      S.level = i + 1;
      syncLevelButtons();
      updateStatus();
      tone(600, 0.05, 'square', 0.035);
    });
    levelLadder.appendChild(btn);
  });
  syncLevelButtons();
}

function syncLevelButtons() {
  levelLadder.querySelectorAll('.level-btn').forEach((btn) => {
    const on = Number(btn.dataset.level) === S.level;
    btn.classList.toggle('is-active', on);
    btn.setAttribute('aria-pressed', String(on));
  });
}

document.querySelectorAll('[data-mode]').forEach((btn) => {
  btn.addEventListener('click', () => {
    if (S.mode === btn.dataset.mode) return;
    S.mode = btn.dataset.mode;

    document.querySelectorAll('[data-mode]').forEach((b) => {
      const on = b === btn;
      b.classList.toggle('is-active', on);
      b.classList.toggle('ghost', !on);
      b.setAttribute('aria-pressed', String(on));
    });

    const solo = S.mode === '1p';
    sideRow.hidden = !solo;
    levelRow.hidden = !solo;

    newGame(true);
    tone(440, 0.05, 'square', 0.035);
  });
});

document.querySelectorAll('[data-side]').forEach((btn) => {
  btn.addEventListener('click', () => {
    if (S.humanSide === btn.dataset.side) return;
    S.humanSide = btn.dataset.side;

    document.querySelectorAll('[data-side]').forEach((b) => {
      const on = b === btn;
      b.classList.toggle('is-active', on);
      b.classList.toggle('ghost', !on);
      b.setAttribute('aria-pressed', String(on));
    });

    newGame(true);
    tone(440, 0.05, 'square', 0.035);
  });
});

restartBtn.addEventListener('click', () => {
  newGame(false);
  tone(360, 0.06, 'square', 0.04);
});

againBtn.addEventListener('click', () => {
  const sessionOver = S.matches.w >= 3 || S.matches.b >= 3;
  newGame(sessionOver);
});

soundBtn.addEventListener('click', () => {
  S.muted = !S.muted;
  try { localStorage.setItem(MUTE_KEY, S.muted ? '1' : '0'); } catch { /* ignore */ }
  applySoundLabel();
  if (!S.muted) tone(560, 0.06, 'square', 0.04);
});

document.addEventListener('keydown', (e) => {
  if (e.code === 'Escape') {
    if (!winOverlay.hidden) {
      againBtn.click();
      return;
    }
    S.selected = null;
    S.targets = [];
    render();
    return;
  }

  if (e.code === 'Enter' && !winOverlay.hidden) {
    againBtn.click();
    return;
  }

  if (e.code === 'KeyR' && !e.metaKey && !e.ctrlKey) {
    const tag = document.activeElement && document.activeElement.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    newGame(false);
  }
});

/* ---------------- init ---------------- */

buildLevels();
applySoundLabel();
newGame(false);
