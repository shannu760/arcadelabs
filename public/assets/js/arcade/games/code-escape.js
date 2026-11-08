/* CODE ESCAPE — Python, C and Java challenges on a five-level ladder.

   Every level holds eight challenges. Solving five of them opens the next
   level, and the ladder is stored twice: in this browser (store.js) and, when
   Supabase is configured, in arcade_code_solves. Questions come from the
   database when available and from the bundled bank otherwise (code-bank.js).

   The player only ever reports which challenges they answered correctly;
   rules.js recomputes score, XP and K-Points from that. */

import {
  CHALLENGES,
  KIND_LABEL,
  LANGUAGES,
  LANGUAGE_LABEL,
  LEVELS,
  challengesFor,
  levelProgress,
  unlockedLevel,
} from '../data/code-challenges.js';
import { BANK_SOURCE_NOTE, loadChallenges } from '../code-bank.js';
import { codeSolvedIds, recordCodeSolves } from '../store.js';
import { mountHeader, finishSession, showResult, refreshHeader } from '../shell.js';
import { cloudEnabled, syncCodeSolves } from '../cloud.js';

const setupEl = document.getElementById('setup');
const runEl = document.getElementById('run');
const levelsEl = document.getElementById('levels');
const langChips = document.getElementById('langChips');
const poolNote = document.getElementById('poolNote');
const bankNote = document.getElementById('bankNote');
const startBtn = document.getElementById('startBtn');
const progressEl = document.getElementById('progress');
const runTagEl = document.getElementById('runTag');
const solvedEl = document.getElementById('solvedCount');
const langTagEl = document.getElementById('langTag');
const kindTagEl = document.getElementById('kindTag');
const titleEl = document.getElementById('challengeTitle');
const codeBlock = document.getElementById('codeBlock');
const promptEl = document.getElementById('prompt');
const optionsEl = document.getElementById('options');
const feedbackEl = document.getElementById('feedback');
const nextBtn = document.getElementById('nextBtn');
const quitBtn = document.getElementById('quitBtn');
const overlay = document.getElementById('overlay');
const resultHost = document.getElementById('resultHost');

let bank = CHALLENGES;
let bankSource = 'bundled';
let language = 'all';
let selectedLevel = 1;
let run = null;

/* ------------------------------------------------------------------ */
/* setup                                                              */
/* ------------------------------------------------------------------ */

function chip(label, active, onClick, disabled = false) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = `labs-chip ${active ? 'is-active' : ''}`;
  b.textContent = label;
  b.disabled = disabled;
  b.addEventListener('click', onClick);
  return b;
}

function poolSize() {
  return challengesFor(selectedLevel, language, bank).length;
}

function renderLevels() {
  const solved = codeSolvedIds();
  levelsEl.innerHTML = '';
  for (const meta of LEVELS) {
    const p = levelProgress(meta.level, solved, bank);
    const row = document.createElement('button');
    row.type = 'button';
    row.className = `code-level ${p.unlocked ? '' : 'is-locked'} ${
      meta.level === selectedLevel ? 'is-selected' : ''
    } ${p.cleared ? 'is-cleared' : ''}`;
    row.disabled = !p.unlocked;
    row.setAttribute('aria-pressed', String(meta.level === selectedLevel));

    const pct = p.total ? Math.round((p.solved / p.total) * 100) : 0;
    const state = !p.unlocked
      ? `SOLVE ${Math.max(0, p.need - p.previousSolved)} MORE IN LVL ${meta.level - 1}`
      : p.cleared
        ? 'CLEARED'
        : meta.level === selectedLevel
          ? 'SELECTED'
          : 'PLAY';

    row.innerHTML = `
      <span class="code-level-no">${String(meta.level).padStart(2, '0')}</span>
      <span class="code-level-main">
        <span class="code-level-head">
          <b>${meta.name}</b>
          <em>${meta.difficulty.toUpperCase()}</em>
        </span>
        <span class="code-level-blurb">${meta.blurb}</span>
        <span class="code-level-track"><i style="width:${pct}%"></i></span>
        <span class="code-level-meta">${p.solved} / ${p.total} SOLVED${p.unlocked ? '' : ' · LOCKED'}</span>
      </span>
      <span class="code-level-state">${state}</span>`;

    row.addEventListener('click', () => {
      if (!p.unlocked) return;
      selectedLevel = meta.level;
      renderSetup();
    });
    levelsEl.appendChild(row);
  }

  const unlocked = unlockedLevel(solved, bank);
  const open = LEVELS.filter((l) => l.level <= unlocked).length;
  bankNote.dataset.source = bankSource;
  bankNote.textContent = `${open} / ${LEVELS.length} LEVELS OPEN · ${bank.length} CHALLENGES · ${
    BANK_SOURCE_NOTE[bankSource] || ''
  }`;
}

function renderSetup() {
  const solved = codeSolvedIds();
  const unlocked = unlockedLevel(solved, bank);
  if (selectedLevel > unlocked) selectedLevel = unlocked;

  renderLevels();

  langChips.innerHTML = '';
  langChips.appendChild(
    chip('All languages', language === 'all', () => {
      language = 'all';
      renderSetup();
    }),
  );
  for (const lang of LANGUAGES) {
    langChips.appendChild(
      chip(LANGUAGE_LABEL[lang], language === lang, () => {
        language = lang;
        renderSetup();
      }),
    );
  }

  const n = poolSize();
  const level = levelProgress(selectedLevel, solved, bank);
  const nextLevel = LEVELS.find((l) => l.level === selectedLevel + 1);
  startBtn.disabled = n === 0;
  poolNote.textContent = n
    ? `Level ${selectedLevel} · ${level.name} — ${n} challenge${n === 1 ? '' : 's'} in this run. ${
        nextLevel
          ? `Solve ${nextLevel.unlockAt} here to open level ${nextLevel.level} (${nextLevel.name}).`
          : 'Final tier: clear all eight to finish the ladder.'
      }`
    : `No ${language === 'all' ? '' : LANGUAGE_LABEL[language] + ' '}challenges in level ${selectedLevel}. Try another language.`;
}

/* ------------------------------------------------------------------ */
/* run                                                                */
/* ------------------------------------------------------------------ */

function shuffleOptions(item) {
  const order = item.options.map((text, i) => ({ text, correct: i === item.answer }));
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return { options: order, correctIndex: order.findIndex((o) => o.correct) };
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
}

function renderCode(code) {
  const lines = String(code || '').replace(/\t/g, '    ').split('\n');
  codeBlock.innerHTML = lines
    .map(
      (line, i) =>
        `<span class="code-line"><i class="ln">${i + 1}</i><code>${escapeHtml(line) || ' '}</code></span>`,
    )
    .join('');
}

function start() {
  const queue = challengesFor(selectedLevel, language, bank);
  if (!queue.length) return;
  run = {
    queue,
    index: 0,
    answers: [],
    startedAt: Date.now(),
    revealed: false,
    current: null,
  };
  overlay.hidden = true;
  setupEl.hidden = true;
  runEl.hidden = false;
  renderChallenge();
}

function renderChallenge() {
  const item = run.queue[run.index];
  const { options, correctIndex } = shuffleOptions(item);
  run.current = { item, options, correctIndex };
  run.revealed = false;

  progressEl.textContent = `${run.index + 1} / ${run.queue.length}`;
  runTagEl.textContent = `LEVEL ${item.level} · ${(KIND_LABEL[item.kind] || item.kind).toUpperCase()}`;
  solvedEl.textContent = `${run.answers.filter((a) => a.correct).length} SOLVED`;
  langTagEl.textContent = LANGUAGE_LABEL[item.language] || item.language.toUpperCase();
  langTagEl.className = `code-lang ${item.language}`;
  kindTagEl.textContent = item.source === 'hackerrank' ? 'HACKERRANK STYLE' : 'ORIGINAL';
  titleEl.textContent = item.title;

  renderCode(item.code);
  promptEl.textContent = item.prompt;
  feedbackEl.innerHTML = '&nbsp;';
  nextBtn.disabled = true;
  nextBtn.textContent = run.index + 1 === run.queue.length ? 'Finish run' : 'Next';

  optionsEl.innerHTML = '';
  options.forEach((opt, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'quiz-opt';
    b.innerHTML = `<span class="labs-reward" style="margin-right:8px">${i + 1}</span>${escapeHtml(opt.text)}`;
    b.addEventListener('click', () => answer(i));
    optionsEl.appendChild(b);
  });
  nextBtn.focus();
}

function answer(choice) {
  if (!run || run.revealed) return;
  run.revealed = true;

  const { item, options, correctIndex } = run.current;
  const correct = choice === correctIndex;
  run.answers.push({ id: item.id, difficulty: item.difficulty, correct });

  [...optionsEl.children].forEach((btn, i) => {
    btn.disabled = true;
    if (i === correctIndex) btn.classList.add('is-correct');
    else if (i === choice) btn.classList.add('is-wrong');
  });

  // For "find the bug" items, mark the offending line once the answer is out.
  if (item.kind === 'debug') {
    const m = String(options[correctIndex].text).match(/line\s+(\d+)/i);
    const n = m ? Number(m[1]) : 0;
    const target = codeBlock.querySelectorAll('.code-line')[n - 1];
    if (target) target.classList.add('is-bad');
  }

  const verdict = correct ? '<b>CORRECT</b>' : '<b>NOT QUITE</b>';
  feedbackEl.innerHTML = `${verdict} — ${escapeHtml(item.explain)}`;
  solvedEl.textContent = `${run.answers.filter((a) => a.correct).length} SOLVED`;
  nextBtn.disabled = false;
  nextBtn.focus();
}

function next() {
  if (!run || !run.revealed || run.done) return;
  run.index += 1;
  if (run.index >= run.queue.length) {
    run.done = true;
    finish();
  } else {
    renderChallenge();
  }
}

async function finish() {
  const payload = {
    challenges: run.answers.map((a) => ({ id: a.id, difficulty: a.difficulty, correct: a.correct })),
    durationSec: Math.round((Date.now() - run.startedAt) / 1000),
  };
  const correctIds = run.answers.filter((a) => a.correct).map((a) => a.id);
  const total = run.queue.length;
  const correct = correctIds.length;

  const before = unlockedLevel(codeSolvedIds(), bank);
  runEl.hidden = true;
  const result = await finishSession('code-escape', payload);

  recordCodeSolves(correctIds);
  if (cloudEnabled() && correctIds.length) syncCodeSolves(correctIds).catch(() => {});

  const solvedNow = codeSolvedIds();
  const after = unlockedLevel(solvedNow, bank);

  const card = showResult(resultHost, result, {
    title: `${correct} / ${total} solved`,
    againLabel: 'Back to ladder',
    onAgain: () => {
      renderSetup();
      overlay.hidden = true;
      setupEl.hidden = false;
      refreshHeader();
    },
  });
  overlay.hidden = false;

  if (after > before) {
    const gained = LEVELS.filter((l) => l.level > before && l.level <= after)
      .map((l) => challengesFor(l.level, 'all', bank).length)
      .reduce((sum, n) => sum + n, 0);
    const note = document.createElement('p');
    note.className = 'code-unlock';
    note.textContent = `LEVEL ${after} UNLOCKED — ${gained} NEW CHALLENGES`;
    card.querySelector('.result-rows')?.after(note);
  }
  refreshHeader();
}

/* ------------------------------------------------------------------ */
/* events + boot                                                      */
/* ------------------------------------------------------------------ */

startBtn.addEventListener('click', start);
nextBtn.addEventListener('click', next);
quitBtn.addEventListener('click', () => {
  run = null;
  runEl.hidden = true;
  setupEl.hidden = false;
  renderSetup();
  refreshHeader();
});

window.addEventListener('keydown', (e) => {
  if (!run || runEl.hidden) return;
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

/* Swap in the database copy when one is available, without blocking first paint. */
loadChallenges()
  .then((loaded) => {
    bank = loaded.items;
    bankSource = loaded.source;
    if (loaded.syncedAt) bankNote.title = `Last synced ${new Date(loaded.syncedAt).toLocaleString()}`;
    renderSetup();
  })
  .catch(() => {
    /* bundled bank is already rendering */
  });
