import { WIN, blankBoard, canMove, cloneBoard, highestOn, move, spawn } from './2048-core.js';
import { mountHeader, finishSession, showResult, bestFor, refreshHeader } from '../shell.js';

const boardEl = document.getElementById('board');
const scoreEl = document.getElementById('scoreVal');
const bestEl = document.getElementById('bestVal');
const highEl = document.getElementById('highVal');
const mergeEl = document.getElementById('mergeVal');
const undoBtn = document.getElementById('undoBtn');
const newBtn = document.getElementById('newBtn');
const overlay = document.getElementById('overlay');
const resultHost = document.getElementById('resultHost');

let state = null;

function newGame() {
  const board = blankBoard();
  spawn(board);
  spawn(board);
  state = {
    board,
    score: 0,
    moves: 0,
    merges: 0,
    highest: highestOn(board),
    won: false,
    over: false,
    previous: null,
    startedAt: Date.now(),
  };
  overlay.hidden = true;
  render();
}

function play(dir) {
  if (!state || state.over) return;
  const res = move(state.board, dir);
  if (!res.changed) return;

  state.previous = { board: cloneBoard(state.board), score: state.score };
  state.board = res.board;
  state.score += res.gained;
  state.merges += res.merges;
  state.moves += 1;

  spawn(state.board);
  state.highest = highestOn(state.board);
  if (state.highest >= WIN) state.won = true;
  render();

  if (!canMove(state.board)) {
    state.over = true;
    report();
  }
}

function render() {
  boardEl.innerHTML = '';
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      const v = state.board[r][c];
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.setAttribute('role', 'gridcell');
      if (v) {
        cell.classList.add(v <= 2048 ? `v${v}` : 'vbig');
        cell.textContent = v;
        cell.setAttribute('aria-label', String(v));
      } else {
        cell.setAttribute('aria-label', 'empty');
      }
      boardEl.appendChild(cell);
    }
  }
  scoreEl.textContent = String(state.score);
  mergeEl.textContent = String(state.merges);
  highEl.textContent = String(state.highest);
  bestEl.textContent = String(Math.max(bestFor('2048-challenge'), state.score));
  undoBtn.disabled = !state.previous;
}

async function report() {
  const result = await finishSession('2048-challenge', {
    score: state.score,
    highestTile: state.highest,
    moves: state.moves,
    won: state.won,
    durationSec: Math.round((Date.now() - state.startedAt) / 1000),
  });
  showResult(resultHost, result, {
    title: state.won ? 'You reached 2048' : 'No moves left',
    againLabel: 'New game',
    onAgain: newGame,
  });
  overlay.hidden = false;
  refreshHeader();
}

const KEYS = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
  a: 'left',
  d: 'right',
  w: 'up',
  s: 'down',
};

window.addEventListener('keydown', (e) => {
  const dir = KEYS[e.key] || KEYS[String(e.key).toLowerCase()];
  if (!dir) return;
  e.preventDefault();
  play(dir);
});

let touchStart = null;
boardEl.addEventListener('pointerdown', (e) => {
  touchStart = { x: e.clientX, y: e.clientY };
});
boardEl.addEventListener('pointerup', (e) => {
  if (!touchStart) return;
  const dx = e.clientX - touchStart.x;
  const dy = e.clientY - touchStart.y;
  touchStart = null;
  if (Math.abs(dx) < 24 && Math.abs(dy) < 24) return;
  if (Math.abs(dx) > Math.abs(dy)) play(dx > 0 ? 'right' : 'left');
  else play(dy > 0 ? 'down' : 'up');
});

undoBtn.addEventListener('click', () => {
  if (!state.previous) return;
  state.board = state.previous.board;
  state.score = state.previous.score;
  state.highest = highestOn(state.board);
  state.previous = null;
  state.over = false;
  overlay.hidden = true;
  render();
});

newBtn.addEventListener('click', newGame);

mountHeader();
newGame();
