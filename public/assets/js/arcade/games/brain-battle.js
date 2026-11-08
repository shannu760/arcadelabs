import { DIFFICULTIES, QUESTIONS, SUBJECTS, pickQuestions } from '../data/questions.js';
import { mountHeader, finishSession, showResult, refreshHeader } from '../shell.js';

const ROUND = 10;
const MIN_ANSWERS = 5;

const setupEl = document.getElementById('setup');
const quizEl = document.getElementById('quiz');
const subjectChips = document.getElementById('subjectChips');
const difficultyChips = document.getElementById('difficultyChips');
const poolNote = document.getElementById('poolNote');
const startBtn = document.getElementById('startBtn');
const progressEl = document.getElementById('progress');
const topicEl = document.getElementById('topicTag');
const clockEl = document.getElementById('clock');
const barEl = document.getElementById('timerBar');
const promptEl = document.getElementById('prompt');
const optionsEl = document.getElementById('options');
const feedbackEl = document.getElementById('feedback');
const nextBtn = document.getElementById('nextBtn');
const quitBtn = document.getElementById('quitBtn');
const overlay = document.getElementById('overlay');
const resultHost = document.getElementById('resultHost');

let subject = 'mixed';
let difficulty = 'mixed';
let run = null;

/* ---------------- setup ---------------- */

function chip(label, active, onClick) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = `labs-chip ${active ? 'is-active' : ''}`;
  b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
}

function poolSize() {
  return QUESTIONS.filter(
    (item) => (subject === 'mixed' || item.subject === subject) && (difficulty === 'mixed' || item.difficulty === difficulty),
  ).length;
}

function renderSetup() {
  subjectChips.innerHTML = '';
  subjectChips.appendChild(
    chip('Mixed', subject === 'mixed', () => {
      subject = 'mixed';
      renderSetup();
    }),
  );
  for (const s of SUBJECTS) {
    subjectChips.appendChild(
      chip(s, subject === s, () => {
        subject = s;
        renderSetup();
      }),
    );
  }

  difficultyChips.innerHTML = '';
  difficultyChips.appendChild(
    chip('Mixed', difficulty === 'mixed', () => {
      difficulty = 'mixed';
      renderSetup();
    }),
  );
  for (const d of DIFFICULTIES) {
    difficultyChips.appendChild(
      chip(d, difficulty === d, () => {
        difficulty = d;
        renderSetup();
      }),
    );
  }

  const n = poolSize();
  const rounds = Math.min(ROUND, n);
  const enough = n >= MIN_ANSWERS;
  startBtn.disabled = !enough;
  poolNote.textContent = enough
    ? `${n} questions match this filter — you will face ${rounds}.`
    : `Only ${n} question${n === 1 ? '' : 's'} match that filter. Rewards need at least ${MIN_ANSWERS}, so widen the filter.`;
}

/* ---------------- run ---------------- */

function shuffleOptions(question) {
  const order = question.options.map((text, i) => ({ text, correct: i === question.answer }));
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return { options: order, correctIndex: order.findIndex((o) => o.correct) };
}

function start() {
  const picked = pickQuestions({ subject, difficulty, count: ROUND });
  if (picked.length < MIN_ANSWERS) return;

  run = {
    queue: picked,
    index: 0,
    answers: [],
    startedAt: Date.now(),
    timerId: null,
    questionStart: 0,
    revealed: false,
    current: null,
  };
  overlay.hidden = true;
  setupEl.hidden = true;
  quizEl.hidden = false;
  renderQuestion();
}

function stopTimer() {
  if (run?.timerId) clearInterval(run.timerId);
  if (run) run.timerId = null;
}

function renderQuestion() {
  const question = run.queue[run.index];
  const { options, correctIndex } = shuffleOptions(question);
  run.current = { question, options, correctIndex };
  run.revealed = false;
  run.questionStart = performance.now();

  progressEl.textContent = `Q ${run.index + 1} / ${run.queue.length}`;
  topicEl.textContent = `${question.subject.toUpperCase()} · ${question.difficulty.toUpperCase()}`;
  promptEl.textContent = question.prompt;
  feedbackEl.innerHTML = '&nbsp;';
  nextBtn.disabled = true;
  nextBtn.textContent = run.index + 1 === run.queue.length ? 'See results' : 'Next';

  optionsEl.innerHTML = '';
  options.forEach((opt, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'quiz-opt';
    b.innerHTML = `<span class="labs-reward" style="margin-right:8px">${i + 1}</span>${escapeHtml(opt.text)}`;
    b.addEventListener('click', () => answer(i));
    optionsEl.appendChild(b);
  });

  const limit = question.limitMs;
  clockEl.textContent = (limit / 1000).toFixed(1);
  clockEl.classList.remove('is-low');
  barEl.style.width = '100%';
  barEl.classList.remove('is-low');

  stopTimer();
  run.timerId = setInterval(() => {
    const left = limit - (performance.now() - run.questionStart);
    const pct = Math.max(0, (left / limit) * 100);
    clockEl.textContent = (Math.max(0, left) / 1000).toFixed(1);
    barEl.style.width = `${pct}%`;
    const low = pct < 35;
    clockEl.classList.toggle('is-low', low);
    barEl.classList.toggle('is-low', low);
    if (left <= 0) answer(null);
  }, 60);
}

function answer(choice) {
  if (!run || run.revealed) return;
  run.revealed = true;
  stopTimer();

  const { question, options, correctIndex } = run.current;
  const limitMs = question.limitMs;
  const rawElapsed = Math.round(performance.now() - run.questionStart);
  // Hidden tabs throttle interval timers, so never trust the clock tick alone:
  // a click that lands after the limit counts as time-up.
  if (rawElapsed >= limitMs) choice = null;
  const elapsedMs = Math.min(limitMs, rawElapsed);
  const correct = choice !== null && choice === correctIndex;

  run.answers.push({ id: question.id, correct, elapsedMs, limitMs, difficulty: question.difficulty });

  [...optionsEl.children].forEach((btn, i) => {
    btn.disabled = true;
    if (i === correctIndex) btn.classList.add('is-correct');
    else if (choice !== null && i === choice) btn.classList.add('is-wrong');
  });

  if (choice === null) {
    clockEl.textContent = '0.0';
    clockEl.classList.add('is-low');
    barEl.style.width = '0%';
    barEl.classList.add('is-low');
  }

  const verdict = correct ? '<b>CORRECT</b>' : choice === null ? '<b>TIME UP</b>' : '<b>NOT QUITE</b>';
  feedbackEl.innerHTML = `${verdict} — ${escapeHtml(question.explain)}`;
  nextBtn.disabled = false;
  nextBtn.focus();
}

function next() {
  if (!run || !run.revealed || run.done) return;
  run.index += 1;
  if (run.index >= run.queue.length) {
    run.done = true; // stop a second Enter/click from submitting twice
    finish();
  } else {
    renderQuestion();
  }
}

async function finish() {
  stopTimer();
  const payload = {
    answers: run.answers,
    durationSec: Math.round((Date.now() - run.startedAt) / 1000),
  };
  const correct = run.answers.filter((a) => a.correct).length;

  quizEl.hidden = true;
  const result = await finishSession('brain-battle', payload);
  showResult(resultHost, result, {
    title: `${correct} / ${run.answers.length} correct`,
    againLabel: 'Play again',
    onAgain: () => {
      setupEl.hidden = false;
      renderSetup();
      refreshHeader();
    },
  });
  overlay.hidden = false;
  refreshHeader();
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

/* ---------------- events ---------------- */

startBtn.addEventListener('click', start);
nextBtn.addEventListener('click', next);
quitBtn.addEventListener('click', () => {
  stopTimer();
  quizEl.hidden = true;
  setupEl.hidden = false;
  renderSetup();
});

window.addEventListener('keydown', (e) => {
  if (!run || quizEl.hidden) return;
  if (e.key === 'Enter') {
    e.preventDefault();
    if (!nextBtn.disabled) next();
    return;
  }
  const n = Number(e.key);
  if (n >= 1 && n <= 4 && !run.revealed) {
    e.preventDefault();
    answer(n - 1);
  }
});

mountHeader();
renderSetup();
