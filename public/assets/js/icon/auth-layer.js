/* Student Icon — sign-in layer.

   Adds a "Sign in" control to the topbar and a modal that talks to the same
   /api/auth/* routes the onboarding page uses. The password goes straight to
   the API; this page keeps only the returned token (see session.js).

   The layer asks /api/auth/config before showing a form. Accounts are their
   own service, so they stay usable when the database behind the rest of the
   site is not connected yet. A static deployment with no API gets a plain
   explanation, and a local dev build (auth mode "dev") points at the account
   page instead of pretending a password will work. */

import { loadSession, saveSession } from './session.js';
import { isLocalHost } from './api-status.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MIN_PASSWORD = 8;

const state = { mode: null, busy: false, lastFocus: null };

const el = (id) => document.getElementById(id);

/* ------------------------------------------------------------- trigger */

function updateTrigger() {
  const button = el('si-auth-open');
  if (button) button.textContent = loadSession() ? 'SIGNED IN' : 'SIGN IN';
}

function mountTrigger() {
  const host =
    document.querySelector('.topbar .topnav') || document.querySelector('.topbar .topbar-inner');
  if (!host || el('si-auth-open')) return;

  const button = document.createElement('button');
  button.type = 'button';
  button.id = 'si-auth-open';
  button.className = 'si-authbtn';
  button.textContent = loadSession() ? 'SIGNED IN' : 'SIGN IN';
  button.addEventListener('click', () => openLayer());
  host.append(button);
}

/* ---------------------------------------------------------------- layer */

function mountLayer() {
  if (el('si-auth-layer')) return;

  const layer = document.createElement('div');
  layer.className = 'si-layer';
  layer.id = 'si-auth-layer';
  layer.hidden = true;
  layer.innerHTML = `
    <div class="si-layer-panel" role="dialog" aria-modal="true" aria-labelledby="si-auth-title">
      <button class="si-layer-close" id="si-auth-close" type="button" aria-label="Close">&times;</button>
      <span class="eyebrow">PLAYER ACCOUNT</span>
      <h2 class="si-layer-title" id="si-auth-title">Sign in</h2>
      <p class="si-layer-lede" id="si-auth-lede">Your player follows the account, on any device.</p>

      <form id="si-auth-form" novalidate hidden>
        <div class="si-field">
          <label for="si-auth-email">Email</label>
          <input id="si-auth-email" name="email" type="email" autocomplete="email" maxlength="254" spellcheck="false" placeholder="you@example.com" required>
        </div>
        <div class="si-field">
          <label for="si-auth-password">Password</label>
          <input id="si-auth-password" name="password" type="password" autocomplete="current-password" minlength="8" placeholder="At least 8 characters" required>
        </div>
        <button class="btn" type="submit" id="si-auth-submit">Sign in</button>
      </form>

      <p class="si-layer-note" id="si-auth-note" hidden></p>
      <p class="si-layer-error" id="si-auth-error" role="alert" hidden></p>

      <p class="si-layer-foot" id="si-auth-foot">
        New here? <a href="./onboarding.html">Create your player</a>
      </p>
    </div>`;

  document.body.append(layer);

  el('si-auth-close').addEventListener('click', closeLayer);
  el('si-auth-form').addEventListener('submit', submit);
  layer.addEventListener('mousedown', (event) => {
    if (event.target === layer) closeLayer();
  });
  document.addEventListener('keydown', (event) => {
    if (layer.hidden) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      closeLayer();
    } else if (event.key === 'Tab') {
      trapFocus(event);
    }
  });
}

function trapFocus(event) {
  const panel = el('si-auth-layer').querySelector('.si-layer-panel');
  const focusable = [...panel.querySelectorAll('button, input, a[href]')].filter(
    (node) => !node.disabled && node.offsetParent !== null
  );
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function setError(message) {
  const node = el('si-auth-error');
  node.textContent = message;
  node.hidden = !message;
}

function setNote(message) {
  const node = el('si-auth-note');
  node.textContent = message;
  node.hidden = !message;
}

function reset() {
  state.mode = null;
  state.busy = false;
  el('si-auth-form').hidden = true;
  el('si-auth-password').value = '';
  el('si-auth-submit').disabled = false;
  el('si-auth-submit').textContent = 'Sign in';
  el('si-auth-title').textContent = 'Sign in';
  el('si-auth-lede').textContent = 'Your player follows the account, on any device.';
  el('si-auth-foot').hidden = false;
  el('si-auth-foot').innerHTML = 'New here? <a href="./onboarding.html">Create your player</a>';
  setError('');
  setNote('');
}

function showForm() {
  el('si-auth-form').hidden = false;
  el('si-auth-submit').disabled = true;
  el('si-auth-submit').textContent = 'Checking…';
}

function enableForm() {
  el('si-auth-submit').disabled = false;
  el('si-auth-submit').textContent = 'Sign in';
}

function lock(title, message, action) {
  el('si-auth-form').hidden = true;
  el('si-auth-title').textContent = title;
  el('si-auth-lede').textContent = message;
  el('si-auth-foot').hidden = !action;
  if (action) el('si-auth-foot').innerHTML = action;
}

function showSignedIn() {
  const session = loadSession();
  const label = session?.user?.email || 'this device';
  el('si-auth-form').hidden = true;
  el('si-auth-title').textContent = 'Signed in';
  el('si-auth-lede').textContent = `You are signed in as ${label}.`;
  el('si-auth-foot').hidden = false;
  el('si-auth-foot').innerHTML =
    '<a href="./onboarding.html">Open your account</a> &middot; <button type="button" class="si-linkbtn" id="si-auth-out">Sign out</button>';
  el('si-auth-out').addEventListener('click', signOut);
}

async function signOut() {
  const { signOutRequest } = await import('./session.js');
  await signOutRequest();
  updateTrigger();
  closeLayer();
}

function openLayer() {
  state.lastFocus = document.activeElement;
  const layer = el('si-auth-layer');
  layer.hidden = false;
  document.body.classList.add('si-layer-open');
  reset();

  if (loadSession()) {
    showSignedIn();
    el('si-auth-close').focus();
    return;
  }

  showForm();
  el('si-auth-close').focus();
  probe();
}

function closeLayer() {
  const layer = el('si-auth-layer');
  if (!layer || layer.hidden) return;
  layer.hidden = true;
  document.body.classList.remove('si-layer-open');
  if (state.lastFocus && typeof state.lastFocus.focus === 'function') state.lastFocus.focus();
}

async function probe() {
  let res = null;
  try {
    res = await fetch('/api/auth/config', { headers: { accept: 'application/json' } });
  } catch {
    res = null;
  }

  const config = res?.ok ? await res.json().catch(() => null) : null;

  if (config?.mode === 'supabase') {
    /* Configured is not the same as working: a paused or deleted Supabase
       project answers the config route but nothing else, and the old layer
       offered a form that could only fail. */
    if (config.reachable === false) {
      state.mode = 'offline';
      const host = config.authHost ? ` (${config.authHost})` : '';
      lock(
        'Accounts are offline',
        `The sign-in service${host} is not answering right now, so no password can be checked. Nothing is wrong with your browser and no account is affected. The pages, the skill tree and the arcade still work.`,
        'Continue to <a href="./onboarding.html">the account page</a>'
      );
      return;
    }

    state.mode = 'supabase';
    enableForm();
    el('si-auth-email').focus();
    return;
  }

  if (config) {
    state.mode = 'dev';
    lock(
      'Local build',
      'This build keeps players on the machine it runs on, so there is no password to sign in with. Create or reopen your player on the account page.',
      'Continue to <a href="./onboarding.html">your account</a>'
    );
    return;
  }

  state.mode = 'offline';

  lock(
    'Accounts are offline',
    isLocalHost()
      ? 'The API is not answering on this machine, so sign-in is unavailable. Start the dev server and try again.'
      : 'Accounts are not connected on this deployment yet, so sign-in is unavailable here. The arcade and the pages still work.',
    'Continue to <a href="./onboarding.html">the account page</a>'
  );
}

/* --------------------------------------------------------------- submit */

async function submit(event) {
  event.preventDefault();
  if (state.busy || state.mode !== 'supabase') return;

  const email = el('si-auth-email').value.trim().toLowerCase();
  const password = el('si-auth-password').value;

  if (!EMAIL_RE.test(email)) {
    setError('Enter a valid email address.');
    el('si-auth-email').focus();
    return;
  }
  if (password.length < MIN_PASSWORD) {
    setError(`Passwords need at least ${MIN_PASSWORD} characters.`);
    el('si-auth-password').focus();
    return;
  }

  const button = el('si-auth-submit');
  state.busy = true;
  button.disabled = true;
  button.textContent = 'Signing in…';
  setError('');
  setNote('');

  let res = null;
  try {
    res = await fetch('/api/auth/signin', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
  } catch {
    res = null;
  }

  state.busy = false;
  button.disabled = false;
  button.textContent = 'Sign in';

  if (!res) {
    setError(
      isLocalHost()
        ? 'The API is not answering on this machine. Start the dev server and try again.'
        : 'Accounts are not reachable from this deployment yet.'
    );
    return;
  }

  const data = await res.json().catch(() => null);

  if (res.ok && data?.session) {
    saveSession(data.session);
    updateTrigger();
    el('si-auth-password').value = '';
    showSignedIn();
    return;
  }

  if (res.status === 403) {
    setNote(data?.error?.message || 'Confirm your email address first, then sign in.');
    return;
  }

  setError(data?.error?.message || `Could not sign in (HTTP ${res.status}).`);
}

mountTrigger();
mountLayer();
