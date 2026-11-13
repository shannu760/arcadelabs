/* Student Icon — onboarding (F3)

   Two modes, chosen by what the server reports:

   supabase  Real accounts. Step 00 signs up or signs in through our own
             /api/auth/* routes, which proxy Supabase Auth. The browser stores
             the returned access token and sends it as `Authorization: Bearer`.
             The Supabase anon key never reaches this page.

   dev       No Supabase configured. The player is a UUID in localStorage sent
             as x-dev-user — a development convenience that the server refuses
             for non-loopback callers and in production. The account step stays
             hidden rather than pretending sign-in works.
*/

import {
  loadSession,
  saveSession,
  clearSession,
  ensureFresh,
  captureUrlSession,
  signOutRequest,
} from './session.js';

const API = '/api';
const STORE_KEY = 'si.player.id';
const MAX_TAGS = 12;
const HANDLE_RE = /^[a-z0-9_]{3,20}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MIN_PASSWORD = 8;

const PRESET_INTERESTS = [
  'ai', 'space', 'climate', 'fintech', 'health', 'education',
  'gaming', 'media', 'robotics', 'design', 'finance', 'policy',
];

const state = {
  health: null,
  mode: 'dev',
  authTab: 'signup',
  session: null,
  userId: null,
  profile: null,
  careers: [],
  interests: new Set(),
  careersPicked: new Set(),
  handleTimer: null,
  handleFree: null,
};

const el = (id) => document.getElementById(id);
const qs = (sel, root = document) => root.querySelector(sel);

async function currentSession() {
  if (state.mode !== 'supabase') return null;
  state.session = await ensureFresh(state.session);
  return state.session;
}

async function api(path, { method = 'GET', body, auth = true } = {}) {
  const headers = {};
  if (body !== undefined) headers['content-type'] = 'application/json';

  if (auth) {
    if (state.mode === 'supabase') {
      const session = await currentSession();
      if (session?.accessToken) headers.authorization = `Bearer ${session.accessToken}`;
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

/* ------------------------------------------------------------ feedback */

function setError(node, message) {
  node.textContent = message || '';
  node.hidden = !message;
}

function setNote(message) {
  const node = el('auth-note');
  node.textContent = message || '';
  node.hidden = !message;
}

function setHint(text, tone = '') {
  const node = el('handle-hint');
  node.textContent = text;
  if (tone) node.dataset.tone = tone;
  else delete node.dataset.tone;
}

/* ------------------------------------------------------------- routing */

function go(step) {
  document.querySelectorAll('[data-step]').forEach((panel) => {
    panel.hidden = Number(panel.dataset.step) !== step;
  });

  document.querySelectorAll('[data-stepmark]').forEach((mark) => {
    const index = Number(mark.dataset.stepmark);
    mark.classList.toggle('is-active', index === step);
    mark.classList.toggle('is-done', index < step);
    if (index === step) mark.setAttribute('aria-current', 'step');
    else mark.removeAttribute('aria-current');
  });

  const panel = qs(`[data-step="${step}"]`);
  const focusable = qs('input:not([type="radio"]), select, textarea', panel || document);
  if (focusable && step !== 4) focusable.focus({ preventScroll: true });
  panel?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function lock(message) {
  document.querySelectorAll('[data-step]').forEach((panel) => {
    panel.hidden = true;
  });
  el('locked').hidden = false;
  el('locked-reason').textContent = message;
  document.querySelectorAll('[data-stepmark]').forEach((mark) => {
    mark.classList.remove('is-active', 'is-done');
    mark.removeAttribute('aria-current');
  });
}

/* --------------------------------------------------------------- chips */

function chip(label, pressed, onToggle, title) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'si-chip';
  button.textContent = label;
  button.setAttribute('aria-pressed', String(pressed));
  if (title) button.title = title;
  button.addEventListener('click', onToggle);
  return button;
}

function renderChips() {
  const interests = el('interest-chips');
  interests.replaceChildren();
  const all = [...new Set([...PRESET_INTERESTS, ...state.interests])].sort();
  all.forEach((tag) => {
    interests.append(chip(tag, state.interests.has(tag), () => toggleInterest(tag)));
  });

  const careers = el('career-chips');
  careers.replaceChildren();
  if (!state.careers.length) {
    const empty = document.createElement('p');
    empty.className = 'si-hint';
    empty.textContent = 'Career paths will appear here once the API answers.';
    careers.append(empty);
  }
  state.careers.forEach((career) => {
    careers.append(
      chip(career.title, state.careersPicked.has(career.slug), () => toggleCareer(career.slug), career.description)
    );
  });

  el('interest-count').textContent = String(state.interests.size);
  el('career-count').textContent = String(state.careersPicked.size);
}

function toggleInterest(tag) {
  if (state.interests.has(tag)) {
    state.interests.delete(tag);
  } else {
    if (state.interests.size >= MAX_TAGS) {
      setError(el('step3-error'), `Pick at most ${MAX_TAGS} interests.`);
      return;
    }
    state.interests.add(tag);
  }
  setError(el('step3-error'), '');
  renderChips();
}

function toggleCareer(slug) {
  if (state.careersPicked.has(slug)) state.careersPicked.delete(slug);
  else state.careersPicked.add(slug);
  renderChips();
}

function addCustomInterest() {
  const input = el('custom-interest');
  const value = input.value.trim().toLowerCase().replace(/\s+/g, '-');

  if (!value) return;
  if (value.length > 40) {
    setError(el('step3-error'), 'Keep interest tags to 40 characters.');
    return;
  }
  if (state.interests.size >= MAX_TAGS && !state.interests.has(value)) {
    setError(el('step3-error'), `Pick at most ${MAX_TAGS} interests.`);
    return;
  }

  state.interests.add(value);
  input.value = '';
  setError(el('step3-error'), '');
  renderChips();
}

/* --------------------------------------------------------- handle check */

function checkHandle() {
  const value = el('handle').value.trim().toLowerCase();

  clearTimeout(state.handleTimer);

  if (!HANDLE_RE.test(value)) {
    state.handleFree = null;
    setHint('Use 3–20 characters: a–z, 0–9, underscore.', value ? 'warn' : '');
    return;
  }

  setHint('Checking availability…');

  state.handleTimer = setTimeout(async () => {
    const { status } = await api(`/profiles/${encodeURIComponent(value)}`, { auth: true });
    if (el('handle').value.trim().toLowerCase() !== value) return;

    if (status === 404) {
      state.handleFree = true;
      setHint(`@${value} is available.`, 'ok');
    } else if (status === 200) {
      state.handleFree = false;
      setHint(`@${value} is already taken.`, 'bad');
    } else {
      state.handleFree = null;
      setHint('Could not check that handle — you can still try it.', 'warn');
    }
  }, 300);
}

/* ------------------------------------------------------------- account */

function setAuthTab(tab) {
  state.authTab = tab;

  document.querySelectorAll('[data-authmode]').forEach((button) => {
    const active = button.dataset.authmode === tab;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-selected', String(active));
  });

  el('password').autocomplete = tab === 'signup' ? 'new-password' : 'current-password';
  el('to-identity').textContent = tab === 'signup' ? 'Create account' : 'Sign in';
  el('forgot').hidden = tab !== 'signin';
  el('auth-hint').textContent =
    tab === 'signup'
      ? 'Eight characters or more. Supabase Auth stores the password; this server never sees it.'
      : 'Use the email you signed up with. Your player follows the account.';

  setError(el('auth-error'), '');
}

async function submitAuth() {
  const email = el('email').value.trim().toLowerCase();
  const password = el('password').value;
  const signup = state.authTab === 'signup';

  if (!EMAIL_RE.test(email)) {
    setError(el('auth-error'), 'Enter a valid email address.');
    el('email').focus();
    return;
  }
  if (password.length < MIN_PASSWORD) {
    setError(el('auth-error'), `Passwords need at least ${MIN_PASSWORD} characters.`);
    el('password').focus();
    return;
  }

  const button = el('to-identity');
  button.disabled = true;
  button.textContent = signup ? 'Creating…' : 'Signing in…';
  setError(el('auth-error'), '');
  setNote('');

  const { status, data } = await api(signup ? '/auth/signup' : '/auth/signin', {
    method: 'POST',
    body: { email, password },
    auth: false,
  });

  button.disabled = false;
  setAuthTab(state.authTab);

  if (status >= 200 && status < 300) {
    if (signup && data?.needsConfirmation) {
      setAuthTab('signin');
      setNote(`Confirm your email to finish. We sent a link to ${email}; once it is confirmed, sign in here.`);
      el('password').value = '';
      return;
    }

    if (!data?.session) {
      setError(el('auth-error'), 'Signed up, but no session came back. Try signing in.');
      return;
    }

    saveSession(data.session);
    state.session = data.session;
    state.userId = data.session.user?.id || null;
    el('password').value = '';
    await enterUniverse();
    return;
  }

  if (status === 403) {
    setNote(data?.error?.message || 'Confirm your email address first, then sign in.');
    return;
  }

  setError(el('auth-error'), data?.error?.message || 'Could not sign in. Is the server running?');
}

async function recoverPassword() {
  const email = el('email').value.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) {
    setError(el('auth-error'), 'Enter your email first, then ask for a reset link.');
    el('email').focus();
    return;
  }

  setError(el('auth-error'), '');
  const { status, data } = await api('/auth/recover', { method: 'POST', body: { email }, auth: false });

  if (status === 200) setNote(data?.message || 'If that address has an account, a reset link is on its way.');
  else setError(el('auth-error'), data?.error?.message || 'Could not send the reset email.');
}

/** After a session exists: resume an existing player or start at identity. */
async function enterUniverse() {
  const { status, data } = await api('/me');

  if (status === 200) {
    state.profile = data.profile;
    state.userId = data.profile.id;
    prefillProfile();
    renderChips();
    await showSummary();
    return;
  }

  if (status === 401) {
    clearSession();
    state.session = null;
    state.userId = null;
    setError(el('auth-error'), 'Your session ended. Sign in again.');
    go(0);
    return;
  }

  go(1);
}

/** Signs out of this device, and of the Supabase session behind it. */
async function signOut() {
  const button = el('signout');
  button.disabled = true;
  await signOutRequest();
  state.session = null;
  state.userId = null;
  state.profile = null;
  try {
    localStorage.removeItem(STORE_KEY);
  } catch {
    /* nothing to remove */
  }
  location.reload();
}

/* ------------------------------------------------------------- profile */

function prefillProfile() {
  const profile = state.profile;
  if (!profile) return;

  el('handle').value = profile.handle || '';
  el('displayName').value = profile.displayName || '';
  el('educationStage').value = profile.educationStage || '';
  el('country').value = profile.country || '';
  el('bio').value = profile.bio || '';
  el('bio-count').textContent = String((profile.bio || '').length);

  const radio = qs(`input[name="visibility"][value="${profile.visibility}"]`);
  if (radio) radio.checked = true;

  state.interests = new Set(profile.interests || []);
  state.careersPicked = new Set(profile.careers || []);
  state.handleFree = true;
  setHint(`@${profile.handle} is yours.`, 'ok');
}

/* --------------------------------------------------------------- steps */

async function submitIdentity() {
  const handle = el('handle').value.trim().toLowerCase();
  const displayName = el('displayName').value.trim() || handle;

  if (!HANDLE_RE.test(handle)) {
    setError(el('step1-error'), 'Handle must be 3–20 characters: a–z, 0–9, underscore.');
    el('handle').focus();
    return;
  }
  if (displayName.length > 40) {
    setError(el('step1-error'), 'Display name must be 40 characters or fewer.');
    el('displayName').focus();
    return;
  }
  if (state.handleFree === false) {
    setError(el('step1-error'), 'That handle is already taken. Try another.');
    return;
  }

  if (state.mode === 'supabase') {
    if (!(await currentSession())) {
      setError(el('step1-error'), 'Sign in first — your player is attached to an account.');
      go(0);
      return;
    }
  } else if (!state.userId) {
    state.userId = crypto.randomUUID();
    localStorage.setItem(STORE_KEY, state.userId);
  }

  const button = el('to-profile');
  button.disabled = true;
  button.textContent = 'Creating…';
  setError(el('step1-error'), '');

  const { status, data } = await api('/session/sync', {
    method: 'POST',
    body: { handle, displayName },
  });

  button.disabled = false;
  button.textContent = 'Continue';

  if (status === 200 || status === 201) {
    state.profile = data.profile;
    state.handleFree = true;
    setHint(`@${data.profile.handle} is yours.`, 'ok');
    go(2);
    return;
  }

  if (status === 401) {
    setError(el('step1-error'), 'Your session ended. Sign in again.');
    go(0);
    return;
  }

  if (status === 409) {
    setError(el('step1-error'), data?.error?.message || 'That handle is already taken.');
    return;
  }

  setError(el('step1-error'), data?.error?.message || 'Could not create your player. Is the server running?');
}

async function submitProfile() {
  const visibility = qs('input[name="visibility"]:checked')?.value || 'public';
  const body = {
    educationStage: el('educationStage').value || null,
    country: el('country').value || null,
    bio: el('bio').value.trim(),
    visibility,
  };

  const button = el('to-focus');
  button.disabled = true;
  button.textContent = 'Saving…';
  setError(el('step2-error'), '');

  const { status, data } = await api('/me', { method: 'PATCH', body });

  button.disabled = false;
  button.textContent = 'Continue';

  if (status !== 200) {
    setError(el('step2-error'), data?.error?.message || 'Could not save your profile.');
    return;
  }

  state.profile = data.profile;
  go(3);
}

async function submitFocus() {
  const button = el('finish');
  button.disabled = true;
  button.textContent = 'Saving…';
  setError(el('step3-error'), '');

  const { status, data } = await api('/me/interests', {
    method: 'PUT',
    body: { interests: [...state.interests], careers: [...state.careersPicked] },
  });

  button.disabled = false;
  button.textContent = 'Finish setup';

  if (status !== 200) {
    setError(el('step3-error'), data?.error?.message || 'Could not save your focus.');
    return;
  }

  state.profile = data.profile;
  await showSummary();
}

async function showSummary() {
  const profile = state.profile;
  if (!profile) return;

  el('sum-handle').textContent = '@' + profile.handle;
  el('sum-xp').textContent = String(profile.xp ?? 0);
  el('sum-visibility').textContent = profile.visibility === 'public' ? 'PUBLIC' : 'UNLISTED';

  const accountRow = el('sum-account-row');
  if (state.mode === 'supabase') {
    const email = state.session?.user?.email;
    el('sum-email').textContent = email || 'signed in';
    accountRow.hidden = false;
  } else {
    accountRow.hidden = true;
  }

  const viewProfile = el('view-profile');
  if (viewProfile) viewProfile.href = `/${profile.handle}`;

  const { data } = await api('/ranks', { auth: false });
  const rank = data?.ranks?.find((entry) => entry.rank_index === profile.rankIndex);
  el('sum-rank').textContent = rank ? rank.title : 'Dreamer';

  const focus = (profile.interests || []).slice(0, 4).join(' · ');
  const careerCount = (profile.careers || []).length;
  el('sum-focus').textContent = focus
    ? `Focus: ${focus}${careerCount ? ` — ${careerCount} career path${careerCount > 1 ? 's' : ''} selected` : ''}.`
    : 'No focus picked yet. You can add interests later without losing anything.';

  go(4);
}

/* ---------------------------------------------------------------- boot */

function bindEvents() {
  el('handle').addEventListener('input', (event) => {
    event.target.value = event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '');
    checkHandle();
  });
  el('handle').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      submitIdentity();
    }
  });
  el('to-profile').addEventListener('click', submitIdentity);
  el('to-focus').addEventListener('click', submitProfile);
  el('finish').addEventListener('click', submitFocus);
  el('signout').addEventListener('click', signOut);

  el('to-identity').addEventListener('click', submitAuth);
  el('forgot').addEventListener('click', recoverPassword);

  document.querySelectorAll('[data-authmode]').forEach((button) => {
    button.addEventListener('click', () => {
      setNote('');
      setAuthTab(button.dataset.authmode);
    });
  });

  ['email', 'password'].forEach((id) => {
    el(id).addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        submitAuth();
      }
    });
  });

  el('bio').addEventListener('input', (event) => {
    el('bio-count').textContent = String(event.target.value.length);
  });

  el('add-interest').addEventListener('click', addCustomInterest);
  el('custom-interest').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      addCustomInterest();
    }
  });

  document.querySelectorAll('[data-back]').forEach((button) => {
    button.addEventListener('click', () => go(Number(button.dataset.back)));
  });
}

async function loadCareers() {
  const { status, data } = await api('/careers', { auth: false });
  state.careers = status === 200 && Array.isArray(data?.careers) ? data.careers : [];
}

async function init() {
  bindEvents();

  try {
    const { status, data } = await api('/health', { auth: false });
    state.health = status === 200 ? data : null;
  } catch {
    state.health = null;
  }

  if (!state.health?.ok) {
    lock('The API is not answering. Start the server with "npm run dev" and reload this page.');
    return;
  }

  if (state.health.auth === 'supabase') {
    state.mode = 'supabase';
    el('stepmark-account').hidden = false;
    el('signout').hidden = false;
    el('mode-note').textContent =
      'Accounts are live. Your player is attached to this email and follows you to any device.';

    const arrival = captureUrlSession();
    if (arrival?.error) setError(el('auth-error'), arrival.error);
    if (arrival?.notice) setNote(arrival.notice);

    await loadCareers();
    renderChips();

    state.session = loadSession();
    if (state.session) {
      const fresh = await ensureFresh(state.session);
      if (fresh) {
        state.session = fresh;
        state.userId = fresh.user?.id || null;
        await enterUniverse();
        return;
      }
      state.session = null;
    }

    setAuthTab('signup');
    go(0);
    return;
  }

  el('mode-note').textContent =
    'Development build: this player is stored on this device only. Real accounts arrive with the Supabase project.';
  el('stepmark-account').hidden = true;

  await loadCareers();

  state.userId = localStorage.getItem(STORE_KEY);
  if (state.userId) {
    const { status, data } = await api('/me');
    if (status === 200) {
      state.profile = data.profile;
      prefillProfile();
      renderChips();
      await showSummary();
      return;
    }
    if (status === 401) {
      localStorage.removeItem(STORE_KEY);
      state.userId = null;
    }
  }

  renderChips();
  go(1);
}

init();
