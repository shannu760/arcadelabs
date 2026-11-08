import { conflicts, generate, isComplete } from './sudoku-core.js';
import { mountHeader, finishSession, showResult, refreshHeader, formatClock } from '../shell.js';

const LEVELS = ['easy', 'medium', 'hard'];
const MAX_HINTS = 5;

const gridEl = document.getElementById('grid');
const padEl = document.getElementById('pad');
const diffChips = document.getElementById('diffChips');
const messageEl = document.getElementById('message');
const timeVal = document.getElementById('timeVal');
const hintVal = document.getElementById('hintVal');
const fillVal = document.getElementById('fillVal');
const newBtn = document.getElementById('newBtn');
const overlay = document.getElementById('overlay');
const resultHost = document.getElementById('resultHost');

let difficulty = 'easy';
let game = null;

function setMessage(text) {
  messageEl.textContent = text || ' ';
}

function renderChips() {
  diffChips.innerHTML = '';
  for (const level of LEVELS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `labs-chip ${difficulty === level ? 'is-active' : ''}`;
    b.textContent = level;
    b.addEventListener('click', () => {
      difficulty = level;
      renderChips();
      start();
    });
    diffChips.appendChild(b);
  }
}

function start() {
  const { puzzle, solution } = generate(difficulty);
  game = {
    puzzle,
    solution,
    board: puzzle.slice(),
    given: puzzle.map((v) => v !== 0),
    hinted: new Set(),
    selected: -1,
    hints: 0,
    startedAt: null,
    timerId: null,
    done: false,
  };
  overlay.hidden = true;
  hintVal.textContent = '0';
  timeVal.textContent = '0:00';
  setMessage('Pick a cell, then a number. Conflicts are flagged.');
  buildGrid();
  paint();
  stopTimer();
}

function stopTimer() {
  if (game?.timerId) clearInterval(game.timerId);
  if (game) game.timerId = null;
}

function startTimer() {
  if (!game || game.startedAt || game.done) return;
  game.startedAt = Date.now();
  game.timerId = setInterval(() => {
    timeVal.textContent = formatClock((Date.now() - game.startedAt) / 1000);
  }, 500);
}

function buildGrid() {
  gridEl.innerHTML = '';
  for (let i = 0; i < 81; i++) {
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'sku-cell';
    cell.dataset.index = String(i);
    cell.setAttribute('role', 'gridcell');
    cell.addEventListener('click', () => select(i));
    gridEl.appendChild(cell);
  }
}

function paint() {
  if (!game) return;
  [...gridEl.children].forEach((cell, i) => {
    const value = game.board[i];
    cell.textContent = value ? String(value) : '';
    cell.classList.toggle('given', game.given[i]);
    cell.classList.toggle('hinted', game.hinted.has(i));
    cell.classList.toggle('is-sel', game.selected === i);
    cell.classList.toggle('is-bad', Boolean(value) && !game.given[i] && conflicts(game.board, i, value));
  });
  const filled = game.board.filter((v) => v).length;
  fillVal.textContent = `${filled}/81`;
  hintVal.textContent = String(game.hints);
}

function select(index) {
  if (!game || game.done || game.given[index]) return;
  game.selected = index;
  paint();
}

function place(value) {
  if (!game || game.done) return;
  const index = game.selected;
  if (index < 0 || game.given[index]) {
    setMessage('Select an empty cell first.');
    return;
  }
  startTimer();
  game.board[index] = value;
  game.hinted.delete(index);
  paint();

  if (isComplete(game.board)) {
    complete();
    return;
  }
  if (value && conflicts(game.board, index, value)) setMessage('That number repeats in this row, column or box.');
  else setMessage(' ');
}

function useHint() {
  if (!game || game.done) return;
  if (game.hints >= MAX_HINTS) {
    setMessage(`All ${MAX_HINTS} hints used.`);
    return;
  }
  let index = game.selected;
  if (index < 0 || game.given[index] || game.board[index] === game.solution[index]) {
    index = game.board.findIndex((v, i) => !game.given[i] && v !== game.solution[i]);
  }
  if (index < 0) return;
  startTimer();
  game.board[index] = game.solution[index];
  game.selected = index;
  game.hinted.add(index);
  game.hints += 1;
  paint();
  setMessage(`Hint ${game.hints}/${MAX_HINTS} — each hint costs up to 10% of the score.`);
  if (isComplete(game.board)) complete();
}

function buildPad() {
  padEl.innerHTML = '';
  for (let n = 1; n <= 9; n++) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'sku-key';
    b.textContent = String(n);
    b.addEventListener('click', () => place(n));
    padEl.appendChild(b);
  }
  const erase = document.createElement('button');
  erase.type = 'button';
  erase.className = 'sku-key wide';
  erase.textContent = 'ERASE';
  erase.addEventListener('click', () => place(0));
  padEl.appendChild(erase);

  const hint = document.createElement('button');
  hint.type = 'button';
  hint.className = 'sku-key wide';
  hint.textContent = 'HINT';
  hint.addEventListener('click', useHint);
  padEl.appendChild(hint);
}

async function complete() {
  game.done = true;
  stopTimer();
  const seconds = game.startedAt ? Math.round((Date.now() - game.startedAt) / 1000) : 0;
  setMessage(`Solved in ${formatClock(seconds)} with ${game.hints} hint${game.hints === 1 ? '' : 's'}.`);
  [...gridEl.children].forEach((cell) => cell.classList.add('is-done'));

  const result = await finishSession('sudoku-master', {
    solved: true,
    difficulty,
    hints: game.hints,
    seconds,
  });
  showResult(resultHost, result, {
    title: `${difficulty.toUpperCase()} puzzle solved`,
    againLabel: 'New puzzle',
    onAgain: start,
  });
  overlay.hidden = false;
  refreshHeader();
}

window.addEventListener('keydown', (e) => {
  if (!game || game.done) return;
  if (/^[1-9]$/.test(e.key)) {
    e.preventDefault();
    place(Number(e.key));
    return;
  }
  if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') {
    e.preventDefault();
    place(0);
    return;
  }
  const moves = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -9, ArrowDown: 9 };
  if (moves[e.key] !== undefined && game.selected >= 0) {
    e.preventDefault();
    let next = game.selected + moves[e.key];
    if (e.key === 'ArrowLeft' && game.selected % 9 === 0) return;
    if (e.key === 'ArrowRight' && game.selected % 9 === 8) return;
    if (next < 0 || next > 80) return;
    while (next >= 0 && next <= 80 && game.given[next]) next += moves[e.key];
    if (next < 0 || next > 80) return;
    game.selected = next;
    paint();
  }
});

newBtn.addEventListener('click', start);

mountHeader();
buildPad();
renderChips();
start();
