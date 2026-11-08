import { mountHeader, finishSession, showResult, refreshHeader } from '../shell.js';

const DURATIONS = [30, 60, 120];

const TEXTS = {
  easy: [
    'the quick brown fox jumps over the lazy dog while the sun sets behind the hills',
    'a small robot learns to paint by watching the colours change on the old brick wall',
    'every morning the baker opens the shop and fills the street with the smell of bread',
    'our team shipped the update on time because we tested every screen before launch',
    'the river runs past the mill and the field where the children play after school',
  ],
  medium: [
    'Refactoring is not rewriting: you change the shape of the code and keep the behaviour identical.',
    'A slow test suite is a tax on every change, so teams delete the tests that never fail for a reason.',
    'The dashboard showed a spike at 3am, and the logs explained it: a retry loop with no backoff.',
    'Good error messages name the thing that broke, what was expected, and what to do next.',
    'Caching is easy until you must decide when the cache is wrong, and who is allowed to fix it.',
  ],
  hard: [
    'const total = items.reduce((sum, item) => sum + item.price * item.qty, 0); // 0 is the seed',
    'if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);',
    'SELECT user_id, count(*) AS plays FROM sessions WHERE played_at > now() - interval \'7 days\'',
    'def merge(a: dict, b: dict) -> dict: return {**a, **b}  # b wins on duplicate keys',
    'git rebase --interactive HEAD~3 then squash, reword, and force-push with --force-with-lease',
  ],
};

const setupEl = document.getElementById('setup');
const gameEl = document.getElementById('game');
const durationChips = document.getElementById('durationChips');
const textChips = document.getElementById('textChips');
const startBtn = document.getElementById('startBtn');
const restartBtn = document.getElementById('restartBtn');
const textEl = document.getElementById('text');
const captureEl = document.getElementById('capture');
const hintEl = document.getElementById('hint');
const timeVal = document.getElementById('timeVal');
const wpmVal = document.getElementById('wpmVal');
const accVal = document.getElementById('accVal');
const typedVal = document.getElementById('typedVal');
const overlay = document.getElementById('overlay');
const resultHost = document.getElementById('resultHost');

let duration = 30;
let textKey = 'easy';
let run = null;

function renderChips() {
  durationChips.innerHTML = '';
  DURATIONS.forEach((d) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `labs-chip ${duration === d ? 'is-active' : ''}`;
    b.textContent = `${d}s`;
    b.addEventListener('click', () => {
      duration = d;
      renderChips();
    });
    durationChips.appendChild(b);
  });

  textChips.innerHTML = '';
  for (const [key, label] of [['easy', 'Plain'], ['medium', 'Prose'], ['hard', 'Code']]) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `labs-chip ${textKey === key ? 'is-active' : ''}`;
    b.textContent = label;
    b.addEventListener('click', () => {
      textKey = key;
      renderChips();
    });
    textChips.appendChild(b);
  }
}

function pickText() {
  const pool = TEXTS[textKey];
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return `${shuffled.join(' ')} `;
}

function start() {
  run = {
    text: pickText(),
    index: 0,
    marks: [],
    correct: 0,
    incorrect: 0,
    startedAt: null,
    endsAt: null,
    timerId: null,
    finished: false,
    durationSec: duration,
  };
  overlay.hidden = true;
  setupEl.hidden = true;
  gameEl.hidden = false;
  hintEl.textContent = 'Start typing — the timer begins on your first keystroke.';
  timeVal.textContent = String(duration);
  wpmVal.textContent = '0';
  accVal.textContent = '100%';
  typedVal.textContent = '0';
  render();
  captureEl.value = '';
  textEl.focus();
}

function extendText() {
  // keep roughly two screens of text ahead of the cursor
  if (run.text.length - run.index < 180) run.text += pickText();
}

function render() {
  extendText();
  const from = Math.max(0, run.index - 120);
  const to = Math.min(run.text.length, run.index + 320);
  let html = '';
  for (let i = from; i < to; i++) {
    const ch = run.text[i] === ' ' ? '&nbsp;' : escapeHtml(run.text[i]);
    if (i < run.index) html += `<span class="${run.marks[i] === 'ok' ? 'ok' : 'bad'}">${ch}</span>`;
    else if (i === run.index) html += `<span class="cur">${ch}</span>`;
    else html += `<span class="rest">${ch}</span>`;
  }
  textEl.innerHTML = html;
}

function escapeHtml(ch) {
  return ch.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function tick() {
  if (!run || !run.startedAt || run.finished) return;
  const left = Math.max(0, run.endsAt - performance.now());
  timeVal.textContent = String(Math.ceil(left / 1000));
  const elapsedMin = Math.max(1 / 60, (performance.now() - run.startedAt) / 60000);
  wpmVal.textContent = String(Math.round(run.correct / 5 / elapsedMin));
  const total = run.correct + run.incorrect;
  accVal.textContent = `${total ? Math.round((run.correct / total) * 100) : 100}%`;
  typedVal.textContent = String(total);
  if (left <= 0) end();
}

function typeChar(expectedKey) {
  if (!run || run.finished) return;
  if (!run.startedAt) {
    run.startedAt = performance.now();
    run.endsAt = run.startedAt + run.durationSec * 1000;
    hintEl.textContent = 'Go. Keep your eyes on the line.';
    run.timerId = setInterval(tick, 100);
  }
  if (run.index >= run.text.length) extendText();

  const want = run.text[run.index];
  if (expectedKey === want) {
    run.marks[run.index] = 'ok';
    run.correct += 1;
  } else {
    run.marks[run.index] = 'bad';
    run.incorrect += 1;
  }
  run.index += 1;
  render();
  tick();
}

async function end() {
  if (!run || run.finished) return;
  run.finished = true;
  if (run.timerId) clearInterval(run.timerId);

  const elapsedSec = run.startedAt ? Math.max(1, Math.round((performance.now() - run.startedAt) / 1000)) : 0;
  gameEl.hidden = true;
  const result = await finishSession('typing-ninja', {
    durationSec: Math.min(run.durationSec, elapsedSec) || run.durationSec,
    correctChars: run.correct,
    incorrectChars: run.incorrect,
    mode: textKey,
  });
  const verifiedWpm = typeof result?.score === 'number' ? result.score : Math.round(run.correct / 5 / (elapsedSec / 60));
  showResult(resultHost, result, {
    title: `${verifiedWpm} WPM`,
    againLabel: 'Type again',
    onAgain: () => {
      setupEl.hidden = false;
      renderChips();
      refreshHeader();
    },
  });
  overlay.hidden = false;
  refreshHeader();
}

function restart() {
  if (run?.timerId) clearInterval(run.timerId);
  if (run) run.finished = true;
  setupEl.hidden = false;
  gameEl.hidden = true;
  overlay.hidden = true;
  renderChips();
}

/* ---------------- input ---------------- */

window.addEventListener('keydown', (e) => {
  if (!run || gameEl.hidden || run.finished) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === 'Tab') return;

  if (e.key === 'Backspace') {
    e.preventDefault();
    hintEl.textContent = 'No backspace — every keystroke counts.';
    return;
  }
  if (e.key === 'Enter') {
    e.preventDefault();
    return;
  }
  if (e.key.length === 1) {
    e.preventDefault();
    typeChar(e.key);
    captureEl.value = '';
  }
});

// mobile: mirror the hidden field into the same character pipeline
captureEl.addEventListener('input', (e) => {
  const value = e.target.value;
  if (!value) return;
  for (const ch of value) typeChar(ch);
  e.target.value = '';
});

captureEl.addEventListener('beforeinput', (e) => {
  if (e.inputType === 'deleteContentBackward') e.preventDefault();
});

// Background tabs throttle timers, so re-check the deadline whenever the page
// comes back into view instead of waiting for the next interval tick.
const recheck = () => {
  if (!run || run.finished || !run.startedAt) return;
  if (performance.now() >= run.endsAt) end();
  else tick();
};
document.addEventListener('visibilitychange', recheck);
window.addEventListener('focus', recheck);
window.addEventListener('pointerdown', recheck);

startBtn.addEventListener('click', start);
restartBtn.addEventListener('click', restart);
textEl.addEventListener('click', () => captureEl.focus());

mountHeader();
renderChips();
