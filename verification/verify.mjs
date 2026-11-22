import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { access, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from '../server.mjs';

const output = dirname(fileURLToPath(import.meta.url));
const browsers = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
].filter(Boolean);

let browserPath;
for (const c of browsers) {
  try { await access(c); browserPath = c; break; } catch {}
}
assert(browserPath, 'Set CHROME_PATH to a local Chrome or Edge executable.');

const server = serve(0);
await new Promise(r => server.once('listening', r));
const url = `http://127.0.0.1:${server.address().port}`;
const tmpRoot = resolve(tmpdir());
const profile = await mkdtemp(join(tmpRoot, 'gothic-fps-verify-'));

const browser = spawn(browserPath, [
  '--headless=new', '--no-first-run', '--no-default-browser-check',
  '--disable-background-networking', '--disable-extensions',
  '--remote-debugging-port=0', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
  `--user-data-dir=${profile}`, '--window-size=1440,900', 'about:blank'
], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });

let log = '';
browser.stderr.on('data', chunk => { log += chunk.toString(); });
const pause = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, label, timeout = 45000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const res = await fn();
    if (res) return res;
    await pause(100);
  }
  throw Error(`Timed out: ${label}\n${log.slice(-800)}`);
}

const checks = [], failures = [], shaderErrors = [];
function check(name, ok) {
  assert(ok, name);
  checks.push(name);
  console.log(`PASS ${name}`);
}

let socket;
try {
  const ep = await until(() => log.match(/DevTools listening on (ws:\/\/[^\s]+)/)?.[1], 'DevTools endpoint');
  const port = new URL(ep).port;
  const tab = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
  socket = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((res, rej) => { socket.addEventListener('open', res, { once: true }); socket.addEventListener('error', rej, { once: true }); });

  let seq = 0;
  const pending = new Map();
  socket.addEventListener('message', ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id);
      pending.delete(m.id);
      if (m.error) p.reject(Error(JSON.stringify(m.error))); else p.resolve(m.result);
    }
    if (m.method === 'Runtime.exceptionThrown') {
      failures.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text);
    }
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      const msg = m.params.args.map(a => a.value ?? a.description ?? '').join(' ');
      if (/Shader Error|VALIDATE_STATUS: false|WebGL/.test(msg)) shaderErrors.push(msg);
      else failures.push(msg);
    }
  });

  function call(method, params = {}) {
    return new Promise((res, rej) => {
      const id = ++seq;
      const timer = setTimeout(() => { pending.delete(id); rej(Error(`CDP timeout: ${method}`)); }, 45000);
      pending.set(id, { resolve(v) { clearTimeout(timer); res(v); }, reject(e) { clearTimeout(timer); rej(e); } });
      socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async function ev(expression) {
    const r = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  }
  const waitFrames = n => ev(`new Promise(r=>{let k=0;const f=()=>++k>=${n}?r(true):requestAnimationFrame(f);requestAnimationFrame(f)})`);
  async function snap(name) {
    await waitFrames(2);
    const shot = await call('Page.captureScreenshot', { format: 'png' });
    await writeFile(join(output, `${name}.png`), Buffer.from(shot.data, 'base64'));
  }

  await call('Page.enable');
  await call('Runtime.enable');
  await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await call('Page.navigate', { url });
  await until(() => ev("document.querySelector('#stage')?.dataset.ready==='true'"), 'Arena ready');
  await waitFrames(3);

  check('Gothic cathedral WebGL arena loads with lobby and 3 difficulty tiers', await ev(`(()=>{
    const cards=[...document.querySelectorAll('.diff-card')].map(c=>c.dataset.diff);
    return cards.join(',')==='easy,normal,hard' && !document.querySelector('#lobby').hidden && document.querySelector('#stage canvas').width>0;
  })()`));
  await snap('lobby');

  // Start Normal Bot Matchmaking
  await ev("document.querySelector('#start-match').click()");
  await until(() => ev("document.querySelector('#stage').dataset.state==='playing'"), 'Matchmaking finishes into live arena');
  await waitFrames(4);
  check('Bot matchmaking enters 4v4 arena with HUD, radar and M4-圣堂 rifle', await ev(`(()=>{
    const s=document.querySelector('#stage');
    return !document.querySelector('#hud').hidden && document.querySelector('#lobby').hidden &&
      s.dataset.difficulty==='normal' && s.dataset.weapon==='rifle' && s.dataset.ammo==='30' &&
      document.querySelector('#diff-pill').textContent==='普通';
  })()`));
  await snap('arena-fps');

  // Move forward toward the Red Cathedral Nave & test gravity jump
  await ev("document.dispatchEvent(new KeyboardEvent('keydown',{key:'w',code:'KeyW'}))");
  await waitFrames(10);
  await ev("window.dispatchEvent(new KeyboardEvent('keyup',{key:'w',code:'KeyW'}))");
  await snap('arena-mid');

  await ev("document.dispatchEvent(new KeyboardEvent('keydown',{key:' ',code:'Space'}))");
  await waitFrames(3);
  const airY = await ev("Number(document.querySelector('#stage').dataset.playerY)");
  await until(() => ev("Number(document.querySelector('#stage').dataset.playerY)===0"), 'Player lands after jump', 30000);
  check('Player jumps cleanly with gravity and lands on cathedral flagstones', airY > 0.25);

  // Crouch (C toggle) lowers eye height & tightens reticle, then stands back up
  const standEye = await ev("Number(document.querySelector('#stage').dataset.eyeY)");
  await ev("document.dispatchEvent(new KeyboardEvent('keydown',{key:'c',code:'KeyC'}))");
  await waitFrames(8);
  const crouched = await ev("document.querySelector('#stage').dataset.crouched==='true'");
  const crouchEye = await ev("Number(document.querySelector('#stage').dataset.eyeY)");
  await snap('crouch');
  await ev("document.dispatchEvent(new KeyboardEvent('keydown',{key:'c',code:'KeyC'}))");
  await waitFrames(8);
  const stood = await ev("document.querySelector('#stage').dataset.crouched==='false' && Number(document.querySelector('#stage').dataset.eyeY) > 1.5");
  check('Crouch lowers camera eye height cleanly and stands back up', crouched && standEye > 1.55 && crouchEye < 1.15 && stood);

  // Shoot and reload
  await ev("document.querySelector('#stage').dispatchEvent(new MouseEvent('mousedown',{button:0,clientX:720,clientY:450}))");
  await waitFrames(3);
  await ev("window.dispatchEvent(new MouseEvent('mouseup',{button:0}))");
  const ammoAfter = await ev("Number(document.querySelector('#stage').dataset.ammo)");
  await ev("document.dispatchEvent(new KeyboardEvent('keydown',{key:'r',code:'KeyR'}))");
  await waitFrames(2);
  const reloading = await ev("!document.querySelector('#reload-bar').hidden");
  check('Firing consumes ammo and R triggers animated reload', ammoAfter < 30 && reloading);

  // Switch weapons (SMG -> Sniper) & open optical sniper scope
  await ev("document.dispatchEvent(new KeyboardEvent('keydown',{key:'2',code:'Digit2'}))");
  const isSmg = await ev("document.querySelector('#stage').dataset.weapon==='smg' && document.querySelector('#stage').dataset.ammo==='36'");
  await ev("document.dispatchEvent(new KeyboardEvent('keydown',{key:'3',code:'Digit3'}))");
  const isSniper = await ev("document.querySelector('#stage').dataset.weapon==='sniper' && document.querySelector('#stage').dataset.ammo==='5'");
  await ev("document.querySelector('#stage').dispatchEvent(new MouseEvent('mousedown',{button:2,clientX:720,clientY:450}))");
  await waitFrames(6);
  const scoped = await ev("document.querySelector('#stage').dataset.scoped==='true' && !document.querySelector('#sniper-scope').hidden");
  await snap('sniper-scope');
  await ev("window.dispatchEvent(new MouseEvent('mouseup',{button:2}))");
  check('Weapon slots switch to SMG and Sniper with optical ADS scope', isSmg && isSniper && scoped);

  // Pause menu & instant difficulty switching (Hard -> Easy)
  await ev("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',code:'Escape'}))");
  await waitFrames(2);
  const paused = await ev("document.querySelector('#stage').dataset.state==='paused' && !document.querySelector('#pause-menu').hidden");
  await snap('pause-menu');
  await ev("document.querySelector('[data-restart-diff=hard]').click()");
  await waitFrames(3);
  const hardOk = await ev("document.querySelector('#stage').dataset.state==='playing' && document.querySelector('#stage').dataset.difficulty==='hard' && document.querySelector('#diff-pill').textContent==='困难'");
  await ev("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',code:'Escape'}))");
  await ev("document.querySelector('[data-restart-diff=easy]').click()");
  await waitFrames(3);
  const easyOk = await ev("document.querySelector('#stage').dataset.difficulty==='easy' && document.querySelector('#diff-pill').textContent==='简单'");
  check('Pause menu switches bot difficulty cleanly between Hard and Easy', paused && hardOk && easyOk);

  // Hold Tab scoreboard check
  await ev("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',code:'Tab'}))");
  const tabOk = await ev("!document.querySelector('#tab-board').hidden && document.querySelectorAll('#tab-blue tr').length===4 && document.querySelectorAll('#tab-red tr').length===4");
  await ev("window.dispatchEvent(new KeyboardEvent('keyup',{key:'Tab',code:'Tab'}))");
  check('4v4 scoreboard displays 4 Blue Wardens and 4 Red Phantoms', tabOk);

  // Mobile Landscape FPS UI & Touch Controls Verification (844x390, iPhone 14 landscape)
  await call('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 2, mobile: true });
  await call('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await call('Page.navigate', { url });
  await until(() => ev("document.querySelector('#stage')?.dataset.ready==='true'"), 'Mobile arena ready');
  await waitFrames(4);

  check('Mobile landscape lobby fits in single 390px viewport with 3-col cards and visible start CTA', await ev(`(()=>{
    const b = document.body.classList.contains('mobile-mode');
    const rot = document.querySelector('#stage').dataset.rotMode === '0';
    const start = document.querySelector('#start-match').getBoundingClientRect();
    const cards = [...document.querySelectorAll('.diff-card')].map(el => el.getBoundingClientRect());
    const sameRow = Math.abs(cards[0].top - cards[1].top) < 4 && Math.abs(cards[1].top - cards[2].top) < 4;
    const fits = start.bottom <= window.innerHeight && start.right <= window.innerWidth;
    const noOverflow = document.documentElement.scrollWidth <= window.innerWidth;
    return b && rot && sameRow && fits && noOverflow;
  })()`));
  await snap('mobile-lobby');

  // Enter match on mobile landscape
  await ev("document.querySelector('#start-match').click()");
  await until(() => ev("document.querySelector('#stage').dataset.state==='playing'"), 'Mobile matchmaking enters arena');
  await waitFrames(5);

  const layoutAudit = await ev(`(()=>{
    const ids = ['#radar', '.scoreboard-bar', '#mobile-hud-tools', '.vitality-box', '.weapon-box', '#touch-move', '#touch-fire-left', '#touch-fire', '#touch-ads', '#touch-jump', '#touch-crouch', '#touch-reload'];
    const rects = {};
    for (const sel of ids) {
      const r = document.querySelector(sel).getBoundingClientRect();
      rects[sel] = { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height };
    }
    const overlap = (a, b) => !(a.r <= b.l + 1 || b.r <= a.l + 1 || a.b <= b.t + 1 || b.b <= a.t + 1);
    const pairs = [
      ['#radar', '#touch-fire-left'], ['#radar', '#touch-move'], ['#radar', '.scoreboard-bar'],
      ['.scoreboard-bar', '#mobile-hud-tools'], ['#mobile-hud-tools', '#touch-ads'], ['#mobile-hud-tools', '#touch-reload'],
      ['#touch-fire-left', '#touch-move'], ['#touch-move', '.weapon-box'], ['#touch-move', '.vitality-box'],
      ['.weapon-box', '.vitality-box'], ['.weapon-box', '#touch-fire'], ['.vitality-box', '#touch-fire'],
      ['#touch-fire', '#touch-ads'], ['#touch-fire', '#touch-jump'], ['#touch-fire', '#touch-crouch'], ['#touch-fire', '#touch-reload'],
      ['#touch-ads', '#touch-jump'], ['#touch-jump', '#touch-crouch'], ['#touch-ads', '#touch-reload']
    ];
    const collisions = pairs.filter(([a, b]) => overlap(rects[a], rects[b])).map(([a, b]) => a + ' x ' + b);
    const outOfBounds = Object.entries(rects).filter(([, r]) => r.l < -1 || r.t < -1 || r.r > window.innerWidth + 1 || r.b > window.innerHeight + 1 || r.w <= 0 || r.h <= 0).map(([k]) => k);
    return { collisions, outOfBounds, touchVisible: !document.querySelector('#touch-controls').hidden };
  })()`);
  check(`Mobile landscape HUD (844x390) has zero overlapping or clipped controls (${JSON.stringify(layoutAudit)})`, layoutAudit.touchVisible && layoutAudit.collisions.length === 0 && layoutAudit.outOfBounds.length === 0);
  await snap('mobile-hud');

  // Test Floating Virtual Joystick + Auto-Sprint
  await ev(`(()=>{
    const z = document.querySelector('#touch-move-zone');
    z.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 11, clientX: 110, clientY: 300, bubbles: true }));
    z.dispatchEvent(new PointerEvent('pointermove', { pointerId: 11, clientX: 110, clientY: 220, bubbles: true }));
  })()`);
  await waitFrames(8);
  const mobileSprintOk = await ev("document.querySelector('#stage').dataset.sprinting === 'true'");
  await ev("document.querySelector('#touch-move-zone').dispatchEvent(new PointerEvent('pointerup', { pointerId: 11, clientX: 110, clientY: 220, bubbles: true }))");
  check('Mobile floating joystick moves forward and engages auto-sprint', mobileSprintOk);

  // Test Right Aim Zone + Primary Fire Drag-to-Aim + Left Secondary Fire
  const yawBefore = await ev("Number(document.querySelector('#stage').dataset.yaw)");
  await ev(`(()=>{
    const aim = document.querySelector('#touch-aim-zone');
    aim.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 12, clientX: 560, clientY: 180, bubbles: true }));
    aim.dispatchEvent(new PointerEvent('pointermove', { pointerId: 12, clientX: 640, clientY: 175, bubbles: true }));
    aim.dispatchEvent(new PointerEvent('pointerup', { pointerId: 12, clientX: 640, clientY: 175, bubbles: true }));
  })()`);
  await waitFrames(2);
  const yawAfterAim = await ev("Number(document.querySelector('#stage').dataset.yaw)");
  const ammoBeforeMobile = await ev("Number(document.querySelector('#stage').dataset.ammo)");
  await ev(`(()=>{
    const f = document.querySelector('#touch-fire');
    const r = f.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    f.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 13, clientX: cx, clientY: cy, bubbles: true }));
    f.dispatchEvent(new PointerEvent('pointermove', { pointerId: 13, clientX: cx + 45, clientY: cy + 8, bubbles: true }));
  })()`);
  await waitFrames(4);
  await ev("document.querySelector('#touch-fire').dispatchEvent(new PointerEvent('pointerup', { pointerId: 13, bubbles: true }))");
  const yawAfterFireDrag = await ev("Number(document.querySelector('#stage').dataset.yaw)");
  const ammoAfterRightFire = await ev("Number(document.querySelector('#stage').dataset.ammo)");
  await ev("document.querySelector('#touch-fire-left').dispatchEvent(new PointerEvent('pointerdown', { pointerId: 14, bubbles: true }))");
  await waitFrames(4);
  await ev("document.querySelector('#touch-fire-left').dispatchEvent(new PointerEvent('pointerup', { pointerId: 14, bubbles: true }))");
  const ammoAfterLeftFire = await ev("Number(document.querySelector('#stage').dataset.ammo)");
  check('Mobile aim drag, right fire-while-dragging, and left secondary fire all work cleanly',
    yawAfterAim > yawBefore + 0.1 && yawAfterFireDrag > yawAfterAim + 0.05 && ammoAfterRightFire < ammoBeforeMobile && ammoAfterLeftFire < ammoAfterRightFire);

  // Test Mobile Sniper Switch + ADS Scope + Crouch + Reload
  await ev("document.querySelector('[data-slot=\"2\"]').click()");
  await ev("document.querySelector('#touch-ads').dispatchEvent(new PointerEvent('pointerdown', { pointerId: 15, bubbles: true }))");
  await ev("document.querySelector('#touch-ads').dispatchEvent(new PointerEvent('pointerup', { pointerId: 15, bubbles: true }))");
  await waitFrames(6);
  const mobileScoped = await ev("document.querySelector('#stage').dataset.scoped === 'true' && document.querySelector('#touch-ads').getAttribute('aria-pressed') === 'true'");
  await snap('mobile-scope');
  await ev("document.querySelector('#touch-ads').dispatchEvent(new PointerEvent('pointerdown', { pointerId: 16, bubbles: true }))");
  await ev("document.querySelector('#touch-ads').dispatchEvent(new PointerEvent('pointerup', { pointerId: 16, bubbles: true }))");
  await ev("document.querySelector('#touch-crouch').dispatchEvent(new PointerEvent('pointerdown', { pointerId: 17, bubbles: true }))");
  await waitFrames(5);
  const mobileCrouchOk = await ev("document.querySelector('#stage').dataset.crouched === 'true'");
  await ev("document.querySelector('#touch-crouch').dispatchEvent(new PointerEvent('pointerdown', { pointerId: 18, bubbles: true }))");
  check('Mobile weapon dock switch, sniper ADS toggle, and crouch button work cleanly', mobileScoped && mobileCrouchOk);

  // Test Mobile Live Scoreboard & Pause Menu (with sensitivity steppers & left-fire toggle)
  await ev("document.querySelector('#btn-mobile-board').click()");
  await waitFrames(2);
  const mobileBoardOk = await ev("!document.querySelector('#tab-board').hidden && document.querySelector('#tab-board').getBoundingClientRect().bottom <= window.innerHeight");
  await ev("document.querySelector('#btn-close-board').click()");
  await ev("document.querySelector('#btn-mobile-pause').click()");
  await waitFrames(2);
  await ev("document.querySelector('#sens-inc').click()");
  await ev("document.querySelector('#btn-toggle-left-fire').click()");
  const mobilePauseOk = await ev(`(()=>{
    const pm = document.querySelector('#pause-menu');
    const card = pm.querySelector('.modal-card').getBoundingClientRect();
    return !pm.hidden && card.bottom <= window.innerHeight && document.querySelector('#sens-val').textContent === '1.1' && document.body.classList.contains('hide-left-fire');
  })()`);
  await snap('mobile-pause');
  await ev("document.querySelector('#btn-toggle-left-fire').click()");
  await ev("document.querySelector('#btn-resume').click()");
  check('Mobile scoreboard and pause menu fit cleanly in landscape with working settings', mobileBoardOk && mobilePauseOk);

  // Compact landscape phone check (667x375 iPhone SE)
  await call('Emulation.setDeviceMetricsOverride', { width: 667, height: 375, deviceScaleFactor: 2, mobile: true });
  await waitFrames(3);
  const compactAudit = await ev(`(()=>{
    const ids = ['#radar', '.scoreboard-bar', '#mobile-hud-tools', '.vitality-box', '.weapon-box', '#touch-move', '#touch-fire-left', '#touch-fire', '#touch-ads', '#touch-jump', '#touch-crouch', '#touch-reload'];
    const rects = Object.fromEntries(ids.map(s => [s, document.querySelector(s).getBoundingClientRect()]));
    const overlap = (a, b) => !(a.right <= b.left + 1 || b.right <= a.left + 1 || a.bottom <= b.top + 1 || b.bottom <= a.top + 1);
    const pairs = [['#radar', '#touch-fire-left'], ['#touch-move', '.weapon-box'], ['.weapon-box', '#touch-fire'], ['#touch-fire', '#touch-ads'], ['#touch-fire', '#touch-jump'], ['#touch-fire', '#touch-crouch'], ['#touch-fire', '#touch-reload']];
    return pairs.filter(([a, b]) => overlap(rects[a], rects[b])).length;
  })()`);
  check('Compact landscape viewport (667x375) fits with zero HUD collisions', compactAudit === 0);

  // Mobile Portrait Auto-Landscape Check (390x844)
  await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await waitFrames(4);
  const portraitAuto = await ev(`(()=>{
    const shell = document.querySelector('.game-shell');
    const canvas = document.querySelector('#stage canvas');
    const rot90 = shell.classList.contains('force-landscape') && document.querySelector('#stage').dataset.rotMode === '90';
    const landscapeCanvas = canvas.width > canvas.height;
    const noOverflow = document.documentElement.scrollWidth <= window.innerWidth;
    return rot90 && landscapeCanvas && noOverflow;
  })()`);
  await snap('mobile-portrait-autolandscape');
  await ev("document.querySelector('#btn-toast-flip').click()");
  await waitFrames(2);
  const portraitFlip = await ev("document.querySelector('#stage').dataset.rotMode === '-90' && document.querySelector('.game-shell').classList.contains('rot-ccw')");
  check('Mobile portrait auto-switches to software landscape with 180° flip and zero overflow', portraitAuto && portraitFlip);

  check('Zero uncaught exceptions and zero WebGL shader errors', failures.length === 0 && shaderErrors.length === 0);
  await writeFile(join(output, 'results.json'), JSON.stringify({ checks, failures, shaderErrors }, null, 2) + '\n');
  console.log(JSON.stringify({ passed: checks.length, failures, shaderErrors }, null, 2));
} finally {
  socket?.close();
  browser.kill();
  await new Promise(r => server.close(r));
  await pause(500);
  const verified = resolve(profile);
  assert(verified.startsWith(tmpRoot + sep));
  await rm(verified, { recursive: true, force: true, maxRetries: 4, retryDelay: 250 }).catch(() => {});
}
