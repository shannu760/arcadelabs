/* Turbo Dash — a pixel highway racer for 1–2 players on one keyboard. */

const $ = (id) => document.getElementById(id);

const cv = $('game');
const ctx = cv.getContext('2d', { alpha: false });
const ovl = $('ovl');
const hudEl = $('hud');
const pp1 = $('pp1');
const pp2 = $('pp2');
const p1Dist = $('p1Dist');
const p1Bar = $('p1Bar');
const p1Boost = $('p1Boost');
const p1Hint = $('p1Hint');
const p2Dist = $('p2Dist');
const p2Bar = $('p2Bar');
const p2Boost = $('p2Boost');
const soundBtn = $('soundBtn');
const pauseBtn = $('pauseBtn');

/* ---------------- world constants ---------------- */

const W = 480;
const H = 640;
const ROAD_L = 46;
const ROAD_R = 434;
const ROAD_W = ROAD_R - ROAD_L;
const LANES = 4;
const LANE_W = ROAD_W / LANES;
const PLAYER_Y = H - 132;
const TARGET = 1600;
const SOLO_TIME = 60;
const MUTE_KEY = 'ppa:muted';
const BEST_KEY = 'ppa:race:best';

/* ---------------- canvas sizing ---------------- */

function fit() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = Math.round(W * dpr);
  cv.height = Math.round(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;
}
fit();
window.addEventListener('resize', fit);

/* ---------------- state ---------------- */

const G = {
  mode: 'solo',
  state: 'menu', // menu | count | run | paused | over
  players: [],
  traffic: [],
  pads: [],
  scroll: 0,
  elapsed: 0,
  countdown: 0,
  lastCount: -1,
  spawnIn: 0,
  padIn: 0,
  shake: 0,
  tick: 0,
  solo: null,
  muted: localStorage.getItem(MUTE_KEY) === '1',
  lives: [3, 3], // Player 1 and Player 2 lives (versus mode)
};

const keys = new Set();
const touch = { left: false, right: false, boost: false };

const CAR_COLORS = [
  ['#38f2ff', '#0f6b7d'],
  ['#ff8a3d', '#8c4410'],
  ['#a06bff', '#4d2b96'],
  ['#eae7ff', '#79719d'],
  ['#3ddc6b', '#1a7a3a'],
  ['#ffcf3d', '#a8760c'],
];

/* ---------------- sound ---------------- */

let audioCtx = null;

function tone(freq, dur = 0.09, type = 'square', vol = 0.05, delay = 0) {
  if (G.muted) return;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    audioCtx = audioCtx || new AC();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const t0 = audioCtx.currentTime + delay;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  } catch { /* audio is optional */ }
}

function applySound() {
  soundBtn.textContent = G.muted ? 'SFX OFF' : 'SFX ON';
  soundBtn.setAttribute('aria-pressed', String(!G.muted));
}

/* ---------------- setup ---------------- */

function makePlayer(i, x) {
  return {
    i,
    x,
    y: PLAYER_Y,
    w: 52,
    h: 92,
    vx: 0,
    speed: 0,
    boost: 100,
    boosting: false,
    dist: 0,
    spin: 0,
    invuln: 0,
    finished: false,
    color: i === 0 ? '#c8ff3d' : '#ff3f8e',
    shade: i === 0 ? '#789c00' : '#a0185a',
  };
}

function start(mode) {
  G.mode = mode;
  G.state = 'count';
  G.players = mode === 'solo'
    ? [makePlayer(0, W / 2)]
    : [makePlayer(0, ROAD_L + LANE_W * 1.5), makePlayer(1, ROAD_L + LANE_W * 3.5)];
  G.traffic = [];
  G.pads = [];
  G.elapsed = 0;
  G.shake = 0;
  G.spawnIn = 0.9;
  G.padIn = 3.2;
  G.countdown = 3;
  G.lastCount = -1;
  G.solo = { timeLeft: SOLO_TIME };
  touch.left = touch.right = touch.boost = false;

  pp2.hidden = mode === 'solo';
  hudEl.classList.toggle('one', mode === 'solo');

  ovl.hidden = false;
  ovl.innerHTML = `
    <div class="overlay-card">
      <h2>Get ready</h2>
      <div class="big-num" id="ovlBig">3</div>
      <p class="muted">${mode === 'solo' ? '60 seconds. Grab nitro, dodge everything.' : 'First to 1600 m wins.'}</p>
    </div>`;
  updateHUD();
}

function showMenu() {
  G.state = 'menu';
  G.players = [];
  ovl.hidden = false;
  ovl.innerHTML = `
    <div class="overlay-card">
      <h2>Turbo Dash</h2>
      <p>Weave through traffic on a night highway. Nitro pods refill your boost.</p>
      <div class="overlay-actions">
        <button class="btn sm" type="button" data-action="solo">1P · 60s</button>
        <button class="btn pink sm" type="button" data-action="versus">2P Race</button>
      </div>
      <p class="muted" style="font-size:16px;line-height:1.6">
        P1 · <b>A</b> / <b>D</b> steer, <b>W</b> boost<br>
        P2 · <b>←</b> / <b>→</b> steer, <b>↑</b> boost
      </p>
    </div>`;
}

function showResults() {
  let title = '';
  let body = '';

  if (G.mode === 'solo') {
    const dist = Math.floor(G.players[0].dist);
    const previous = Number(localStorage.getItem(BEST_KEY) || 0);
    const best = Math.max(dist, previous);
    try {
      localStorage.setItem(BEST_KEY, String(best));
    } catch { /* ignore storage limits */ }
    title = 'Time up';
    body = `<p style="margin:0">You covered <b style="color:var(--neon)">${dist} m</b></p>
            <p style="margin:0" class="muted">Personal best: ${Math.floor(best)} m</p>`;
  } else {
    // versus with lives
    const [a, b] = G.players;
    const p1Finished = a.finished;
    const p2Finished = b.finished;
    let title = '';
    let body = '';
    if (p1Finished && p2Finished) {
      // Both finished (one reached target first); compare distances
      const winner = a.dist >= b.dist ? a : b;
      title = `Player ${winner.i + 1} wins`;
      body = `<p style="margin:0"><b style="color:var(--neon)">P1 ${Math.floor(a.dist)} m</b> &nbsp;·&nbsp; <b style="color:var(--pink)">P2 ${Math.floor(b.dist)} m</b></p>
                <p style="margin:0" class="muted">Lives: P1 ${G.lives[0]} / P2 ${G.lives[1]}</p>`;
    } else if (p1Finished) {
      title = 'Player 1 wins';
      body = `<p style="margin:0"><b style="color:var(--neon)">P1 ${Math.floor(a.dist)} m</b></p>
                <p style="margin:0" class="muted">Lives: P1 ${G.lives[0]} / P2 ${G.lives[1]}</p>`;
    } else if (p2Finished) {
      title = 'Player 2 wins';
      body = `<p style="margin:0"><b style="color:var(--pink)">P2 ${Math.floor(b.dist)} m</b></p>
                <p style="margin:0" class="muted">Lives: P1 ${G.lives[0]} / P2 ${G.lives[1]}</p>`;
    } else {
      // Neither finished - compare distances, leader wins
      const leader = a.dist >= b.dist ? a : b;
      title = `Player ${leader.i + 1} leads`;
      body = `<p style="margin:0"><b style="color:var(--neon)">P1 ${Math.floor(a.dist)} m</b> &nbsp;·&nbsp; <b style="color:var(--pink)">P2 ${Math.floor(b.dist)} m</b></p>
                <p style="margin:0" class="muted">Lives: P1 ${G.lives[0]} / P2 ${G.lives[1]}</p>`;
    }
  }

  ovl.innerHTML = `
    <div class="overlay-card">
      <h2>${title}</h2>
      ${body}
      <div class="overlay-actions">
        <button class="btn sm" type="button" data-action="restart">Race again</button>
        <button class="btn ghost sm" type="button" data-action="menu">Menu</button>
      </div>
      <p class="muted" style="font-size:16px">R to restart · ESC for menu</p>
    </div>`;
  ovl.hidden = false;
}

/* ---------------- spawning ---------------- */

function spawnTraffic(baseScroll) {
  const free = [0, 1, 2, 3];
  const two = Math.random() < Math.min(0.5, 0.12 + G.elapsed * 0.012);
  const count = two ? 2 : 1;

  for (let i = 0; i < count; i++) {
    const lane = free.splice(Math.floor(Math.random() * free.length), 1)[0];
    const colors = CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)];
    G.traffic.push({
      x: ROAD_L + LANE_W * lane + LANE_W / 2,
      y: -120 - Math.random() * 70,
      w: 50,
      h: 86,
      sp: baseScroll * (0.4 + Math.random() * 0.34),
      body: colors[0],
      shade: colors[1],
    });
  }
}

function spawnPad() {
  const lane = Math.floor(Math.random() * LANES);
  G.pads.push({
    x: ROAD_L + LANE_W * lane + LANE_W / 2,
    y: -70,
    w: 46,
    h: 58,
  });
}

/* ---------------- input ---------------- */

function inputFor(i) {
  if (G.mode === 'solo') {
    return {
      left: keys.has('ArrowLeft') || keys.has('KeyA') || touch.left,
      right: keys.has('ArrowRight') || keys.has('KeyD') || touch.right,
      boost: keys.has('ArrowUp') || keys.has('KeyW') || keys.has('Space') || keys.has('ShiftLeft') || touch.boost,
    };
  }
  if (i === 0) {
    return { left: keys.has('KeyA'), right: keys.has('KeyD'), boost: keys.has('KeyW') };
  }
  return { left: keys.has('ArrowLeft'), right: keys.has('ArrowRight'), boost: keys.has('ArrowUp') };
}

function crash(p) {
  p.spin = 0.7;
  p.invuln = 1.5;
  p.vx = 0;
  p.boost = Math.max(0, p.boost - 25);
  G.shake = 13;
  tone(120, 0.22, 'sawtooth', 0.07);
  tone(80, 0.26, 'square', 0.05, 0.05);
}

function togglePause() {
  if (G.state === 'run') {
    G.state = 'paused';
    ovl.hidden = false;
    ovl.innerHTML = `
      <div class="overlay-card">
        <h2>Paused</h2>
        <p class="muted">The traffic waits. Barely.</p>
        <div class="overlay-actions">
          <button class="btn sm" type="button" data-action="resume">Resume</button>
          <button class="btn ghost sm" type="button" data-action="restart">Restart</button>
          <button class="btn ghost sm" type="button" data-action="menu">Menu</button>
        </div>
      </div>`;
  } else if (G.state === 'paused') {
    G.state = 'run';
    ovl.hidden = true;
  }
}

/* ---------------- update ---------------- */

function update(dt) {
  if (G.state === 'count') {
    G.countdown -= dt;
    G.scroll += 70 * dt;
    const n = Math.ceil(G.countdown);
    if (n !== G.lastCount) {
      G.lastCount = n;
      const big = $('ovlBig');
      if (n > 0) {
        if (big) big.textContent = String(n);
        tone(430, 0.09, 'square', 0.05);
      } else {
        if (big) big.textContent = 'GO!';
        tone(880, 0.18, 'square', 0.06);
      }
    }
    if (G.countdown <= -0.45) {
      G.state = 'run';
      ovl.hidden = true;
    }
    return;
  }

  if (G.state !== 'run') return;

  G.elapsed += dt;
  if (G.mode === 'solo' && G.solo) {
    G.solo.timeLeft = Math.max(0, G.solo.timeLeft - dt);
    if (G.solo.timeLeft === 0) {
      G.state = 'over';
      G.players[0].speed = 0;
      showResults();
      tone(660, 0.12, 'square', 0.05);
      tone(520, 0.18, 'square', 0.05, 0.14);
      return;
    }
  }

  const baseScroll = 260 + Math.min(G.elapsed * 7, 250);
  G.scroll += baseScroll * dt;

  G.spawnIn -= dt;
  if (G.spawnIn <= 0) {
    spawnTraffic(baseScroll);
    G.spawnIn = Math.max(0.38, 1.15 - G.elapsed * 0.011) * (0.75 + Math.random() * 0.55);
  }

  G.padIn -= dt;
  if (G.padIn <= 0) {
    spawnPad();
    G.padIn = 3.6 + Math.random() * 2.8;
  }

  for (const t of G.traffic) t.y += (baseScroll - t.sp) * dt;
  G.traffic = G.traffic.filter((t) => t.y < H + 140);

  for (const pad of G.pads) pad.y += baseScroll * 0.92 * dt;
  G.pads = G.pads.filter((pad) => pad.y < H + 100);

  for (const p of G.players) {
    if (p.finished) continue;

    const inp = inputFor(p.i);
    const dir = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
    p.vx += dir * 1600 * dt;
    if (dir === 0) p.vx *= Math.pow(0.02, dt);
    p.vx = Math.max(-345, Math.min(345, p.vx));
    p.x += p.vx * dt;

    const minX = ROAD_L + p.w / 2 + 1;
    const maxX = ROAD_R - p.w / 2 - 1;
    if (p.x < minX) { p.x = minX; p.vx = 0; }
    if (p.x > maxX) { p.x = maxX; p.vx = 0; }

    p.boosting = inp.boost && p.boost > 1 && p.spin <= 0;
    if (p.boosting) p.boost = Math.max(0, p.boost - 52 * dt);
    else p.boost = Math.min(100, p.boost + 13 * dt);

    const targetSpeed = baseScroll * (p.boosting ? 1.7 : 1) * (p.spin > 0 ? 0.3 : 1);
    p.speed += (targetSpeed - p.speed) * Math.min(1, dt * 6);
    p.dist += (p.speed / 9) * dt;

    if (p.spin > 0) p.spin -= dt;
    if (p.invuln > 0) p.invuln -= dt;

    if (p.invuln <= 0 && p.spin <= 0) {
      for (let k = G.traffic.length - 1; k >= 0; k--) {
        const t = G.traffic[k];
        if (Math.abs(p.x - t.x) < (p.w + t.w) / 2 - 6 && Math.abs(p.y - t.y) < (p.h + t.h) / 2 - 12) {
          G.traffic.splice(k, 1);
          crash(p);
          // Deduct a life after crash
          G.lives[p.i]--;
          updateHUD();
          // Check if player ran out of lives
          if (G.lives[p.i] <= 0) {
            // Other player wins
            const winner = p.i === 0 ? 1 : 0;
            G.players[winner].finished = true;
            G.state = 'over';
            showResults();
            tone(880, 0.12, 'square', 0.06);
            tone(1180, 0.2, 'square', 0.06, 0.12);
            break;
          }
          break;
        }
      }
    }

    for (let k = G.pads.length - 1; k >= 0; k--) {
      const pad = G.pads[k];
      if (Math.abs(p.x - pad.x) < (p.w + pad.w) / 2 && Math.abs(p.y - pad.y) < (p.h + pad.h) / 2) {
        G.pads.splice(k, 1);
        p.boost = Math.min(100, p.boost + 55);
        tone(1040, 0.08, 'square', 0.045);
        tone(1320, 0.1, 'square', 0.04, 0.07);
      }
    }

    if (G.mode === 'versus' && p.dist >= TARGET) {
      p.dist = TARGET;
      p.finished = true;
      G.state = 'over';
      showResults();
      tone(880, 0.12, 'square', 0.06);
      tone(1180, 0.2, 'square', 0.06, 0.12);
      break;
    }
  }

  updateHUD();
}

function updateHUD() {
  if (!G.players.length) return;
  const solo = G.mode === 'solo';
  const [p1, p2] = G.players;

  p1Dist.textContent = `${Math.floor(p1.dist)} m`;
  p1Boost.textContent = `${Math.round(p1.boost)}%`;
  p1Bar.style.width = `${solo
    ? ((G.solo ? G.solo.timeLeft : 0) / SOLO_TIME) * 100
    : Math.min(100, (p1.dist / TARGET) * 100)}%`;
  p1Hint.textContent = solo ? `${Math.ceil(G.solo ? G.solo.timeLeft : 0)}s left` : 'A / D · W';
  // Lives display
  p1Boost.setAttribute('title', `Lives: ${G.lives[0]}`);

  if (p2) {
    p2Dist.textContent = `${Math.floor(p2.dist)} m`;
    p2Boost.textContent = `${Math.round(p2.boost)}%`;
    p2Bar.style.width = `${Math.min(100, (p2.dist / TARGET) * 100)}%`;
    p2Boost.setAttribute('title', `Lives: ${G.lives[1]}`);
  }
}

/* ---------------- drawing ---------------- */

function px(x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

function drawCar(x, y, w, h, body, shade, flame) {
  const L = Math.round(x - w / 2);
  const T = Math.round(y - h / 2);

  px(L + 4, T + h - 8, w - 8, 10, 'rgba(0,0,0,0.45)');

  px(L - 2, T + 14, 8, 22, '#0a0a16');
  px(L + w - 6, T + 14, 8, 22, '#0a0a16');
  px(L - 2, T + h - 40, 8, 22, '#0a0a16');
  px(L + w - 6, T + h - 40, 8, 22, '#0a0a16');

  px(L + 4, T + 4, w - 8, h - 8, body);
  px(L + 4, T + 4, w - 8, 5, 'rgba(255,255,255,0.34)');
  px(L + 4, T + h - 12, w - 8, 6, 'rgba(0,0,0,0.32)');

  px(L + 9, T + 18, w - 18, 10, '#38f2ff');
  px(L + 10, T + 30, w - 20, h - 62, '#0e1130');
  px(L + 9, T + h - 30, w - 18, 8, '#1b2470');

  px(x - 3, T + 8, 6, h - 16, shade);

  px(L + 8, T + 2, 10, 5, '#ffe98a');
  px(L + w - 18, T + 2, 10, 5, '#ffe98a');
  px(L + 8, T + h - 7, 10, 5, '#ff4d6a');
  px(L + w - 18, T + h - 7, 10, 5, '#ff4d6a');

  if (flame) {
    px(x - 9, T - 16, 18, 12, '#ffcf3d');
    px(x - 5, T - 24, 10, 12, '#ff3f8e');
    px(x - 2, T - 30, 4, 10, '#fff46b');
  }
}

function drawPad(x, y, w, h, tick) {
  const pulse = Math.sin(tick / 9) * 2;
  px(x - w / 2, y - h / 2 + pulse, w, h, 'rgba(255,207,61,0.16)');
  const half = w / 2;
  px(x - half + 4, y - 10, half - 4, 10, '#ffcf3d');
  px(x, y - 2, half - 4, 10, '#ffcf3d');
  px(x - half + 4, y + 10, half - 4, 10, '#ffcf3d');
  px(x + 4, y + 18, half - 4, 10, '#dba72a');
}

function draw() {
  // grass + scenery
  px(-20, -20, W + 40, H + 40, '#0b2a20');
  const stripe = 84;
  const sOff = G.scroll % stripe;
  for (let y = -stripe + sOff; y < H + stripe; y += stripe) {
    px(-20, y, ROAD_L + 20, stripe / 2, '#0f3327');
    px(ROAD_R, y, W - ROAD_R + 20, stripe / 2, '#0f3327');
  }

  // roadside pixels (poles / bushes)
  const prop = 160;
  const pOff = (G.scroll * 1.1) % prop;
  for (let y = -prop + pOff; y < H + prop; y += prop) {
    px(16, y, 6, 26, '#1c4a35');
    px(18, y - 10, 16, 12, '#2f7d55');
    px(W - 22, y + 58, 6, 26, '#1c4a35');
    px(W - 34, y + 48, 16, 12, '#2f7d55');
  }

  // road
  px(ROAD_L, -20, ROAD_W, H + 40, '#221e48');
  const bandOff = (G.scroll * 0.55) % 110;
  for (let y = -110 + bandOff; y < H + 110; y += 110) {
    px(ROAD_L, y, ROAD_W, 55, '#1c1941');
  }

  // lane dashes
  const period = 88;
  const dashOff = G.scroll % period;
  for (let l = 1; l < LANES; l++) {
    const x = ROAD_L + l * LANE_W - 3;
    for (let y = -period + dashOff; y < H + period; y += period) {
      px(x, y, 6, 46, 'rgba(180,170,255,0.5)');
    }
  }

  // curbs
  const curb = 40;
  const cOff = G.scroll % (curb * 2);
  for (let y = -curb * 2 + cOff; y < H + curb * 2; y += curb * 2) {
    px(ROAD_L - 10, y, 10, curb, '#eae7ff');
    px(ROAD_L - 10, y + curb, 10, curb, '#ff3f8e');
    px(ROAD_R, y, 10, curb, '#eae7ff');
    px(ROAD_R, y + curb, 10, curb, '#38f2ff');
  }

  // finish line
  if (G.mode === 'versus' && G.players.length) {
    const lead = Math.max(...G.players.map((p) => p.dist));
    const remaining = Math.max(0, TARGET - lead);
    if (remaining < 280) {
      const size = 20;
      const y = PLAYER_Y - remaining * 2.1;
      for (let ry = 0; ry < 2; ry++) {
        for (let cx = 0; cx < Math.ceil(ROAD_W / size); cx++) {
          px(ROAD_L + cx * size, y + ry * size, size, size, (cx + ry) % 2 ? '#eae7ff' : '#14102e');
        }
      }
    }
  }

  for (const pad of G.pads) drawPad(pad.x, pad.y, pad.w, pad.h, G.tick);

  for (const t of G.traffic) drawCar(t.x, t.y, t.w, t.h, t.body, t.shade, false);

  for (const p of G.players) {
    if (p.invuln > 0 && Math.floor(G.tick / 4) % 2 === 0) continue;
    drawCar(p.x, p.y, p.w, p.h, p.color, p.shade, p.boosting);
  }

  // speed streaks
  if (G.players.some((p) => p.boosting)) {
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    for (let i = 0; i < 9; i++) {
      const y = (G.tick * 26 + i * 91) % H;
      const x = ROAD_L + ((i * 137) % ROAD_W);
      ctx.fillRect(x, y, 2, 34);
    }
  }

  // vignette
  const grad = ctx.createLinearGradient(0, 0, 0, 150);
  grad.addColorStop(0, 'rgba(4,3,15,0.65)');
  grad.addColorStop(1, 'rgba(4,3,15,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, 150);
}

/* ---------------- loop ---------------- */

let last = 0;

function loop(ts) {
  requestAnimationFrame(loop);
  if (!last) last = ts;
  const dt = Math.min((ts - last) / 1000, 0.05);
  last = ts;
  G.tick++;

  if (G.state === 'run' || G.state === 'count') {
    update(dt);
  } else if (G.state === 'menu' || G.state === 'over') {
    G.scroll += 80 * dt;
    if (G.state === 'over') {
      for (const p of G.players) p.speed *= Math.pow(0.2, dt);
      for (const p of G.players) p.boosting = false;
    }
  }

  if (G.shake > 0) G.shake = Math.max(0, G.shake - dt * 32);

  ctx.save();
  if (G.shake > 0.5) {
    ctx.translate((Math.random() - 0.5) * G.shake, (Math.random() - 0.5) * G.shake);
  }
  draw();
  ctx.restore();
}

requestAnimationFrame(loop);

/* ---------------- events ---------------- */

ovl.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const action = btn.dataset.action;
  if (action === 'solo') start('solo');
  else if (action === 'versus') start('versus');
  else if (action === 'restart') start(G.mode);
  else if (action === 'resume') togglePause();
  else if (action === 'menu') showMenu();
});

const BLOCK = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space']);

window.addEventListener('keydown', (e) => {
  if (BLOCK.has(e.code)) e.preventDefault();
  keys.add(e.code);
  if (e.repeat) return;

  if (e.code === 'KeyP' || e.code === 'Escape') {
    if (G.state === 'run' || G.state === 'paused') togglePause();
    else if (G.state === 'over' || G.state === 'count') showMenu();
  }
  if (e.code === 'KeyR' && (G.state === 'run' || G.state === 'over' || G.state === 'paused')) {
    start(G.mode);
  }
  if (e.code === 'Enter' && G.state === 'menu') start('solo');
});

window.addEventListener('keyup', (e) => {
  keys.delete(e.code);
});

window.addEventListener('blur', () => {
  keys.clear();
  if (G.state === 'run') togglePause();
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && G.state === 'run') togglePause();
});

pauseBtn.addEventListener('click', () => {
  if (G.state === 'run' || G.state === 'paused') togglePause();
  else if (G.state === 'over') showMenu();
  else if (G.state === 'menu') start('solo');
});

soundBtn.addEventListener('click', () => {
  G.muted = !G.muted;
  try {
    localStorage.setItem(MUTE_KEY, G.muted ? '1' : '0');
  } catch { /* ignore */ }
  applySound();
  if (!G.muted) tone(560, 0.06, 'square', 0.04);
});

function bindTouch(el, key) {
  const on = (e) => {
    e.preventDefault();
    touch[key] = true;
    el.classList.add('is-active');
  };
  const off = (e) => {
    e.preventDefault();
    touch[key] = false;
    el.classList.remove('is-active');
  };
  el.addEventListener('pointerdown', on);
  el.addEventListener('pointerup', off);
  el.addEventListener('pointercancel', off);
  el.addEventListener('pointerleave', off);
}

bindTouch($('tLeft'), 'left');
bindTouch($('tRight'), 'right');
bindTouch($('tBoost'), 'boost');

if (window.matchMedia('(pointer: coarse)').matches) {
  document.body.classList.add('touch');
}

applySound();
pp2.hidden = true;
hudEl.classList.add('one');
