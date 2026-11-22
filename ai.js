import * as T from 'three';
import { createBotModel } from './bot-model.js';

// 3-tier tactical AI bot system for 4v4 Bot Matchmaking (Player + 3 Blue Allies vs 4 Red Enemies).

export const DIFFICULTIES = {
  easy: {
    id: 'easy', label: '简单', title: '见习守夜',
    badge: '轻松上手 · 宽容对枪',
    desc: 'AI 反应较慢、散布较大，沿主路线稳步推进，适合熟悉教堂古墓地图与压枪手感。',
    stats: '反应 520ms · 散布 ±8.5° · 低频走位',
    reactionSec: .52, spreadDeg: 8.5, fireInterval: .36, damage: 11,
    headshotChance: .05, moveSpeed: 5.2, strafeChance: .18, jumpChance: .02,
    highGroundBias: .12, sightRange: 36, burstSize: 4
  },
  normal: {
    id: 'normal', label: '普通', title: '圣堂猎手',
    badge: '三路协同 · 急停走位',
    desc: 'AI 具备标准反应与点射精度，会分兵墓园与石棺回廊包抄、对枪急停并寻找掩体换弹。',
    stats: '反应 280ms · 散布 ±4.2° · 战术包抄',
    reactionSec: .28, spreadDeg: 4.2, fireInterval: .23, damage: 16,
    headshotChance: .18, moveSpeed: 6.4, strafeChance: .62, jumpChance: .08,
    highGroundBias: .48, sightRange: 46, burstSize: 5
  },
  hard: {
    id: 'hard', label: '困难', title: '古墓梦魇',
    badge: '极速拉枪 · 高台压制',
    desc: '精英级 AI 反应极快、精准锁头倾向高，积极抢占教堂祭坛高台与二层石廊，高频急停跳枪与受击秒反。',
    stats: '反应 145ms · 散布 ±1.9° · 抢高台+跳枪',
    reactionSec: .145, spreadDeg: 1.9, fireInterval: .17, damage: 20,
    headshotChance: .36, moveSpeed: 7.4, strafeChance: .92, jumpChance: .22,
    highGroundBias: .85, sightRange: 56, burstSize: 7
  }
};

const BLUE_NAMES = ['守夜·白鸦', '守夜·灰狼', '守夜·苍鹰'];
const RED_NAMES = ['猩红·渡鸦', '猩红·断罪', '猩红·影刃', '猩红·钟魇'];

function shortestPath(adj, start, goal) {
  if (start === goal) return [goal];
  const prev = new Int32Array(adj.length).fill(-1);
  const q = [start];
  prev[start] = start;
  for (let i = 0; i < q.length; i++) {
    const u = q[i];
    if (u === goal) break;
    for (const v of adj[u]) {
      if (prev[v] === -1) { prev[v] = u; q.push(v); }
    }
  }
  if (prev[goal] === -1) return [goal];
  const path = [];
  for (let u = goal; u !== start; u = prev[u]) path.push(u);
  path.reverse();
  return path;
}

export function createBotManager(scene, arena, shadowTex, weapons, audio, callbacks) {
  const bots = [];
  let diff = DIFFICULTIES.normal;

  function nearestWaypoint(x, z) {
    let best = 0, bestD2 = Infinity;
    for (let i = 0; i < arena.waypoints.length; i++) {
      const wp = arena.waypoints[i];
      const d2 = (wp.x - x) ** 2 + (wp.z - z) ** 2;
      if (d2 < bestD2) { bestD2 = d2; best = i; }
    }
    return best;
  }

  function pickGoal(bot) {
    const wps = arena.waypoints;
    const enemySide = bot.team === 'red' ? 1 : -1; // red pushes +Z, blue pushes -Z
    const candidates = [];
    for (let i = 0; i < wps.length; i++) {
      const wp = wps[i];
      if (wp.role === 'spawn-blue' || wp.role === 'spawn-red') continue;
      let weight = 1;
      if (wp.role === 'high') weight += bot.profile.highGroundBias * 3.2;
      if (wp.role === bot.lane) weight += 2.2;
      if (wp.z * enemySide > -6) weight += 1.4;
      candidates.push({ i, weight });
    }
    const total = candidates.reduce((s, c) => s + c.weight, 0);
    let r = Math.random() * total;
    for (const c of candidates) {
      r -= c.weight;
      if (r <= 0) return c.i;
    }
    return candidates[0].i;
  }

  function spawnBot(bot, idx) {
    const spawns = bot.team === 'blue' ? arena.blueSpawns : arena.redSpawns;
    const sp = spawns[idx % spawns.length];
    const jitterX = (Math.random() - .5) * 2.4;
    const jitterZ = (Math.random() - .5) * 1.8;
    const pos = arena.resolveHorizontal(sp.x + jitterX, 0, sp.z + jitterZ, .42);
    bot.x = pos.x;
    bot.z = pos.z;
    bot.groundY = arena.supportHeight(bot.x, 0, bot.z, .42);
    bot.y = bot.groundY;
    bot.velY = 0;
    bot.grounded = true;
    bot.yaw = sp.yaw;
    bot.pitch = 0;
    bot.hp = 100;
    bot.alive = true;
    bot.deathTime = 0;
    bot.respawnTimer = 0;
    bot.spawnShield = 1.2;
    bot.ammo = 24;
    bot.reloadTimer = 0;
    bot.fireCd = .4 + Math.random() * .4;
    bot.seenTimer = 0;
    bot.targetId = null;
    bot.path = [];
    bot.strafeDir = Math.random() > .5 ? 1 : -1;
    bot.strafeTimer = .7 + Math.random() * 1.1;
    bot.lastKnown = null;
    bot.spottedTimer = 0;
    bot.model.root.visible = true;
    bot.model.update({ ...bot, speed: 0, dt: 0 });
  }

  function initMatch(difficultyId) {
    diff = DIFFICULTIES[difficultyId] ?? DIFFICULTIES.normal;
    for (const b of bots) scene.remove(b.model.root);
    bots.length = 0;

    // Ally tactical tuning by difficulty: Normal-mode teammates are sharper and cover flanks reliably
    const allyProfile = diff.id === 'normal'
      ? {
          ...diff,
          reactionSec: .21,
          damage: 18,
          spreadDeg: 3.3,
          headshotChance: .24,
          strafeChance: .75,
          highGroundBias: .65,
          moveSpeed: 6.7
        }
      : diff.id === 'hard'
      ? {
          ...diff,
          reactionSec: .16,
          damage: 19,
          spreadDeg: 2.3,
          headshotChance: .30
        }
      : {
          ...diff,
          reactionSec: .45,
          damage: 12,
          spreadDeg: 7.8
        };

    const lanes = ['west', 'mid', 'east', 'mid'];
    BLUE_NAMES.forEach((name, i) => {
      const model = createBotModel('blue', shadowTex);
      scene.add(model.root);
      const bot = {
        id: 'blue-' + i, name, team: 'blue', lane: lanes[i],
        profile: allyProfile, model, kills: 0, deaths: 0, assists: 0
      };
      spawnBot(bot, i + 1);
      bots.push(bot);
    });
    RED_NAMES.forEach((name, i) => {
      const model = createBotModel('red', shadowTex);
      scene.add(model.root);
      const bot = {
        id: 'red-' + i, name, team: 'red', lane: lanes[i],
        profile: diff, model, kills: 0, deaths: 0, assists: 0
      };
      spawnBot(bot, i);
      bots.push(bot);
    });
  }

  function alertBot(bot, shooterPos) {
    if (!bot.alive) return;
    const dx = shooterPos.x - bot.x, dz = shooterPos.z - bot.z;
    bot.lastKnown = { x: shooterPos.x, y: shooterPos.y, z: shooterPos.z, ttl: 3.5 };
    // Hard bots whip around rapidly when shot from flank!
    if (bot.profile.id === 'hard' || Math.random() < .65) {
      bot.yaw = Math.atan2(dx, -dz);
      bot.seenTimer = Math.max(bot.seenTimer, bot.profile.reactionSec * .5);
    }
  }

  function damageBot(bot, amount, attacker, zone = 'body') {
    if (!bot.alive || bot.spawnShield > 0) return { hit: false, killed: false };
    bot.hp = Math.max(0, bot.hp - amount);
    bot.model.triggerHit();
    bot.spottedTimer = 3.2;
    if (attacker?.pos) alertBot(bot, attacker.pos);
    if (bot.hp <= 0) {
      bot.alive = false;
      bot.deathTime = 0;
      bot.respawnTimer = 3.2;
      bot.deaths++;
      callbacks.onElimination?.(attacker, bot, zone === 'head');
      return { hit: true, killed: true };
    }
    return { hit: true, killed: false };
  }

  function hitTestBots(origin, dir, maxDist, ignoreTeam = 'blue') {
    let best = null;
    for (const bot of bots) {
      if (!bot.alive || bot.team === ignoreTeam) continue;
      const hit = bot.model.hitTest(origin, dir, bot.x, bot.y, bot.z, best ? best.dist : maxDist);
      if (hit) best = { ...hit, bot };
    }
    return best;
  }

  function update(dt, player, matchActive) {
    if (!matchActive) {
      for (const b of bots) b.model.update({ ...b, speed: 0, dt });
      return;
    }

    for (let bi = 0; bi < bots.length; bi++) {
      const bot = bots[bi];
      if (!bot.alive) {
        bot.deathTime += dt;
        bot.respawnTimer -= dt;
        bot.model.update({ ...bot, speed: 0, dt });
        if (bot.respawnTimer <= 0) spawnBot(bot, bi);
        continue;
      }

      if (bot.spawnShield > 0) bot.spawnShield = Math.max(0, bot.spawnShield - dt);
      if (bot.fireCd > 0) bot.fireCd = Math.max(0, bot.fireCd - dt);
      if (bot.spottedTimer > 0) bot.spottedTimer = Math.max(0, bot.spottedTimer - dt);
      if (bot.reloadTimer > 0) {
        bot.reloadTimer = Math.max(0, bot.reloadTimer - dt);
        if (bot.reloadTimer === 0) bot.ammo = 24;
      }

      const eyePos = { x: bot.x, y: bot.y + 1.54, z: bot.z };
      const p = bot.profile;

      // 1. Target Acquisition (check player if red bot + opposing bots)
      let target = null, targetDist = p.sightRange;
      const candidates = [];
      if (bot.team === 'red' && player.alive) {
        const pEyeOffset = player.crouched ? 1.02 : 1.55;
        candidates.push({ isPlayer: true, id: 'player', name: '你', x: player.x, y: player.y, z: player.z, eyeY: player.y + pEyeOffset });
      }
      for (const other of bots) {
        if (other.alive && other.team !== bot.team) {
          candidates.push({ isPlayer: false, bot: other, id: other.id, name: other.name, x: other.x, y: other.y, z: other.z, eyeY: other.y + 1.52 });
        }
      }
      for (const c of candidates) {
        const d = Math.hypot(c.x - bot.x, c.y - bot.y, c.z - bot.z);
        if (d > targetDist) continue;
        if (arena.hasLineOfSight(eyePos, { x: c.x, y: c.eyeY, z: c.z })) {
          target = c;
          targetDist = d;
        }
      }

      if (target) {
        if (bot.targetId !== target.id) {
          bot.targetId = target.id;
          bot.seenTimer = 0;
        } else {
          bot.seenTimer += dt;
        }
        bot.lastKnown = { x: target.x, y: target.y, z: target.z, ttl: 4.0 };
        if (bot.team === 'red' && target.isPlayer) bot.spottedTimer = Math.max(bot.spottedTimer, 1.4);
      } else {
        bot.seenTimer = Math.max(0, bot.seenTimer - dt * 1.6);
        bot.targetId = null;
        if (bot.lastKnown) {
          bot.lastKnown.ttl -= dt;
          if (bot.lastKnown.ttl <= 0) bot.lastKnown = null;
        }
      }

      // 2. Movement & Tactical Navigation
      let moveX = 0, moveZ = 0;
      let aimYaw = bot.yaw, aimPitch = 0;

      if (target) {
        const dx = target.x - bot.x, dz = target.z - bot.z;
        const dy = (target.y + 1.45) - (bot.y + 1.52);
        const horiz = Math.max(.1, Math.hypot(dx, dz));
        aimYaw = Math.atan2(dx, -dz);
        aimPitch = Math.atan2(dy, horiz);

        // Tactical strafe, distance control & jump-shots
        bot.strafeTimer -= dt;
        if (bot.strafeTimer <= 0) {
          bot.strafeTimer = .55 + Math.random() * .95;
          if (Math.random() < p.strafeChance) bot.strafeDir = -bot.strafeDir;
          else bot.strafeDir = 0;
          if (bot.grounded && Math.random() < p.jumpChance && targetDist < 22) {
            bot.velY = 6.6;
            bot.grounded = false;
          }
        }
        const rightX = Math.cos(aimYaw), rightZ = Math.sin(aimYaw);
        const fwdX = Math.sin(aimYaw), fwdZ = -Math.cos(aimYaw);
        const strafeAmt = bot.strafeDir * (p.strafeChance > .4 ? .82 : .35);
        const pushAmt = bot.reloadTimer > 0 || bot.hp < 32 ? -.65 : targetDist > 18 ? .55 : targetDist < 7 ? -.45 : 0;
        moveX = rightX * strafeAmt + fwdX * pushAmt;
        moveZ = rightZ * strafeAmt + fwdZ * pushAmt;
      } else {
        // Waypoint patrol / flank push across 3 lanes
        if (!bot.path.length) {
          const startWp = nearestWaypoint(bot.x, bot.z);
          const goalWp = bot.lastKnown ? nearestWaypoint(bot.lastKnown.x, bot.lastKnown.z) : pickGoal(bot);
          bot.path = shortestPath(arena.navAdj, startWp, goalWp);
        }
        const nextWp = arena.waypoints[bot.path[0]];
        if (nextWp) {
          const dx = nextWp.x - bot.x, dz = nextWp.z - bot.z;
          const dist = Math.hypot(dx, dz);
          if (dist < 1.8) {
            bot.path.shift();
          } else {
            moveX = dx / dist;
            moveZ = dz / dist;
            aimYaw = Math.atan2(moveX, -moveZ);
          }
        }
      }

      // Soft separation between bots so squadmates never stack inside each other
      for (const other of bots) {
        if (other === bot || !other.alive) continue;
        const sx = bot.x - other.x, sz = bot.z - other.z;
        const sd = Math.hypot(sx, sz);
        if (sd > .01 && sd < 1.35) {
          moveX += (sx / sd) * .8;
          moveZ += (sz / sd) * .8;
        }
      }

      const mLen = Math.hypot(moveX, moveZ);
      let actualSpeed = 0;
      if (mLen > .05) {
        const sp = p.moveSpeed * (target ? .76 : 1);
        const stepX = (moveX / mLen) * sp * dt;
        const stepZ = (moveZ / mLen) * sp * dt;
        const res = arena.resolveHorizontal(bot.x + stepX, bot.y, bot.z + stepZ, .42, 1.78);
        actualSpeed = Math.hypot(res.x - bot.x, res.z - bot.z) / Math.max(1e-4, dt);
        bot.x = res.x;
        bot.z = res.z;
      }

      // Vertical ramp support & jump gravity
      const floor = arena.supportHeight(bot.x, bot.y, bot.z, .42);
      bot.groundY = floor;
      if (bot.grounded) {
        if (bot.y > floor + .35) {
          bot.grounded = false;
        } else {
          bot.y = floor;
          bot.velY = 0;
        }
      } else {
        bot.velY -= 20 * dt;
        bot.y += bot.velY * dt;
        if (bot.y <= floor) {
          bot.y = floor;
          bot.velY = 0;
          bot.grounded = true;
        }
      }

      // Smooth turn speed scaled by difficulty
      const turnRate = p.id === 'hard' ? 14 : p.id === 'normal' ? 9.5 : 6;
      const diffYaw = Math.atan2(Math.sin(aimYaw - bot.yaw), Math.cos(aimYaw - bot.yaw));
      bot.yaw += diffYaw * Math.min(1, dt * turnRate);
      bot.pitch += (aimPitch - bot.pitch) * Math.min(1, dt * 8);

      // 3. Firing logic
      if (target && bot.seenTimer >= p.reactionSec && bot.fireCd <= 0 && bot.reloadTimer <= 0 && Math.abs(diffYaw) < .42) {
        if (bot.ammo <= 0) {
          bot.reloadTimer = 1.6;
        } else {
          bot.ammo--;
          bot.fireCd = p.fireInterval * (.85 + Math.random() * .35);
          bot.spottedTimer = 2.6;
          bot.model.triggerFlash();

          // Compute spread ray from bot eye toward target chest or head
          const aimHead = Math.random() < p.headshotChance;
          const aimY = target.y + (aimHead ? 1.56 : 1.18);
          const toX = target.x - eyePos.x, toY = aimY - eyePos.y, toZ = target.z - eyePos.z;
          const dist = Math.max(.1, Math.hypot(toX, toY, toZ));
          const spreadRad = (p.spreadDeg * Math.PI / 180) * (bot.grounded ? 1 : 1.35);
          const dir = new T.Vector3(
            toX / dist + (Math.random() - .5) * spreadRad * 2,
            toY / dist + (Math.random() - .5) * spreadRad * 1.8,
            toZ / dist + (Math.random() - .5) * spreadRad * 2
          ).normalize();

          const origin = new T.Vector3(eyePos.x, eyePos.y, eyePos.z);
          const worldHit = arena.raycastWorld(origin, dir, 90);
          const maxD = worldHit ? worldHit.dist : 90;
          let hitPoint = worldHit ? worldHit.point : origin.clone().addScaledVector(dir, 55);

          // Check player hit (if red bot)
          let landed = false;
          if (bot.team === 'red' && player.alive && player.spawnShield <= 0) {
            const crouchDrop = player.crouched ? .48 : 0;
            const pHit = bot.model.hitTest(origin, dir, player.x, player.y - crouchDrop, player.z, maxD);
            if (pHit) {
              landed = true;
              hitPoint = pHit.point;
              const dmg = Math.round(p.damage * (pHit.zone === 'head' ? 1.45 : 1));
              callbacks.onPlayerHit?.(dmg, bot, pHit.zone === 'head');
            }
          }
          // Check opposing bot hit
          if (!landed) {
            const bHit = hitTestBots(origin, dir, maxD, bot.team);
            if (bHit) {
              landed = true;
              hitPoint = bHit.point;
              const dmg = Math.round(p.damage * (bHit.zone === 'head' ? 1.8 : 1));
              damageBot(bHit.bot, dmg, { isBot: true, bot, name: bot.name, team: bot.team, weaponName: 'M4-圣堂', pos: eyePos }, bHit.zone);
              weapons.spawnImpact(bHit.point, dir.clone().negate(), true);
            }
          }
          if (!landed && worldHit) {
            weapons.spawnImpact(worldHit.point, worldHit.normal, false);
          }

          const muzzle = bot.model.getMuzzleWorld();
          weapons.spawnTracer(muzzle, hitPoint, bot.team === 'red' ? '#ff7c68' : '#7ae2ff');
          const distToPlayer = Math.hypot(bot.x - player.x, bot.z - player.z);
          if (distToPlayer < 48) audio.shot('rifle', distToPlayer);
        }
      }

      bot.model.update({ ...bot, speed: actualSpeed, dt });
    }
  }

  return { bots, initMatch, damageBot, hitTestBots, update, get difficulty() { return diff; } };
}
