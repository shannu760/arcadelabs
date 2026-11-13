/* Student Icon — skill tree (F4)

   Reads /api/skills. The catalogue is public; the levels in it belong to
   whoever is signed in, and only the server writes them (a challenge pass is
   the only thing that moves a level). A signed-out visitor sees the same tree
   with every level at zero, which is honest: the tree is a record, not a shop.
*/

import { loadSession, ensureFresh } from './session.js';
import { isLocalHost } from './api-status.js';

const API = '/api';
const DEV_KEY = 'si.player.id';

const state = { mode: 'dev', userId: null, session: null, tree: null };

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

function pips(level, maxLevel) {
  const row = document.createElement('div');
  row.className = 'si-pips';
  row.setAttribute('aria-hidden', 'true');

  for (let index = 0; index < maxLevel; index += 1) {
    const pip = document.createElement('span');
    if (index < level) pip.className = 'on';
    pip.className = `si-pip${index < level ? ' on' : ''}`;
    row.append(pip);
  }
  return row;
}

function nextLabel(skill) {
  if (skill.nextAtXp === null) return `MASTERED · ${skill.xp} XP`;
  const remaining = Math.max(0, skill.nextAtXp - skill.xp);
  return `${remaining} XP TO LV ${skill.level + 1} · ${skill.xp} XP`;
}

function skillNode(skill) {
  const card = document.createElement('article');
  card.className = 'si-skill';
  if (skill.level > 0) card.classList.add('is-trained');
  if (skill.level >= skill.maxLevel) card.classList.add('is-maxed');

  const head = document.createElement('div');
  head.className = 'si-skill-head';

  const title = document.createElement('h3');
  title.textContent = skill.title;

  const lv = document.createElement('span');
  lv.className = 'si-skill-lv';
  lv.textContent = `LV ${skill.level}/${skill.maxLevel}`;

  head.append(title, lv);

  const description = document.createElement('p');
  description.textContent = skill.description;

  const meter = document.createElement('div');
  meter.className = 'si-skill-meter';
  const fill = document.createElement('span');
  fill.style.width = `${Math.round(skill.progress * 100)}%`;
  meter.append(fill);

  const next = document.createElement('span');
  next.className = 'si-skill-next';
  next.textContent = nextLabel(skill);

  card.append(head, description, pips(skill.level, skill.maxLevel), meter, next);
  return card;
}

function renderTree() {
  const { branches, totals } = state.tree;

  el('stat-levels').textContent = `${totals.levels}/${totals.maxLevels}`;
  el('stat-started').textContent = `${totals.started}/${totals.skills}`;
  el('stat-xp').textContent = String(totals.xp);
  el('stat-cap').textContent = String(totals.maxLevels / totals.skills || 0);

  const host = el('branches');
  host.replaceChildren();

  for (const branch of branches) {
    const section = document.createElement('section');
    section.className = 'si-branch';
    section.dataset.branch = branch.slug;

    const head = document.createElement('div');
    head.className = 'si-branch-head';

    const title = document.createElement('h2');
    title.textContent = branch.title.toUpperCase();

    const sum = document.createElement('span');
    sum.className = 'si-branch-sum';
    const earned = branch.skills.reduce((total, skill) => total + skill.level, 0);
    const cap = branch.skills.reduce((total, skill) => total + skill.maxLevel, 0);
    sum.textContent = `${earned}/${cap}`;

    head.append(title, sum);
    section.append(head);

    for (const skill of branch.skills) section.append(skillNode(skill));
    host.append(section);
  }

  host.hidden = false;
}

/* No API means two very different situations, and neither is the visitor's
   fault: a static host that has no /api at all, or a local server that is not
   running. Say which one it is instead of printing a command at a stranger. */
function showOffline() {
  const local = isLocalHost();

  const note = el('skills-note');
  if (note) note.hidden = true;

  const summary = document.querySelector('.si-skill-summary');
  if (summary) summary.hidden = true;

  el('offline-title').textContent = local
    ? 'The skill tree cannot reach its API.'
    : 'The skill tree is not connected here.';
  el('offline-local').hidden = !local;
  el('offline-remote').hidden = local;
  el('api-offline').hidden = false;
}

async function init() {
  const health = await api('/health', { auth: false }).catch(() => ({ status: 0, data: null }));

  if (health.status === 200 && health.data?.auth === 'supabase') {
    state.mode = 'supabase';
    state.session = await ensureFresh(loadSession());
  } else if (health.status === 200) {
    state.userId = localStorage.getItem(DEV_KEY);
  }

  const { status, data } = await api('/skills');
  if (status !== 200 || !Array.isArray(data?.branches)) {
    showOffline();
    return;
  }

  state.tree = data;
  renderTree();

  const signedIn = state.mode === 'supabase' ? Boolean(state.session) : Boolean(state.userId);
  el('skills-note').textContent = signedIn
    ? 'Your own levels, read from the server. Finish a challenge that names a skill to move one.'
    : 'Signed out — this is the full tree with every level at zero. Create a player to start recording levels.';
}

init();
