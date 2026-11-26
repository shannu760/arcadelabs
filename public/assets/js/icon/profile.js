/* Student Icon — public profile page (F3)

   Reads /api/profiles/:handle and renders it. The handle comes from the URL:
   /ada, or profile.html?handle=ada. The owner sees an edit panel that patches
   the same whitelisted fields onboarding writes.

   The page never decides visibility itself: /api/profiles answers 404 for an
   unlisted profile unless the caller is its owner, so an unlisted player is
   simply "no player here" to everyone else.
*/

import { loadSession, ensureFresh, clearSession } from './session.js';
import { isLocalHost } from './api-status.js';

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

const PRESET_INTERESTS = [
  'ai', 'space', 'climate', 'fintech', 'health', 'education',
  'gaming', 'media', 'robotics', 'design', 'finance', 'policy',
];
const MAX_TAGS = 12;

const state = {
  mode: 'dev',
  userId: null,
  session: null,
  profile: null,
  isOwner: false,
  ranks: [],
  careers: [],
  projects: [],
  pickedInterests: new Set(),
  pickedCareers: new Set(),
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
  renderProjects();
  el('edit-toggle').hidden = !state.isOwner;
  el('account-panel').hidden = !state.isOwner;
  el('add-project').hidden = !state.isOwner;
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

function toggleChip(label, active, onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'si-chip';
  button.textContent = label;
  button.setAttribute('aria-pressed', active ? 'true' : 'false');
  if (active) button.classList.add('is-on');
  button.addEventListener('click', onClick);
  return button;
}

function renderFocusChips() {
  const profile = state.profile;
  state.pickedInterests = new Set(profile.interests || []);
  state.pickedCareers = new Set(profile.careers || []);

  const interests = el('edit-interests');
  interests.replaceChildren();
  const allInterests = [...new Set([...PRESET_INTERESTS, ...state.pickedInterests])].sort();
  for (const tag of allInterests) {
    interests.append(
      toggleChip(tag, state.pickedInterests.has(tag), () => {
        if (state.pickedInterests.has(tag)) state.pickedInterests.delete(tag);
        else if (state.pickedInterests.size < MAX_TAGS) state.pickedInterests.add(tag);
        renderFocusChips();
      })
    );
  }

  const careers = el('edit-careers');
  careers.replaceChildren();
  for (const career of state.careers) {
    careers.append(
      toggleChip(career.title, state.pickedCareers.has(career.slug), () => {
        if (state.pickedCareers.has(career.slug)) state.pickedCareers.delete(career.slug);
        else if (state.pickedCareers.size < MAX_TAGS) state.pickedCareers.add(career.slug);
        renderFocusChips();
      })
    );
  }
}

function openEditor() {
  const profile = state.profile;
  renderFocusChips();
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

  /* Focus lives on its own endpoint (it is a set, not a column), so it is
     saved alongside the profile. A failure there must not look like the
     profile edit failed. */
  const focus = await api('/me/interests', {
    method: 'PUT',
    body: { interests: [...state.pickedInterests], careers: [...state.pickedCareers] },
  });

  if (focus.status === 200 && focus.data?.profile) {
    state.profile = focus.data.profile;
  } else {
    setError('Profile saved, but your interests did not stick. Try saving again.');
  }

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

/* -------------------------------------------------------------- projects */

function renderProjects() {
  const host = el('p-projects');
  host.replaceChildren();

  if (!state.projects.length) {
    const empty = document.createElement('p');
    empty.className = 'si-hint';
    empty.textContent = state.isOwner ? 'No projects yet.' : 'No public projects yet.';
    host.append(empty);
    return;
  }

  for (const project of state.projects) {
    const card = document.createElement('article');
    card.className = 'si-project';

    const title = document.createElement('h3');
    title.textContent = project.title;
    card.append(title);

    if (project.summary) {
      const summary = document.createElement('p');
      summary.textContent = project.summary;
      card.append(summary);
    }

    const meta = document.createElement('p');
    meta.className = 'si-hint';
    meta.textContent = [project.category, project.status].filter(Boolean).join(' · ');
    card.append(meta);

    for (const link of project.links || []) {
      if (!/^https?:\/\//i.test(String(link?.url || ''))) continue;
      const anchor = document.createElement('a');
      anchor.href = link.url;
      anchor.textContent = link.label || link.url;
      anchor.rel = 'noopener noreferrer nofollow';
      anchor.target = '_blank';
      card.append(anchor);
    }

    if (state.isOwner) {
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'btn ghost small';
      remove.textContent = 'Delete';
      remove.addEventListener('click', async () => {
        const { status } = await api(`/projects/${project.id}`, { method: 'DELETE' });
        if (status === 200) {
          state.projects = state.projects.filter((entry) => entry.id !== project.id);
          renderProjects();
        } else {
          setProjectError('Could not delete that project.');
        }
      });
      card.append(remove);
    }

    host.append(card);
  }
}

function setProjectError(message) {
  const node = el('project-error');
  node.textContent = message;
  node.hidden = !message;
}

async function loadProjects() {
  if (!state.profile) return;
  const path = state.isOwner
    ? '/projects'
    : `/projects?handle=${encodeURIComponent(state.profile.handle)}`;
  const { status, data } = await api(path, { auth: state.isOwner });
  state.projects = status === 200 && Array.isArray(data?.projects) ? data.projects : [];
}

async function addProject(event) {
  event.preventDefault();
  const title = el('project-title').value.trim();
  if (title.length < 2) {
    setProjectError('Give the project a title.');
    el('project-title').focus();
    return;
  }

  const link = el('project-link').value.trim();
  if (link && !/^https?:\/\//i.test(link)) {
    setProjectError('The link needs to start with http:// or https://');
    return;
  }

  const button = el('project-save');
  button.disabled = true;
  button.textContent = 'Adding…';
  setProjectError('');

  const { status, data } = await api('/projects', {
    method: 'POST',
    body: {
      title,
      summary: el('project-summary').value.trim(),
      category: el('project-category').value,
      status: el('project-status').value,
      links: link ? [{ label: 'Link', url: link }] : [],
    },
  });

  button.disabled = false;
  button.textContent = 'Add project';

  if (status !== 201) {
    setProjectError(data?.error?.message || 'Could not add that project.');
    return;
  }

  el('project-form').reset();
  el('project-form').hidden = true;
  el('add-project').hidden = false;
  await loadProjects();
  renderProjects();
}

/* --------------------------------------------------------------- account */

function setAccountNote(message) {
  const node = el('account-note');
  node.textContent = message;
  node.hidden = !message;
}

function setAccountError(message) {
  const node = el('account-error');
  node.textContent = message;
  node.hidden = !message;
}

async function authHeaders() {
  const headers = {};
  if (state.mode === 'supabase') {
    state.session = await ensureFresh(state.session);
    if (state.session?.accessToken) headers.authorization = `Bearer ${state.session.accessToken}`;
  } else if (state.userId) {
    headers['x-dev-user'] = state.userId;
  }
  return headers;
}

async function exportData() {
  setAccountError('');
  setAccountNote('');

  const res = await fetch('/api/me/export', { headers: await authHeaders() }).catch(() => null);
  if (!res || !res.ok) {
    setAccountError('Could not build your export. Try again in a moment.');
    return;
  }

  const blob = await res.blob();
  const anchor = document.createElement('a');
  anchor.href = URL.createObjectURL(blob);
  anchor.download = `student-icon-${state.profile.handle}.json`;
  anchor.click();
  URL.revokeObjectURL(anchor.href);
  setAccountNote('Export downloaded.');
}

async function changeEmail(event) {
  event.preventDefault();
  const email = el('email-new').value.trim().toLowerCase();
  setAccountError('');
  setAccountNote('');

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    setAccountError('Enter a valid email address.');
    return;
  }

  const { status, data } = await api('/auth/email', { method: 'POST', body: { email } });
  if (status === 200) {
    setAccountNote(data?.message || 'Check the new address for a confirmation link.');
    el('email-new').value = '';
  } else {
    setAccountError(data?.error?.message || 'Could not start the email change.');
  }
}

async function deleteAccount() {
  setAccountError('');
  setAccountNote('');

  if (el('delete-confirm').value.trim().toLowerCase() !== 'delete') {
    setAccountError('Type delete to confirm.');
    return;
  }

  const button = el('delete-account');
  button.disabled = true;
  button.textContent = 'Deleting…';

  const { status, data } = await api('/me', { method: 'DELETE', body: { confirm: 'delete' } });

  button.disabled = false;
  button.textContent = 'Delete my account';

  if (status !== 200) {
    setAccountError(data?.error?.message || 'Could not delete the account. Try again.');
    return;
  }

  clearSession();
  try {
    localStorage.removeItem(DEV_KEY);
  } catch {
    /* nothing to do */
  }

  setAccountNote(data?.message || 'Your player is gone.');
  setTimeout(() => {
    location.href = './index.html';
  }, 2500);
}

/* ----------------------------------------------------------------- boot */

function bindEvents() {
  el('edit-toggle').addEventListener('click', openEditor);
  el('cancel').addEventListener('click', closeEditor);
  el('edit-panel').addEventListener('submit', saveProfile);
  el('edit-bio').addEventListener('input', (event) => {
    el('edit-bio-count').textContent = String(event.target.value.length);
  });

  el('add-project').addEventListener('click', () => {
    el('project-form').hidden = false;
    el('add-project').hidden = true;
    setProjectError('');
    el('project-title').focus();
  });
  el('project-cancel').addEventListener('click', () => {
    el('project-form').hidden = true;
    el('add-project').hidden = !state.isOwner;
  });
  el('project-form').addEventListener('submit', addProject);

  el('export-data').addEventListener('click', exportData);
  el('email-form').addEventListener('submit', changeEmail);
  el('delete-account').addEventListener('click', deleteAccount);
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
    // A static host has no API at all; only a developer's machine is missing a
    // running server. Say which, and never hand a visitor a command to run.
    showMissing(
      isLocalHost()
        ? 'The API is not answering on this machine, so player records cannot load. The page and the API are served by the same process, which needs to be running.'
        : 'Player profiles are served by Student Icon\'s API, and this deployment publishes the static site only. Nothing is broken — the record simply is not reachable here. The arcade and the landing page still work.',
      true
    );
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
  await loadProjects();
  render();
}

init();
