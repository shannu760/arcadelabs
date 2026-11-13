/* Student Icon — learning challenges (F4)

   The page renders /api/challenges and posts answers to
   /api/challenges/:id/submit. It never decides whether an answer is right and
   never sends a score: icon_submit_challenge() does that server-side, awards XP
   once, and moves the named skill's level.

   The answer key is not in the payload at all, which is why a failed submission
   returns no explanation — there is nothing here to reverse-engineer.
*/

import { loadSession, ensureFresh } from './session.js';
import { isLocalHost } from './api-status.js';

const API = '/api';
const DEV_KEY = 'si.player.id';

const state = {
  mode: 'dev',
  userId: null,
  session: null,
  challenges: [],
  active: null,
};

const el = (id) => document.getElementById(id);

async function api(path, { method = 'GET', body, auth = true } = {}) {
  const headers = {};
  if (body !== undefined) headers['content-type'] = 'application/json';

  if (auth) {
    if (state.mode === 'supabase') {
      state.session = await ensureFresh(state.session);
      if (state.session?.accessToken) headers.authorization = `Bearer ${state.session.accessToken}`;
    } else if (state.userId) {
      headers['x-dev-user'] = state.userId;
    }
  }

  const res = await fetch(API + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

const signedIn = () => (state.mode === 'supabase' ? Boolean(state.session) : Boolean(state.userId));

/* --------------------------------------------------------------- list */

function renderList() {
  const host = el('list');
  host.replaceChildren();

  if (!state.challenges.length) {
    const empty = document.createElement('p');
    empty.className = 'si-hint';
    empty.textContent = 'No challenges are published yet.';
    host.append(empty);
    el('list-note')?.remove();
    return;
  }

  el('list-note')?.remove();

  for (const challenge of state.challenges) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'si-challenge-card';
    card.dataset.id = challenge.id;
    if (challenge.passed) card.classList.add('is-passed');
    if (state.active?.id === challenge.id) card.classList.add('is-active');

    const title = document.createElement('span');
    title.className = 'si-challenge-title';
    title.textContent = challenge.title;

    const meta = document.createElement('span');
    meta.className = 'si-challenge-meta';
    meta.textContent = [
      challenge.category.title,
      `TIER ${challenge.tier}`,
      challenge.difficulty.toUpperCase(),
      challenge.skill.replace(/-/g, ' '),
      challenge.passed ? 'PASSED' : '',
    ].filter(Boolean).join(' · ');

    const xp = document.createElement('span');
    xp.className = 'si-challenge-xp';
    xp.textContent = `+${challenge.xpReward} XP`;

    card.append(title, meta, xp);
    card.addEventListener('click', () => openChallenge(challenge));
    host.append(card);
  }
}

/* ------------------------------------------------------------ the panel */

function answerField(challenge) {
  const host = el('ch-answer');
  host.replaceChildren();

  const label = document.createElement('label');
  label.textContent = challenge.payload?.question || 'Your answer';
  host.append(label);

  if (challenge.kind === 'choice') {
    const options = Array.isArray(challenge.payload?.options) ? challenge.payload.options : [];
    const group = document.createElement('div');
    group.className = 'si-answers';

    options.forEach((option, index) => {
      const row = document.createElement('label');
      row.className = 'si-answer';

      const input = document.createElement('input');
      input.type = 'radio';
      input.name = `answer-${challenge.id}`;
      input.value = option;
      input.id = `answer-${challenge.id}-${index}`;

      const text = document.createElement('span');
      text.textContent = option;

      row.append(input, text);
      group.append(row);
    });

    host.append(group);
    return;
  }

  const input = document.createElement('input');
  input.id = 'answer-value';
  input.type = challenge.kind === 'number' ? 'number' : 'text';
  input.step = 'any';
  input.autocomplete = 'off';
  input.placeholder = challenge.payload?.placeholder || 'Your answer';
  host.append(input);
}

function collectAnswer(challenge) {
  if (challenge.kind === 'choice') {
    const picked = document.querySelector(`input[name="answer-${challenge.id}"]:checked`);
    return picked ? { answer: picked.value } : null;
  }

  const value = el('answer-value')?.value?.trim() || '';
  if (!value) return null;
  return { value };
}

function openChallenge(challenge) {
  state.active = challenge;

  el('panel-empty').hidden = true;
  el('panel-body').hidden = false;

  el('ch-category').textContent =
    `${challenge.category.title.toUpperCase()} · TIER ${challenge.tier} · +${challenge.xpReward} XP · ${challenge.skill.toUpperCase()}`;
  el('ch-title').textContent = challenge.title;
  el('ch-objective').textContent = challenge.objective;
  el('ch-brief').textContent = challenge.brief;

  const tasks = el('ch-tasks');
  tasks.replaceChildren();
  for (const task of challenge.tasks || []) {
    const item = document.createElement('li');
    item.textContent = task;
    tasks.append(item);
  }

  answerField(challenge);
  el('ch-error').hidden = true;
  el('ch-result').hidden = true;
  el('ch-submit').disabled = false;
  el('ch-submit').textContent = challenge.passed ? 'Submit again' : 'Submit answer';

  renderList();
}

function closePanel() {
  state.active = null;
  el('panel-body').hidden = true;
  el('panel-empty').hidden = false;
  renderList();
}

/* ----------------------------------------------------------- submitting */

async function submit(event) {
  event.preventDefault();
  const challenge = state.active;
  if (!challenge) return;

  if (!signedIn()) {
    showError('Create a player first — XP and levels attach to an account.');
    return;
  }

  const answers = collectAnswer(challenge);
  if (!answers) {
    showError(challenge.kind === 'choice' ? 'Pick one option.' : 'Enter an answer first.');
    return;
  }

  const button = el('ch-submit');
  button.disabled = true;
  button.textContent = 'Scoring…';
  el('ch-error').hidden = true;
  el('ch-result').hidden = true;

  const { status, data } = await api(`/challenges/${challenge.id}/submit`, {
    method: 'POST',
    body: { answers },
  });

  button.disabled = false;
  button.textContent = 'Submit answer';

  if (status === 401) {
    showError('Your session ended. Sign in again to keep your XP.');
    return;
  }
  if (status !== 200) {
    showError(data?.error?.message || 'Could not score that answer.');
    return;
  }

  const result = el('ch-result');
  result.hidden = false;
  result.className = `si-result ${data.passed ? 'is-pass' : 'is-fail'}`;

  if (data.status === 'repeat') {
    el('ch-result-line').textContent = 'ALREADY PASSED';
    el('ch-result-detail').textContent = 'This challenge paid out once already — repeats do not add XP.';
    return;
  }

  if (data.passed) {
    el('ch-result-line').textContent = `PASSED · +${challenge.xpReward} XP`;
    const parts = [`Total XP: ${data.xp}`];
    if (data.skill) parts.push(`${data.skill.replace(/-/g, ' ')} is now level ${data.skill_level}`);
    if (data.explanation) parts.push(data.explanation);
    el('ch-result-detail').textContent = parts.join(' · ');

    challenge.passed = true;
    renderList();
    return;
  }

  el('ch-result-line').textContent = 'NOT YET';
  el('ch-result-detail').textContent = 'That answer did not score. Read the brief again and resubmit — nothing was spent.';
}

function showError(message) {
  const node = el('ch-error');
  node.textContent = message;
  node.hidden = !message;
}

/* ----------------------------------------------------------------- boot */

/* A static host has no /api to score answers; a local machine has a server that
   is not running. Both are explained plainly instead of telling a visitor to
   run a command. */
function showOffline() {
  const local = isLocalHost();

  const body = document.querySelector('.si-learn-body');
  if (body) body.hidden = true;

  el('offline-title').textContent = local
    ? 'Challenges cannot reach their API.'
    : 'Challenges are not connected here.';
  el('offline-local').hidden = !local;
  el('offline-remote').hidden = local;
  el('api-offline').hidden = false;
}

async function init() {
  el('ch-form').addEventListener('submit', submit);
  el('ch-close').addEventListener('click', closePanel);

  const health = await api('/health', { auth: false }).catch(() => ({ status: 0, data: null }));

  if (health.status === 200 && health.data?.auth === 'supabase') {
    state.mode = 'supabase';
    state.session = await ensureFresh(loadSession());
  } else if (health.status === 200) {
    state.userId = localStorage.getItem(DEV_KEY);
  }

  const { status, data } = await api('/challenges');
  if (status !== 200 || !Array.isArray(data?.challenges)) {
    showOffline();
    return;
  }

  state.challenges = data.challenges;
  renderList();
}

init();
