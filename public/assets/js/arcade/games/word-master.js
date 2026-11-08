import { scoreGuess, kolkataDate } from '../rules.js';
import { dailyWord, isWord, randomWord } from '../data/words.js';
import { mountHeader, finishSession, showResult, refreshHeader } from '../shell.js';

const ROWS = 6;
const LEN = 5;
const KB_ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];

const boardEl = document.getElementById('board');
const keyboardEl = document.getElementById('keyboard');
const messageEl = document.getElementById('message');
const modeChips = document.getElementById('modeChips');
const newBtn = document.getElementById('newBtn');
const overlay = document.getElementById('overlay');
const resultHost = document.getElementById('resultHost');

let mode = 'practice';
let game = null;
const keyState = new Map();

function setMessage(text) {
  messageEl.textContent = text || ' ';
}

function buildBoard() {
  boardEl.innerHTML = '';
  for (let r = 0; r < ROWS; r++) {
    const row = document.createElement('div');
    row.className = 'wm-row';
    for (let c = 0; c < LEN; c++) {
      const cell = document.createElement('div');
      cell.className = 'wm-cell';
      cell.dataset.row = String(r);
      cell.dataset.col = String(c);
      row.appendChild(cell);
    }
    boardEl.appendChild(row);
  }
}

function buildKeyboard() {
  keyboardEl.innerHTML = '';
  KB_ROWS.forEach((rowKeys, i) => {
    const row = document.createElement('div');
    row.className = 'wm-krow';
    if (i === 2) row.appendChild(makeKey('enter', 'ENTER', true));
    for (const k of rowKeys) row.appendChild(makeKey(k, k.toUpperCase()));
    if (i === 2) row.appendChild(makeKey('back', 'DEL', true));
    keyboardEl.appendChild(row);
  });
}

function makeKey(key, label, wide = false) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = `wm-key ${wide ? 'wide' : ''}`;
  b.dataset.key = key;
  b.textContent = label;
  b.addEventListener('click', () => press(key));
  return b;
}

function paintKey(letter, state) {
  const btn = keyboardEl.querySelector(`[data-key="${letter}"]`);
  if (!btn) return;
  const rank = { correct: 3, present: 2, absent: 1 };
  const current = keyState.get(letter);
  if (current && rank[current] >= rank[state]) return;
  keyState.set(letter, state);
  btn.classList.remove('correct', 'present', 'absent');
  btn.classList.add(state);
}

function startGame(nextMode = mode) {
  mode = nextMode;
  game = {
    target: mode === 'daily' ? dailyWord(kolkataDate()) : randomWord(),
    guesses: [],
    current: '',
    done: false,
    startedAt: Date.now(),
  };
  keyState.clear();
  keyboardEl.querySelectorAll('.wm-key').forEach((b) => b.classList.remove('correct', 'present', 'absent'));
  overlay.hidden = true;
  buildBoard();
  setMessage(mode === 'daily' ? 'Daily word — same for everyone today.' : 'Practice word — random each time.');
  renderModeChips();
}

function renderModeChips() {
  modeChips.innerHTML = '';
  for (const [key, label] of [['practice', 'Practice'], ['daily', 'Daily']]) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `labs-chip ${mode === key ? 'is-active' : ''}`;
    b.textContent = label;
    b.addEventListener('click', () => {
      if (mode === key && !game?.done) return;
      startGame(key);
    });
    modeChips.appendChild(b);
  }
}

function cellAt(row, col) {
  return boardEl.querySelector(`.wm-cell[data-row="${row}"][data-col="${col}"]`);
}

function paintCurrent() {
  if (!game || game.done) return;
  const row = game.guesses.length;
  for (let c = 0; c < LEN; c++) {
    const cell = cellAt(row, c);
    if (!cell) continue;
    const letter = game.current[c] || '';
    cell.textContent = letter.toUpperCase();
    cell.classList.toggle('filled', Boolean(letter));
    cell.classList.toggle('is-active', c === game.current.length);
  }
}

function press(key) {
  if (!game || game.done) return;

  if (key === 'enter') return submitGuess();
  if (key === 'back') {
    game.current = game.current.slice(0, -1);
    paintCurrent();
    return;
  }
  if (!/^[a-z]$/.test(key) || game.current.length >= LEN) return;
  game.current += key;
  paintCurrent();
}

function submitGuess() {
  if (!game || game.done) return;
  if (game.current.length < LEN) {
    setMessage(`Needs ${LEN} letters — you have ${game.current.length}.`);
    return;
  }
  if (!isWord(game.current)) {
    setMessage('Not in the Lab dictionary. Try another word.');
    return;
  }

  const guess = game.current;
  const row = game.guesses.length;
  const marks = scoreGuess(game.target, guess).marks;

  [...guess].forEach((letter, c) => {
    const cell = cellAt(row, c);
    cell.textContent = letter.toUpperCase();
    cell.classList.remove('filled', 'is-active');
    cell.classList.add(marks[c]);
    paintKey(letter, marks[c]);
  });

  game.guesses.push(guess);
  game.current = '';

  if (guess === game.target) {
    finish(true);
    return;
  }
  if (game.guesses.length === ROWS) {
    finish(false);
    return;
  }
  setMessage(`${ROWS - game.guesses.length} tries left.`);
  paintCurrent();
}

async function finish(solved) {
  game.done = true;
  const summary = solved
    ? `Solved in ${game.guesses.length} ${game.guesses.length === 1 ? 'try' : 'tries'}.`
    : `Out of tries — the word was ${game.target.toUpperCase()}.`;
  setMessage(summary);

  const result = await finishSession('word-master', { target: game.target, attempts: game.guesses });
  showResult(resultHost, result, {
    title: summary,
    againLabel: mode === 'daily' ? 'Practice instead' : 'New word',
    onAgain: () => startGame(mode === 'daily' ? 'practice' : 'practice'),
  });
  overlay.hidden = false;
  refreshHeader();
}

window.addEventListener('keydown', (e) => {
  if (!game || game.done) return;
  if (e.key === 'Enter') {
    e.preventDefault();
    press('enter');
  } else if (e.key === 'Backspace') {
    e.preventDefault();
    press('back');
  } else if (/^[a-zA-Z]$/.test(e.key)) {
    press(e.key.toLowerCase());
  }
});

newBtn.addEventListener('click', () => startGame(mode === 'daily' ? 'practice' : 'practice'));

mountHeader();
buildKeyboard();
startGame('practice');
