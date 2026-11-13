/* Student Icon — public profile page (F3)

   Reads /api/profiles/:handle and renders it. The handle comes from the URL:
   /ada, or profile.html?handle=ada. The owner sees an edit panel that patches
   the same whitelisted fields onboarding writes.

   The page never decides visibility itself: /api/profiles answers 404 for an
   unlisted profile unless the caller is its owner, so an unlisted player is
   simply "no player here" to everyone else.
*/

import { loadSession, ensureFresh } from './session.js';

const API = '/api';
const HANDLE_RE = /^[a-z0-9_]{3,20}$/;
const DEV_KEY = 'si.player.id';

const STAGES = {
  school: 'School',
  college: 'College / sixth form',
  university: 'University',
  graduate: 'Just graduated',
  working: 'Working',
  other: 'Something else',
};

const COUNTRIES = {
  GB: 'United Kingdom', US: 'United States', IN: 'India', NG: 'Nigeria', KE: 'Kenya',
  ZA: 'South Africa', CA: 'Canada', AU: 'Australia', DE: 'Germany', FR: 'France',
  BR: 'Brazil', SG: 'Singapore', AE: 'United Arab Emirates', PH: 'Philippines',
  PK: 'Pakistan', BD: 'Bangladesh',
};

const state = {
  mode: 'dev',
  userId: null,
  session: null,
  profile: null,
  isOwner: false,
  ranks: [],
  careers: [],
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

/* ------------------------------------------------------------ the handle */

function handleFromUrl() {
  const fromPath = decodeURIComponent(location.pathname).replace(/^\/+|\/+$/g, '');
  if (HANDLE_RE.test(fromPath)) return fromPath;

  const fromQuery = (new URLSearchParams(location.search).get('handle') || '').toLowerCase();
  if (HANDLE_RE.test(fromQuery)) return fromQuery;

  return null;
}

/* -------------------------------------------------------------- avatar */

/** A deterministic 5×5 pixel identicon — same handle, same face, every time. */
function paintAvatar(handle) {
  const node = el('avatar');
  node.replaceChildren();

  let hash = 2166136261;
  for (const char of handle) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }

  const grid = document.createElement('div');
  grid.className = 'si-avatar-grid';

  for (let y = 0; y < 5; y += 1) {
    for (let x = 0; x < 5; x += 1) {
      const column = x < 3 ? x : 4 - x;
      const bit = (Math.abs(hash) >> ((y * 3 + column) % 30)) & 1;
      const cell = document.createElement('span');
      if (bit) cell.className = (x + y) % 3 === 0 ? 'on gold' : 'on';
      grid.append(cell);
    }
  }

  node.append(grid);
}

/* ------------------------------------------------------------- rendering */

function joinedLabel(profile) {
  const when = profile.createdAt ? new Date(profile.createdAt) : null;
  if (!when || Number.isNaN(when.getTime())) return 'Player record';
  const month = when.toLocaleString('en-GB', { month: 'short' });
  return `Joined ${month} ${when.getFullYear()}`;
}

function render() {
  const profile = state.profile;

  document.title = `${profile.displayName || profile.handle} (@${profile.handle}) — Student Icon`;

  el('p-name').textContent = profile.displayName || profile.handle;
  el('p-handle').textContent = profile.handle;
  el('p-xp').textContent = `${profile.xp ?? 0} XP`;

  const rank = state.ranks.find((entry) => entry.rank_index === profile.rankIndex);
  el('p-rank').textContent = rank ? rank.title : 'Dreamer';

  const visibility = profile.visibility === 'public' ? 'PUBLIC PLAYER' : 'UNLISTED PLAYER';
  el('p-visibility').textContent = state.isOwner && profile.visibility !== 'public'
    ? `${visibility} · ONLY YOU CAN SEE THIS`
    : visibility;

  el('p-meta').textContent = [
    STAGES[profile.educationStage] || '',
    COUNTRIES[profile.country] || '',
    joinedLabel(profile),
  ].filter(Boolean).join(' · ');

  const bio = el('p-bio');
  bio.textContent = profile.bio || '';
  bio.hidden = !profile.bio;

  paintAvatar(profile.handle);
  renderTags(profile);
  el('edit-toggle').hidden = !state.isOwner;
  el('edit-handle').textContent = profile.handle;

  el('state-loading').hidden = true;
  el('state-missing').hidden = true;
  el('profile-card').hidden = false;
}

function renderTags(profile) {
  const interests = profile.interests || [];
  const block = el('p-interests-block');
  el('p-interests').replaceChildren(...interests.map((tag) => chip(tag)));
  block.hidden = interests.length === 0;

  const careers = (profile.careers || []).map((slug) => {
    const match = state.careers.find((career) => career.slug === slug);
    return match ? match.title : slug;
  });
  el('p-careers').replaceChildren(...careers.map((title) => chip(title)));
  el('p-careers-block').hidden = careers.length === 0;
}

function chip(label) {
  const node = document.createElement('span');
  node.className = 'si-chip is-static';
  node.textContent = label;
  return node;
}

function showMissing(reason, retry = false) {
  el('state-loading').hidden = true;
  el('profile-card').hidden = true;
  el('missing-reason').textContent = reason;
  if (retry) el('missing-title').textContent = 'Could not load this player.';
  el('state-missing').hidden = false;
  document.title = 'No player here — Student Icon';
}

/* ---------------------------------------------------------------- editing */

function openEditor() {
  const profile = state.profile;
  el('edit-name').value = profile.displayName || '';
  el('edit-stage').value = profile.educationStage || '';
  el('edit-country').value = profile.country || '';
  el('edit-bio').value = profile.bio || '';
  el('edit-bio-count').textContent = String((profile.bio || '').length);
  el('edit-visibility').value = profile.visibility || 'public';

  el('edit-error').hidden = true;
  el('edit-note').hidden = true;
  el('edit-panel').hidden = false;
  el('edit-toggle').hidden = true;
  el('edit-name').focus();
}

function closeEditor() {
  el('edit-panel').hidden = true;
  el('edit-toggle').hidden = !state.isOwner;
}

async function saveProfile(event) {
  event.preventDefault();

  const displayName = el('edit-name').value.trim();
  const bio = el('edit-bio').value.trim();

  if (!displayName) {
    setError('Display name cannot be empty.');
    el('edit-name').focus();
    return;
  }

  const button = el('save');
  button.disabled = true;
  button.textContent = 'Saving…';
  el('edit-error').hidden = true;
  el('edit-note').hidden = true;

  const { status, data } = await api('/me', {
    method: 'PATCH',
    body: {
      displayName,
      bio,
      educationStage: el('edit-stage').value || null,
      country: el('edit-country').value || null,
      visibility: el('edit-visibility').value,
    },
  });

  button.disabled = false;
  button.textContent = 'Save changes';

  if (status !== 200) {
    setError(data?.error?.message || 'Could not save your profile.');
    return;
  }

  state.profile = data.profile;
  render();
  openEditor();
  el('edit-note').textContent = 'Saved.';
  el('edit-note').hidden = false;
  history.replaceState(null, '', `/${state.profile.handle}${location.search}`);
}

function setError(message) {
  const node = el('edit-error');
  node.textContent = message;
  node.hidden = !message;
}

/* ----------------------------------------------------------------- boot */

function bindEvents() {
  el('edit-toggle').addEventListener('click', openEditor);
  el('cancel').addEventListener('click', closeEditor);
  el('edit-panel').addEventListener('submit', saveProfile);
  el('edit-bio').addEventListener('input', (event) => {
    el('edit-bio-count').textContent = String(event.target.value.length);
  });
}

async function loadReference() {
  const [ranks, careers] = await Promise.all([
    api('/ranks', { auth: false }),
    api('/careers', { auth: false }),
  ]);

  state.ranks = ranks.status === 200 && Array.isArray(ranks.data?.ranks) ? ranks.data.ranks : [];
  state.careers = careers.status === 200 && Array.isArray(careers.data?.careers) ? careers.data.careers : [];
}

async function init() {
  bindEvents();

  const health = await api('/health', { auth: false }).catch(() => ({ status: 0, data: null }));
  if (health.status !== 200) {
    showMissing('The API is not answering. Start the server with "npm run dev".', true);
    return;
  }

  state.mode = health.data?.auth === 'supabase' ? 'supabase' : 'dev';
  if (state.mode === 'supabase') {
    state.session = await ensureFresh(loadSession());
  } else {
    state.userId = localStorage.getItem(DEV_KEY);
  }

  const handle = handleFromUrl();
  if (!handle) {
    showMissing('That address is not a player handle. Handles are 3–20 characters: a–z, 0–9, underscore.');
    return;
  }

  const { status, data } = await api(`/profiles/${encodeURIComponent(handle)}`);

  if (status === 404) {
    showMissing(`No public player is at @${handle}. The handle may be free — or that player chose to stay unlisted.`);
    return;
  }
  if (status !== 200 || !data?.profile) {
    showMissing('The API answered, but not with a profile. Try again in a moment.', true);
    return;
  }

  state.profile = data.profile;
  state.isOwner = Boolean(data.isOwner);

  await loadReference();
  render();
}

init();
