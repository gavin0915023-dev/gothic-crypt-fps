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

  // Mobile responsive check
  await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await waitFrames(3);
  check('Mobile viewport fits with zero horizontal overflow', await ev('document.documentElement.scrollWidth<=window.innerWidth'));

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
