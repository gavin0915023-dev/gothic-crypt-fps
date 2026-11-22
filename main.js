import * as T from 'three';
import { createGothicMaterials } from './textures.js';
import { createGothicSky } from './sky.js';
import { createGothicArena } from './arena.js';
import { createWeaponSystem, WEAPONS } from './weapons.js';
import { createAudio } from './audio.js';
import { createBotManager, DIFFICULTIES } from './ai.js';

const $ = s => document.querySelector(s);
const stage = $('#stage');
const TARGET_SCORE = 20;
const MATCH_SECONDS = 270; // 4:30

// =========================================================================
// 1. THREE.JS SCENE, MOONLIT LIGHTING & GOTHIC CATHEDRAL ARENA
// =========================================================================
const scene = new T.Scene();
scene.fog = new T.FogExp2('#172332', .0115);

const camera = new T.PerspectiveCamera(72, 1, .08, 220);
scene.add(camera);

const renderer = new T.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.outputColorSpace = T.SRGBColorSpace;
renderer.toneMapping = T.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.42;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = T.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false;
renderer.shadowMap.needsUpdate = true;
stage.append(renderer.domElement);

const sky = createGothicSky(renderer);
scene.background = sky.background;
scene.environment = sky.environment;
scene.environmentIntensity = .72;

// Cool moonlit key light + twilight sky/ground fill (crisp Identity V visibility)
const hemi = new T.HemisphereLight('#8cb6e0', '#333b42', 1.32);
const moon = new T.DirectionalLight('#c2dcf8', 2.15);
moon.position.set(36, 56, -42);
moon.castShadow = true;
moon.shadow.mapSize.setScalar(matchMedia('(max-width: 700px)').matches ? 1024 : 2048);
Object.assign(moon.shadow.camera, { left: -46, right: 46, top: 46, bottom: -46, near: 6, far: 145 });
moon.shadow.normalBias = .08;
moon.shadow.bias = -.0004;
scene.add(hemi, moon, moon.target);

const mats = createGothicMaterials(Math.min(8, renderer.capabilities.getMaxAnisotropy()));
const arena = createGothicArena(scene, mats);
const weapons = createWeaponSystem(camera, scene);
const audio = createAudio();

// =========================================================================
// 2. GAME & PLAYER STATE
// =========================================================================
let state = 'lobby'; // 'lobby' | 'matching' | 'playing' | 'paused' | 'ended'
let selectedDiff = 'normal';
let selectedLoadout = 0;
let sensitivity = 1.0;
let scoreBlue = 0, scoreRed = 0, clockLeft = MATCH_SECONDS;
let orbitAngle = .4;
let hitmarkerTimer = 0, hitBadgeTimer = 0, dmgFlash = 0, dmgArcTimer = 0, dmgArcDeg = 0;
let stepSoundTimer = 0;

const player = {
  x: 0, y: 0, z: 31.5, yaw: 0, pitch: 0,
  velY: 0, grounded: true, coyote: .1, jumpBuf: 0, landDip: 0,
  crouchToggle: false, crouchBlend: 0, crouched: false,
  hp: 100, shield: 50, alive: true, respawnTimer: 0, spawnShield: 1.5, outOfCombat: 0,
  kills: 0, deaths: 0, headshots: 0, shots: 0, hits: 0, damageDealt: 0,
  bobPhase: 0, bobAmp: 0, speed: 0, sprinting: false
};

const keys = new Set();
let mouseFire = false, mouseAds = false, dragLook = null;
let touchDriveX = 0, touchDriveZ = 0;

function addKillfeed(attackerName, attackerTeam, victimName, victimTeam, weaponName, headshot) {
  const feed = $('#killfeed');
  const el = document.createElement('div');
  el.className = 'kf-item';
  el.innerHTML = `<span class="${attackerTeam === 'blue' ? 'kf-blue' : 'kf-red'}"></span>` +
    `<span class="kf-weapon">[${weaponName}]</span>` +
    (headshot ? '<span class="kf-hs">⌖ 爆头</span>' : '') +
    `<span class="${victimTeam === 'blue' ? 'kf-blue' : 'kf-red'}"></span>`;
  el.children[0].textContent = attackerName;
  el.lastElementChild.textContent = victimName;
  feed.prepend(el);
  while (feed.children.length > 5) feed.lastElementChild.remove();
  setTimeout(() => el.remove(), 5500);
}

function checkMatchEnd() {
  if (state !== 'playing') return;
  if (scoreBlue >= TARGET_SCORE || scoreRed >= TARGET_SCORE || clockLeft <= 0) {
    finishMatch();
  }
}

const botMgr = createBotManager(scene, arena, mats.shadowTex, weapons, audio, {
  onElimination(attacker, victim, headshot) {
    if (state !== 'playing') return;
    if (attacker?.team === 'blue') scoreBlue++;
    else if (attacker?.team === 'red') scoreRed++;
    if (attacker?.isPlayer) {
      player.kills++;
      if (headshot) player.headshots++;
      audio.kill();
    } else if (attacker?.bot) {
      attacker.bot.kills++;
    }
    addKillfeed(attacker?.name ?? '守夜', attacker?.team ?? 'blue', victim.name, victim.team, attacker?.weaponName ?? 'M4-圣堂', headshot);
    syncHudNumbers();
    checkMatchEnd();
  },
  onPlayerHit(damage, attackerBot, headshot) {
    if (!player.alive || state !== 'playing') return;
    player.outOfCombat = 0;
    audio.damage();
    dmgFlash = Math.min(1, dmgFlash + .55);
    // Directional damage indicator angle relative to player facing
    const dx = attackerBot.x - player.x, dz = attackerBot.z - player.z;
    const bearing = Math.atan2(dx, -dz);
    dmgArcDeg = (bearing - player.yaw) * 180 / Math.PI;
    dmgArcTimer = .85;

    let rem = damage;
    if (player.shield > 0) {
      const absorbed = Math.min(player.shield, Math.ceil(rem * .65));
      player.shield -= absorbed;
      rem -= absorbed;
    }
    player.hp = Math.max(0, player.hp - rem);
    if (player.hp <= 0) {
      player.alive = false;
      player.deaths++;
      player.respawnTimer = 3.0;
      attackerBot.kills++;
      scoreRed++;
      addKillfeed(attackerBot.name, 'red', '你', 'blue', 'M4-圣堂', headshot);
      $('#respawn-banner').hidden = false;
      checkMatchEnd();
    }
    syncHudNumbers();
  }
});

// Pre-populate ambient bots behind lobby backdrop so the arena feels alive immediately!
botMgr.initMatch(selectedDiff);

function spawnPlayer() {
  const sp = arena.blueSpawns[0];
  player.x = sp.x;
  player.z = sp.z;
  player.y = arena.supportHeight(sp.x, 0, sp.z, .42);
  player.yaw = sp.yaw;
  player.pitch = 0;
  player.velY = 0;
  player.grounded = true;
  player.landDip = 0;
  player.crouchToggle = false;
  player.crouchBlend = 0;
  player.crouched = false;
  player.hp = 100;
  player.shield = 50;
  player.alive = true;
  player.spawnShield = 1.5;
  player.outOfCombat = 0;
  weapons.resetAmmo();
  $('#respawn-banner').hidden = true;
}

function beginMatch(diffId) {
  selectedDiff = DIFFICULTIES[diffId] ? diffId : 'normal';
  scoreBlue = 0;
  scoreRed = 0;
  clockLeft = MATCH_SECONDS;
  player.kills = 0; player.deaths = 0; player.headshots = 0;
  player.shots = 0; player.hits = 0; player.damageDealt = 0;
  $('#killfeed').replaceChildren();
  botMgr.initMatch(selectedDiff);
  weapons.selectWeapon(selectedLoadout);
  spawnPlayer();

  state = 'playing';
  stage.dataset.state = state;
  stage.dataset.difficulty = selectedDiff;
  $('#lobby').hidden = true;
  $('#pause-menu').hidden = true;
  $('#end-screen').hidden = true;
  $('#hud').hidden = false;
  $('#crosshair').hidden = false;
  $('#diff-pill').textContent = DIFFICULTIES[selectedDiff].label;
  $('#tab-diff-label').textContent = `4v4 人机对战 · ${DIFFICULTIES[selectedDiff].label}（${DIFFICULTIES[selectedDiff].title}）`;
  document.querySelectorAll('[data-restart-diff]').forEach(b => b.classList.toggle('active', b.dataset.restartDiff === selectedDiff));
  syncWeaponSlots();
  syncHudNumbers();
  renderer.shadowMap.needsUpdate = true;
  stage.focus({ preventScroll: true });
  requestLockSafe();
}

function finishMatch() {
  state = 'ended';
  stage.dataset.state = state;
  mouseFire = false;
  mouseAds = false;
  if (document.pointerLockElement === stage) document.exitPointerLock?.();
  $('#crosshair').hidden = true;
  $('#sniper-scope').hidden = true;
  $('#tab-board').hidden = true;
  const win = scoreBlue >= scoreRed;
  audio.matchEnd(win);
  $('#end-title').textContent = win ? '胜利 · 守夜蓝队胜出' : '惜败 · 猩红红队胜出';
  $('#end-sub').textContent = `4v4 人机对局结算 · ${DIFFICULTIES[selectedDiff].label}（${DIFFICULTIES[selectedDiff].title}）`;
  $('#end-blue').textContent = String(scoreBlue);
  $('#end-red').textContent = String(scoreRed);
  const acc = player.shots > 0 ? Math.round(player.hits / player.shots * 100) : 0;
  $('#end-stats').innerHTML =
    `<div class="end-stat"><small>个人击杀 / 阵亡</small><strong>${player.kills} / ${player.deaths}</strong></div>` +
    `<div class="end-stat"><small>爆头击杀</small><strong>${player.headshots}</strong></div>` +
    `<div class="end-stat"><small>射击命中率</small><strong>${acc}%</strong></div>` +
    `<div class="end-stat"><small>总输出伤害</small><strong>${player.damageDealt}</strong></div>`;
  $('#end-screen').hidden = false;
}

function requestLockSafe() {
  if (matchMedia('(pointer: coarse)').matches) return;
  try {
    const p = stage.requestPointerLock?.();
    if (p && typeof p.catch === 'function') p.catch(() => {});
  } catch { /* Pointer lock may be declined in headless/iframe contexts */ }
}

// =========================================================================
// 3. PLAYER SHOOTING & BALLISTICS
// =========================================================================
function firePlayerShot() {
  if (!player.alive || state !== 'playing' || !weapons.canFire()) return;
  const w = weapons.consumeShot();
  player.shots++;
  audio.shot(w.sound, 0);

  // Compute dynamic spread based on ADS, crouch, movement & airborne state
  const ads = mouseAds && !weapons.isReloading && !player.sprinting;
  let spread = ads ? w.adsSpread : w.hipSpread;
  if (player.crouched) spread *= .58;
  if (player.speed > 1) spread += w.moveSpread * (ads ? .35 : player.crouched ? .48 : 1);
  if (!player.grounded) spread += w.jumpSpread;

  const dir = new T.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  dir.x += (Math.random() - .5) * spread * 2;
  dir.y += (Math.random() - .5) * spread * 2;
  dir.z += (Math.random() - .5) * spread * 2;
  dir.normalize();

  const origin = camera.position.clone();
  const worldHit = arena.raycastWorld(origin, dir, 130);
  const maxDist = worldHit ? worldHit.dist : 130;
  const botHit = botMgr.hitTestBots(origin, dir, maxDist, 'blue');

  const muzzle = weapons.getMuzzleWorld();
  if (botHit) {
    player.hits++;
    const mult = botHit.zone === 'head' ? w.headMult : botHit.zone === 'limb' ? w.limbMult : 1;
    const dmg = Math.round(w.damage * mult);
    player.damageDealt += dmg;
    const res = botMgr.damageBot(botHit.bot, dmg, {
      isPlayer: true, name: '你', team: 'blue', weaponName: w.name, pos: { x: player.x, y: player.y + 1.55, z: player.z }
    }, botHit.zone);
    weapons.spawnTracer(muzzle, botHit.point, w.tracerColor);
    weapons.spawnImpact(botHit.point, dir.clone().negate(), true);
    if (res.hit) {
      const isHead = botHit.zone === 'head';
      audio.hit(isHead);
      hitmarkerTimer = isHead ? .24 : .15;
      const hm = $('#hitmarker');
      hm.classList.add('show');
      hm.classList.toggle('head', isHead);
      if (isHead) {
        hitBadgeTimer = .55;
        $('#hit-badge').hidden = false;
      }
    }
  } else if (worldHit) {
    weapons.spawnTracer(muzzle, worldHit.point, w.tracerColor);
    weapons.spawnImpact(worldHit.point, worldHit.normal, false);
  } else {
    weapons.spawnTracer(muzzle, origin.clone().addScaledVector(dir, 95), w.tracerColor);
  }

  // Authentic upward recoil kick (reduced when crouching or ADS)
  const recoilMult = (ads ? .65 : 1) * (player.crouched ? .72 : 1);
  player.pitch = T.MathUtils.clamp(player.pitch + w.recoilPitch * recoilMult, -1.36, 1.36);
  player.yaw += (Math.random() - .5) * w.recoilYaw * 2 * (player.crouched ? .72 : 1);

  if (weapons.currentAmmo === 0) {
    if (weapons.startReload()) audio.reload();
  }
  syncHudNumbers();
}

// =========================================================================
// 4. HUD & 2D TACTICAL RADAR DRAWING
// =========================================================================
const radarCanvas = $('#radar');
const radarCtx = radarCanvas.getContext('2d');

function drawRadar() {
  const S = radarCanvas.width;
  const ctx = radarCtx;
  ctx.clearRect(0, 0, S, S);
  ctx.fillStyle = '#0d1520';
  ctx.fillRect(0, 0, S, S);

  const scale = S / 80;
  const toR = (x, z) => [S / 2 + x * scale, S / 2 + z * scale];

  // Arena structures
  for (const sh of arena.radarShapes) {
    const [rx, rz] = toR(sh.x - sh.w / 2, sh.z - sh.d / 2);
    ctx.fillStyle = sh.kind === 'wall' ? '#364556' : sh.kind === 'platform' ? '#495a6a' : sh.kind === 'ramp' ? '#63717e' : '#2a3644';
    ctx.fillRect(rx, rz, Math.max(2, sh.w * scale), Math.max(2, sh.d * scale));
  }

  // Bots
  for (const b of botMgr.bots) {
    if (!b.alive) continue;
    // Show allies always; show enemies when spotted/firing or within 16m radar sweep
    const d = Math.hypot(b.x - player.x, b.z - player.z);
    if (b.team === 'red' && b.spottedTimer <= 0 && d > 17) continue;
    const [bx, bz] = toR(b.x, b.z);
    ctx.beginPath();
    ctx.arc(bx, bz, 3.2, 0, Math.PI * 2);
    ctx.fillStyle = b.team === 'blue' ? '#58dcff' : '#ff5548';
    ctx.fill();
  }

  // Player marker & FOV wedge
  const [px, pz] = toR(player.x, player.z);
  const ang = player.yaw - Math.PI / 2;
  ctx.save();
  ctx.translate(px, pz);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.arc(0, 0, 22, ang - .55, ang + .55);
  ctx.closePath();
  ctx.fillStyle = 'rgba(214, 177, 104, 0.28)';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, 0, 4, 0, Math.PI * 2);
  ctx.fillStyle = '#f6d27a';
  ctx.fill();
  ctx.strokeStyle = '#0b111b';
  ctx.lineWidth = 1.4;
  ctx.stroke();
  ctx.restore();
}

function syncWeaponSlots() {
  const w = weapons.current;
  $('#weapon-name').textContent = w.name;
  $('#weapon-sub').textContent = w.subtitle;
  document.querySelectorAll('[data-slot]').forEach(b => b.classList.toggle('active', Number(b.dataset.slot) === weapons.currentIndex));
}

function syncHudNumbers() {
  $('#score-blue').textContent = String(scoreBlue);
  $('#score-red').textContent = String(scoreRed);
  const mins = Math.floor(Math.max(0, clockLeft) / 60);
  const secs = Math.floor(Math.max(0, clockLeft) % 60);
  $('#clock').textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  $('#hp-val').textContent = String(Math.ceil(player.hp));
  $('#hp-fill').style.width = `${Math.max(0, player.hp)}%`;
  $('.bar-track.hp').classList.toggle('low', player.hp <= 30);
  $('#shield-val').textContent = String(Math.ceil(player.shield));
  $('#shield-fill').style.width = `${Math.max(0, player.shield * 2)}%`;
  $('#ammo-cur').textContent = String(weapons.currentAmmo);
  $('#ammo-cur').classList.toggle('low', weapons.currentAmmo <= Math.ceil(weapons.current.mag * .25));
  $('#kd-mini').textContent = `击杀 ${player.kills} · 阵亡 ${player.deaths} · 爆头 ${player.headshots}`;
  stage.dataset.ammo = String(weapons.currentAmmo);
  stage.dataset.weapon = weapons.current.id;
  stage.dataset.hp = String(Math.ceil(player.hp));
  stage.dataset.score = `${scoreBlue}-${scoreRed}`;
}

function renderTabBoard() {
  const blueRows = [{ name: '你（守夜队长）', kills: player.kills, deaths: player.deaths, me: true }, ...botMgr.bots.filter(b => b.team === 'blue')];
  const redRows = botMgr.bots.filter(b => b.team === 'red');
  const build = rows => rows.sort((a, b) => b.kills - a.kills).map(r => `<tr${r.me ? ' class="me"' : ''}><td>${r.name}</td><td>${r.kills}</td><td>${r.deaths}</td></tr>`).join('');
  $('#tab-blue').innerHTML = build(blueRows);
  $('#tab-red').innerHTML = build(redRows);
}

// =========================================================================
// 5. INPUTS: POINTER LOCK, KEYBOARD, MOUSE, LOBBY & TOUCH CONTROLS
// =========================================================================
function resize() {
  const w = Math.max(1, stage.clientWidth), h = Math.max(1, stage.clientHeight);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
}
new ResizeObserver(resize).observe(stage);
resize();

document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === stage;
  stage.dataset.pointerLock = String(locked);
  $('#lock-hint').hidden = state !== 'playing' || locked || matchMedia('(pointer: coarse)').matches;
  if (!locked && state === 'playing') {
    mouseFire = false;
    mouseAds = false;
  }
});

document.addEventListener('mousemove', e => {
  if (state !== 'playing' || !player.alive) return;
  if (document.pointerLockElement === stage) {
    const scale = (weapons.current.scoped && mouseAds ? .00095 : .0021) * sensitivity;
    player.yaw += e.movementX * scale;
    player.pitch = T.MathUtils.clamp(player.pitch - e.movementY * scale, -1.36, 1.36);
    weapons.addLookSway(e.movementX, e.movementY);
  } else if (dragLook) {
    const dx = e.clientX - dragLook.x, dy = e.clientY - dragLook.y;
    dragLook.x = e.clientX; dragLook.y = e.clientY;
    player.yaw += dx * .0036 * sensitivity;
    player.pitch = T.MathUtils.clamp(player.pitch - dy * .0036 * sensitivity, -1.36, 1.36);
    weapons.addLookSway(dx, dy);
  }
});

stage.addEventListener('mousedown', e => {
  if (state !== 'playing') return;
  audio.unlock();
  stage.focus({ preventScroll: true });
  if (e.button === 0) {
    if (document.pointerLockElement !== stage && !matchMedia('(pointer: coarse)').matches) {
      requestLockSafe();
      dragLook = { x: e.clientX, y: e.clientY };
    }
    mouseFire = true;
    firePlayerShot();
  } else if (e.button === 2) {
    mouseAds = true;
    if (document.pointerLockElement !== stage) dragLook = { x: e.clientX, y: e.clientY };
  }
});
window.addEventListener('mouseup', e => {
  if (e.button === 0) mouseFire = false;
  if (e.button === 2) mouseAds = false;
  dragLook = null;
});
stage.addEventListener('contextmenu', e => e.preventDefault());
stage.addEventListener('wheel', e => {
  if (state !== 'playing') return;
  e.preventDefault();
  weapons.selectWeapon(weapons.currentIndex + (e.deltaY > 0 ? 1 : -1));
  syncWeaponSlots();
  syncHudNumbers();
}, { passive: false });

document.addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  if (k === 'escape') {
    if (state === 'playing') {
      state = 'paused';
      stage.dataset.state = state;
      mouseFire = false; mouseAds = false; keys.clear();
      if (document.pointerLockElement === stage) document.exitPointerLock?.();
      $('#pause-menu').hidden = false;
      $('#tab-board').hidden = true;
    } else if (state === 'paused') {
      resumeGame();
    }
    return;
  }
  if (state !== 'playing') return;
  if (k === 'tab') {
    e.preventDefault();
    renderTabBoard();
    $('#tab-board').hidden = false;
    return;
  }
  if (e.code === 'Space' || k === ' ') {
    e.preventDefault();
    player.jumpBuf = .14;
    if (player.grounded || player.coyote > 0) {
      player.velY = 7.3;
      player.grounded = false;
      player.coyote = 0;
      player.jumpBuf = 0;
      audio.step(false);
    }
    return;
  }
  if (k === 'c' && !e.repeat) {
    player.crouchToggle = !player.crouchToggle;
    $('#touch-crouch')?.setAttribute('aria-pressed', String(player.crouchToggle));
    return;
  }
  if (k === 'r') { if (weapons.startReload()) audio.reload(); return; }
  if (k === '1' || k === '2' || k === '3') { weapons.selectWeapon(Number(k) - 1); syncWeaponSlots(); syncHudNumbers(); return; }
  if (k === 'm') { toggleMute(); return; }
  keys.add(k);
});
window.addEventListener('keyup', e => {
  const k = e.key.toLowerCase();
  keys.delete(k);
  if (k === 'tab') $('#tab-board').hidden = true;
});
window.addEventListener('blur', () => { keys.clear(); mouseFire = false; mouseAds = false; });

// Weapon slot HUD buttons
document.querySelectorAll('[data-slot]').forEach(btn => {
  btn.onclick = () => {
    if (state !== 'playing') return;
    weapons.selectWeapon(Number(btn.dataset.slot));
    syncWeaponSlots();
    syncHudNumbers();
  };
});

// Lobby difficulty & loadout buttons
document.querySelectorAll('.diff-card').forEach(card => {
  card.onclick = () => {
    selectedDiff = card.dataset.diff;
    document.querySelectorAll('.diff-card').forEach(c => {
      const on = c.dataset.diff === selectedDiff;
      c.classList.toggle('active', on);
      c.setAttribute('aria-pressed', String(on));
    });
  };
});
document.querySelectorAll('[data-loadout]').forEach(btn => {
  btn.onclick = () => {
    selectedLoadout = Number(btn.dataset.loadout);
    document.querySelectorAll('[data-loadout]').forEach(b => {
      const on = Number(b.dataset.loadout) === selectedLoadout;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', String(on));
    });
  };
});

let matchTimer = null;
$('#start-match').onclick = () => {
  if (state === 'matching') return;
  audio.unlock();
  state = 'matching';
  stage.dataset.state = state;
  const mmBox = $('#matchmaking-status'), mmText = $('#mm-text');
  mmBox.hidden = false;
  $('#start-match').disabled = true;
  const label = `${DIFFICULTIES[selectedDiff].label} · ${DIFFICULTIES[selectedDiff].title}`;
  mmText.textContent = `正在匹配「${label}」4v4 人机小队 (4/8)…`;
  clearTimeout(matchTimer);
  matchTimer = setTimeout(() => {
    mmText.textContent = `小队集结完毕 (8/8) · 正在进入暮影圣堂…`;
    matchTimer = setTimeout(() => {
      mmBox.hidden = true;
      $('#start-match').disabled = false;
      beginMatch(selectedDiff);
    }, 320);
  }, 380);
};

function toggleMute() {
  audio.setMuted(!audio.muted);
  const label = audio.muted ? '音效：已静音' : '音效：开启';
  $('#toggle-mute-lobby').textContent = label;
  $('#toggle-mute-lobby').setAttribute('aria-pressed', String(audio.muted));
  $('#btn-mute').textContent = label;
}
$('#toggle-mute-lobby').onclick = toggleMute;
$('#btn-mute').onclick = toggleMute;

function resumeGame() {
  if (state !== 'paused') return;
  state = 'playing';
  stage.dataset.state = state;
  $('#pause-menu').hidden = true;
  stage.focus({ preventScroll: true });
  requestLockSafe();
}
$('#btn-resume').onclick = resumeGame;
$('#btn-lobby').onclick = () => {
  state = 'lobby';
  stage.dataset.state = state;
  $('#pause-menu').hidden = true;
  $('#hud').hidden = true;
  $('#crosshair').hidden = true;
  $('#sniper-scope').hidden = true;
  $('#lobby').hidden = false;
};
$('#sens-slider').oninput = e => {
  sensitivity = Number(e.target.value);
  $('#sens-val').textContent = sensitivity.toFixed(1);
};
document.querySelectorAll('[data-restart-diff]').forEach(btn => {
  btn.onclick = () => beginMatch(btn.dataset.restartDiff);
});
$('#btn-rematch').onclick = () => beginMatch(selectedDiff);
$('#btn-end-lobby').onclick = () => {
  state = 'lobby';
  stage.dataset.state = state;
  $('#end-screen').hidden = true;
  $('#hud').hidden = true;
  $('#lobby').hidden = false;
};

// Mobile touch controls (virtual joystick + look drag + fire/ADS/jump/reload buttons)
if (matchMedia('(pointer: coarse)').matches) {
  $('#touch-controls').hidden = false;
  const pad = $('#touch-move'), knob = pad.querySelector('.touch-knob');
  let padId = null, lookId = null, lx = 0, ly = 0;
  pad.addEventListener('pointerdown', e => { padId = e.pointerId; pad.setPointerCapture(e.pointerId); });
  pad.addEventListener('pointermove', e => {
    if (e.pointerId !== padId) return;
    const r = pad.getBoundingClientRect(), rad = r.width / 2 - 12;
    let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    const l = Math.hypot(dx, dy);
    if (l > rad) { dx *= rad / l; dy *= rad / l; }
    knob.style.transform = `translate(${dx.toFixed(1)}px,${dy.toFixed(1)}px)`;
    touchDriveX = dx / rad;
    touchDriveZ = -dy / rad;
  });
  for (const ev of ['pointerup', 'pointercancel']) pad.addEventListener(ev, e => {
    if (e.pointerId !== padId) return;
    padId = null; knob.style.transform = ''; touchDriveX = 0; touchDriveZ = 0;
  });
  stage.addEventListener('pointerdown', e => {
    if (state !== 'playing' || lookId !== null) return;
    lookId = e.pointerId; lx = e.clientX; ly = e.clientY;
  });
  stage.addEventListener('pointermove', e => {
    if (e.pointerId !== lookId) return;
    player.yaw += (e.clientX - lx) * .0045 * sensitivity;
    player.pitch = T.MathUtils.clamp(player.pitch - (e.clientY - ly) * .0045 * sensitivity, -1.32, 1.32);
    lx = e.clientX; ly = e.clientY;
  });
  for (const ev of ['pointerup', 'pointercancel']) stage.addEventListener(ev, e => { if (e.pointerId === lookId) lookId = null; });
  $('#touch-fire').addEventListener('pointerdown', () => { mouseFire = true; firePlayerShot(); });
  for (const ev of ['pointerup', 'pointercancel']) $('#touch-fire').addEventListener(ev, () => { mouseFire = false; });
  $('#touch-ads').onclick = () => { mouseAds = !mouseAds; };
  $('#touch-jump').onclick = () => {
    player.jumpBuf = .14;
    if (player.grounded || player.coyote > 0) { player.velY = 7.3; player.grounded = false; player.coyote = 0; player.jumpBuf = 0; }
  };
  $('#touch-crouch').onclick = () => {
    player.crouchToggle = !player.crouchToggle;
    $('#touch-crouch').setAttribute('aria-pressed', String(player.crouchToggle));
  };
  $('#touch-reload').onclick = () => { if (weapons.startReload()) audio.reload(); };
}

// =========================================================================
// 6. MAIN REAL-TIME GAME LOOP
// =========================================================================
let lastTime = performance.now();
let clockAccum = 0;

function tick(now) {
  const dt = Math.min(.05, (now - lastTime) / 1000);
  lastTime = now;
  const tSec = now / 1000;
  arena.updateAtmosphere(tSec);

  if (state === 'lobby' || state === 'matching' || state === 'ended') {
    // Cinematic slow moonlit orbit showcasing the Red Cathedral & Ancient Cemetery!
    orbitAngle += dt * .14;
    camera.fov = 58;
    camera.updateProjectionMatrix();
    camera.position.set(Math.sin(orbitAngle) * 33, 13.5 + Math.sin(orbitAngle * .7) * 2.2, Math.cos(orbitAngle) * 33);
    camera.lookAt(0, 4.2, 0);
    weapons.update(dt, { speed: 0, aiming: false, visible: false });
    botMgr.update(dt, player, false);
    renderer.render(scene, camera);
    requestAnimationFrame(tick);
    return;
  }

  if (state === 'playing') {
    // Match countdown
    clockLeft = Math.max(0, clockLeft - dt);
    clockAccum += dt;
    if (clockAccum >= .25) {
      clockAccum = 0;
      syncHudNumbers();
      checkMatchEnd();
    }

    if (!player.alive) {
      player.respawnTimer -= dt;
      $('#respawn-text').textContent = `${Math.max(1, Math.ceil(player.respawnTimer))} 秒后重返圣堂…`;
      if (player.respawnTimer <= 0) spawnPlayer();
      camera.position.set(player.x, player.y + .45, player.z);
      camera.rotation.set(.15, -player.yaw, .24, 'YXZ');
      weapons.update(dt, { speed: 0, aiming: false, visible: false });
    } else {
      if (player.spawnShield > 0) player.spawnShield = Math.max(0, player.spawnShield - dt);
      // Out-of-combat shield regeneration (rewards tactical cover play!)
      player.outOfCombat += dt;
      if (player.outOfCombat > 4.5 && player.shield < 50) {
        player.shield = Math.min(50, player.shield + 14 * dt);
        $('#shield-val').textContent = String(Math.ceil(player.shield));
        $('#shield-fill').style.width = `${player.shield * 2}%`;
      }

      // Crouch state (Ctrl hold or C toggle) with headroom clearance check
      const wantCrouch = keys.has('control') || player.crouchToggle;
      if (wantCrouch) {
        player.crouched = true;
      } else if (player.crouched && arena.hasHeadroom(player.x, player.y, player.z, .42, 1.78)) {
        player.crouched = false;
      }
      const targetCrouch = player.crouched ? 1 : 0;
      player.crouchBlend += (targetCrouch - player.crouchBlend) * Math.min(1, dt * 15);
      const actorHeight = T.MathUtils.lerp(1.78, 1.16, player.crouchBlend);

      // Movement & Sprint
      let fwd = (keys.has('w') || keys.has('arrowup') ? 1 : 0) - (keys.has('s') || keys.has('arrowdown') ? 1 : 0) + touchDriveZ;
      let strafe = (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0) + touchDriveX;
      const mag = Math.hypot(fwd, strafe);
      if (mag > 1) { fwd /= mag; strafe /= mag; }
      player.sprinting = Boolean(!player.crouched && keys.has('shift') && fwd > .2 && !mouseAds && !weapons.isReloading);
      const baseSpeed = player.crouched ? 4.2 : player.sprinting ? 10.2 : mouseAds ? 4.4 : 7.0;
      const prevX = player.x, prevZ = player.z;
      if (mag > .02) {
        const dx = (Math.sin(player.yaw) * fwd + Math.cos(player.yaw) * strafe) * baseSpeed * dt;
        const dz = (-Math.cos(player.yaw) * fwd + Math.sin(player.yaw) * strafe) * baseSpeed * dt;
        const res = arena.resolveHorizontal(player.x + dx, player.y, player.z + dz, .42, actorHeight);
        player.x = res.x;
        player.z = res.z;
      }
      const moved = Math.hypot(player.x - prevX, player.z - prevZ);
      const instSpeed = dt > 1e-4 ? moved / dt : 0;
      player.speed += (instSpeed - player.speed) * Math.min(1, dt * 14);

      // Jump Physics, Ramps & Crate Top Support!
      const floor = arena.supportHeight(player.x, player.y, player.z, .42);
      if (player.jumpBuf > 0) player.jumpBuf = Math.max(0, player.jumpBuf - dt);
      if (player.grounded) {
        player.coyote = .10;
        if (player.y > floor + .38) {
          player.grounded = false;
        } else {
          player.y = floor;
          player.velY = 0;
          if (player.jumpBuf > 0) {
            player.velY = 7.3;
            player.grounded = false;
            player.coyote = 0;
            player.jumpBuf = 0;
            audio.step(false);
          }
        }
      } else {
        player.coyote = Math.max(0, player.coyote - dt);
        player.velY -= 21.5 * dt;
        player.y += player.velY * dt;
        if (player.y <= floor) {
          const impact = Math.min(1, Math.abs(player.velY) / 9.5);
          player.y = floor;
          player.velY = 0;
          player.grounded = true;
          player.landDip = -.14 * impact;
          if (impact > .35) audio.step(true);
        }
      }
      if (player.grounded && Math.abs(player.landDip) > .0005) {
        player.landDip *= Math.exp(-15 * dt);
      }

      // Footsteps & Stride Head-Bob
      const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
      const targetBob = player.grounded && instSpeed > .6 ? Math.min(1, instSpeed / 8) : 0;
      player.bobAmp += (targetBob - player.bobAmp) * Math.min(1, dt * 10);
      if (player.grounded && instSpeed > .8) {
        player.bobPhase += dt * (player.sprinting ? 11.4 : 8.2);
        stepSoundTimer -= dt;
        if (stepSoundTimer <= 0) {
          audio.step(false);
          stepSoundTimer = player.sprinting ? .30 : .44;
        }
      }

      const bobY = !reduced ? Math.sin(player.bobPhase) * (player.sprinting ? .058 : player.crouched ? .018 : .035) * player.bobAmp * (mouseAds ? .25 : 1) : 0;
      const bobX = !reduced ? Math.cos(player.bobPhase * .5) * (player.sprinting ? .028 : player.crouched ? .008 : .015) * player.bobAmp * (mouseAds ? .2 : 1) : 0;
      const rightX = Math.cos(player.yaw), rightZ = Math.sin(player.yaw);
      const eyeHeight = T.MathUtils.lerp(1.62, 1.02, player.crouchBlend);
      camera.position.set(player.x + rightX * bobX, player.y + eyeHeight + player.landDip + bobY, player.z + rightZ * bobX);
      camera.rotation.set(player.pitch, -player.yaw, 0, 'YXZ');

      // Full-auto firing
      if (mouseFire && weapons.current.auto) firePlayerShot();

      // Weapon viewmodel + ADS FOV
      const ws = weapons.update(dt, {
        speed: player.speed, sprinting: player.sprinting, grounded: player.grounded,
        aiming: mouseAds, reducedMotion: reduced, visible: true
      });
      if (ws.reloadDone) syncHudNumbers();

      const targetFov = T.MathUtils.lerp(player.sprinting ? 78 : 72, ws.weapon.adsFov, ws.adsBlend);
      if (Math.abs(camera.fov - targetFov) > .05) {
        camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 16);
        camera.updateProjectionMatrix();
      }

      // Sniper scope vs dynamic crosshair
      $('#sniper-scope').hidden = !ws.scopedView;
      $('#crosshair').hidden = ws.scopedView;
      const chSpread = 5 + Math.min(12, player.speed * 1.1) + (player.grounded ? 0 : 12) - ws.adsBlend * 3.5 - player.crouchBlend * 2.2;
      $('#crosshair').style.setProperty('--spread', Math.max(2, chSpread).toFixed(1) + 'px');

      // Reload progress UI
      $('#reload-bar').hidden = !ws.reloading;
      if (ws.reloading) $('#reload-fill').style.width = `${(ws.reloadProgress * 100).toFixed(1)}%`;

      stage.dataset.playerY = player.y.toFixed(2);
      stage.dataset.eyeY = eyeHeight.toFixed(2);
      stage.dataset.crouched = String(player.crouched);
      stage.dataset.scoped = String(ws.scopedView);
    }

    // Hitmarker & damage overlays fade
    if (hitmarkerTimer > 0) {
      hitmarkerTimer = Math.max(0, hitmarkerTimer - dt);
      if (hitmarkerTimer === 0) $('#hitmarker').classList.remove('show');
    }
    if (hitBadgeTimer > 0) {
      hitBadgeTimer = Math.max(0, hitBadgeTimer - dt);
      if (hitBadgeTimer === 0) $('#hit-badge').hidden = true;
    }
    if (dmgFlash > 0) dmgFlash = Math.max(0, dmgFlash - dt * 2.2);
    const lowHpPulse = player.alive && player.hp <= 30 ? .32 + Math.sin(tSec * 6) * .12 : 0;
    $('#damage-vignette').style.opacity = Math.max(dmgFlash * .78, lowHpPulse).toFixed(2);
    if (dmgArcTimer > 0) {
      dmgArcTimer = Math.max(0, dmgArcTimer - dt);
      const arc = $('#damage-arc');
      arc.style.opacity = Math.min(1, dmgArcTimer * 1.6).toFixed(2);
      arc.style.transform = `rotate(${dmgArcDeg.toFixed(1)}deg)`;
    } else {
      $('#damage-arc').style.opacity = '0';
    }

    botMgr.update(dt, player, true);
    drawRadar();
  }

  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

// Expose deterministic test/diagnostic hook on stage dataset for automated verification
stage.dataset.ready = 'true';
stage.dataset.state = state;
requestAnimationFrame(tick);
