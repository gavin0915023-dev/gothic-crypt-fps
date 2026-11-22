import * as T from 'three';

// Articulated 3D Gothic Tactical Operator model for Ally (Blue Wardens) & Enemy (Red Phantoms) bots.
// High-contrast glowing visors & shoulder insignia ensure crisp FPS visibility in moonlit mist.

function capsule(r, len, mat) {
  const m = new T.Mesh(new T.CapsuleGeometry(r, len, 4, 8), mat);
  m.castShadow = false;
  m.receiveShadow = true;
  return m;
}

function box(w, h, d, mat) {
  const m = new T.Mesh(new T.BoxGeometry(w, h, d), mat);
  m.castShadow = false;
  m.receiveShadow = true;
  return m;
}

export function createBotModel(team, shadowTex) {
  const isEnemy = team === 'red';
  const root = new T.Group();
  root.name = `bot-${team}`;

  const body = new T.Group();
  root.add(body);

  // Real-time contact shadow pinned under feet (scales down on jump)
  const shadowMat = new T.MeshBasicMaterial({
    map: shadowTex, transparent: true, opacity: .44, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2
  });
  const shadowGeo = new T.PlaneGeometry(1.15, 1.15);
  shadowGeo.rotateX(-Math.PI / 2);
  const shadow = new T.Mesh(shadowGeo, shadowMat);
  shadow.position.y = .035;
  root.add(shadow);

  const coatMat = new T.MeshStandardMaterial({ color: isEnemy ? '#3a2027' : '#1b4357', roughness: .78, metalness: .12 });
  const vestMat = new T.MeshStandardMaterial({ color: isEnemy ? '#231b1f' : '#182834', roughness: .72, metalness: .22 });
  const accentMat = new T.MeshStandardMaterial({
    color: isEnemy ? '#ff5244' : '#58dcff',
    emissive: new T.Color(isEnemy ? '#ff3a2b' : '#28b8e8'),
    emissiveIntensity: .85,
    roughness: .35
  });
  const visorMat = new T.MeshBasicMaterial({ color: isEnemy ? '#ff6f52' : '#7ae8ff' });
  const helmMat = new T.MeshStandardMaterial({ color: isEnemy ? '#281d22' : '#1d2d3a', roughness: .52, metalness: .35 });
  const pantsMat = new T.MeshStandardMaterial({ color: '#1f252c', roughness: .86 });
  const bootMat = new T.MeshStandardMaterial({ color: '#14171a', roughness: .78, metalness: .15 });
  const gunMat = new T.MeshStandardMaterial({ color: '#2b3138', roughness: .42, metalness: .72 });
  const flashMat = new T.MeshBasicMaterial({ color: '#ffd98a', transparent: true, opacity: .95 });

  // Pelvis
  const pelvis = new T.Group();
  pelvis.position.set(0, .88, 0);
  body.add(pelvis);

  const hip = capsule(.14, .08, pantsMat);
  hip.rotation.z = Math.PI / 2;
  pelvis.add(hip);

  // Torso & Gothic tactical armor + glowing team pauldrons
  const torso = new T.Group();
  torso.position.set(0, .06, 0);
  pelvis.add(torso);

  const chest = capsule(.175, .25, coatMat);
  chest.position.set(0, .24, 0);
  chest.scale.set(1.08, 1, .8);
  torso.add(chest);

  const plate = box(.30, .30, .24, vestMat);
  plate.position.set(0, .24, -.01);
  torso.add(plate);

  // High-contrast glowing chest/back core strips so friend/foe is readable instantly from any angle
  const chestStrip = box(.22, .055, .26, accentMat);
  chestStrip.position.set(0, .31, -.01);
  torso.add(chestStrip);

  // Gothic trenchcoat tail flaps
  const tailL = box(.14, .34, .06, coatMat);
  tailL.position.set(-.09, -.08, .12);
  tailL.rotation.x = .15;
  const tailR = box(.14, .34, .06, coatMat);
  tailR.position.set(.09, -.08, .12);
  tailR.rotation.x = .15;
  torso.add(tailL, tailR);

  // Head & Tactical Gothic Helmet with Glowing Visor
  const headGroup = new T.Group();
  headGroup.position.set(0, .48, 0);
  torso.add(headGroup);

  const helm = new T.Mesh(new T.SphereGeometry(.142, 12, 10), helmMat);
  helm.position.set(0, .17, 0);
  helm.scale.set(.96, 1.05, 1.04);
  headGroup.add(helm);

  const crest = box(.05, .07, .24, accentMat);
  crest.position.set(0, .30, .01);
  headGroup.add(crest);

  const visor = box(.20, .068, .08, visorMat);
  visor.position.set(0, .175, -.115);
  headGroup.add(visor);

  // Arms & Tactical Rifle
  function makeArm(side) {
    const sh = new T.Group();
    sh.position.set(side * .215, .38, 0);
    torso.add(sh);
    const pauldron = new T.Mesh(new T.SphereGeometry(.075, 8, 6), accentMat);
    sh.add(pauldron);
    const upper = capsule(.052, .20, coatMat);
    upper.position.set(0, -.13, 0);
    sh.add(upper);
    const elbow = new T.Group();
    elbow.position.set(0, -.25, 0);
    sh.add(elbow);
    const fore = capsule(.045, .18, vestMat);
    fore.position.set(0, -.11, 0);
    elbow.add(fore);
    return { sh, elbow };
  }
  const leftArm = makeArm(-1);
  const rightArm = makeArm(1);

  // Bot 3D rifle mounted on right forearm
  const rifle = new T.Group();
  rifle.position.set(-.02, -.22, -.16);
  rifle.rotation.x = -Math.PI / 2;
  rightArm.elbow.add(rifle);
  const rBody = box(.06, .11, .52, gunMat);
  const rBarrel = new T.Mesh(new T.CylinderGeometry(.016, .018, .32, 6), gunMat);
  rBarrel.rotation.x = Math.PI / 2;
  rBarrel.position.set(0, .02, -.38);
  const rMag = box(.04, .16, .06, vestMat);
  rMag.position.set(0, -.11, -.04);
  rMag.rotation.x = .18;
  const flash = new T.Mesh(new T.OctahedronGeometry(.14, 0), flashMat);
  flash.position.set(0, .02, -.56);
  flash.visible = false;
  rifle.add(rBody, rBarrel, rMag, flash);

  // Legs
  function makeLeg(side) {
    const hipJ = new T.Group();
    hipJ.position.set(side * .095, -.02, 0);
    pelvis.add(hipJ);
    const thigh = capsule(.07, .29, pantsMat);
    thigh.position.set(0, -.19, 0);
    hipJ.add(thigh);
    const knee = new T.Group();
    knee.position.set(0, -.39, 0);
    hipJ.add(knee);
    const shin = capsule(.058, .28, pantsMat);
    shin.position.set(0, -.19, 0);
    knee.add(shin);
    const boot = box(.11, .11, .26, bootMat);
    boot.position.set(0, -.39, -.04);
    knee.add(boot);
    return { hipJ, knee };
  }
  const leftLeg = makeLeg(-1);
  const rightLeg = makeLeg(1);

  let phase = Math.random() * Math.PI * 2;
  let flashTimer = 0;
  let hitFlash = 0;

  function triggerFlash() {
    flashTimer = .065;
    flash.visible = true;
    flash.rotation.z = Math.random() * Math.PI;
  }

  function triggerHit() {
    hitFlash = .12;
  }

  function getMuzzleWorld(target = new T.Vector3()) {
    flash.updateWorldMatrix(true, false);
    return target.setFromMatrixPosition(flash.matrixWorld);
  }

  function update({ x, y, z, groundY, yaw, pitch = 0, speed = 0, grounded = true, alive = true, deathTime = 0, dt = .016 }) {
    root.position.set(x, groundY, z);
    root.rotation.y = -yaw;
    const jumpY = Math.max(0, y - groundY);
    body.position.y = jumpY;

    const shScale = Math.max(.45, 1 - jumpY * .26);
    shadow.scale.set(shScale, 1, shScale);
    shadowMat.opacity = alive ? .44 / (1 + jumpY * .75) : Math.max(0, .35 - deathTime * .2);

    if (flashTimer > 0) {
      flashTimer = Math.max(0, flashTimer - dt);
      if (flashTimer === 0) flash.visible = false;
    }
    if (hitFlash > 0) {
      hitFlash = Math.max(0, hitFlash - dt);
      coatMat.emissive.set(hitFlash > 0 ? '#ffffff' : '#000000');
      coatMat.emissiveIntensity = hitFlash > 0 ? .55 : 0;
    }

    if (!alive) {
      // Dramatic collapse onto back on elimination
      const fall = Math.min(1, deathTime * 3.8);
      const ease = 1 - (1 - fall) * (1 - fall);
      body.rotation.x = -ease * (Math.PI / 2);
      body.position.y = .14 * ease;
      flash.visible = false;
      return;
    }
    body.rotation.x = 0;

    const amp = Math.min(1, speed / 7.5);
    if (grounded && amp > .05) phase += dt * (7.5 + amp * 4.5);
    const s = Math.sin(phase), c = Math.cos(phase);

    pelvis.position.y = .88 + (grounded ? Math.abs(c) * .045 * amp : 0);
    torso.rotation.x = -.08 * amp;
    headGroup.rotation.x = T.MathUtils.clamp(pitch, -.45, .45);

    if (grounded) {
      leftLeg.hipJ.rotation.x = s * .65 * amp;
      rightLeg.hipJ.rotation.x = -s * .65 * amp;
      leftLeg.knee.rotation.x = -Math.max(0, -c) * .85 * amp;
      rightLeg.knee.rotation.x = -Math.max(0, c) * .85 * amp;
    } else {
      leftLeg.hipJ.rotation.x = .48;
      rightLeg.hipJ.rotation.x = -.15;
      leftLeg.knee.rotation.x = -.9;
      rightLeg.knee.rotation.x = -.55;
    }

    // Combat rifle aiming stance
    const recoil = flashTimer > 0 ? .18 : 0;
    rightArm.sh.rotation.x = 1.18 + T.MathUtils.clamp(pitch * .6, -.35, .35) + recoil;
    rightArm.sh.rotation.z = -.08;
    rightArm.elbow.rotation.x = .42;
    leftArm.sh.rotation.x = 1.12 + T.MathUtils.clamp(pitch * .6, -.35, .35);
    leftArm.sh.rotation.z = .32;
    leftArm.elbow.rotation.x = .62;
  }

  // Analytical ray-vs-head/torso/limbs hitbox intersection (fast & exact!)
  function hitTest(origin, dir, x, y, z, maxDist) {
    // Broad phase bounding cylinder check
    const dx = x - origin.x, dz = z - origin.z;
    const proj = dx * dir.x + dz * dir.z;
    if (proj < -.5 || proj > maxDist + 1) return null;

    let best = null;
    // 1. Head sphere (generous fair FPS headshot hitbox: r = 0.23m at y + 1.57)
    {
      const cx = x, cy = y + 1.57, cz = z, r = .23;
      const ocx = origin.x - cx, ocy = origin.y - cy, ocz = origin.z - cz;
      const b = ocx * dir.x + ocy * dir.y + ocz * dir.z;
      const c = ocx * ocx + ocy * ocy + ocz * ocz - r * r;
      const disc = b * b - c;
      if (disc >= 0) {
        const t = -b - Math.sqrt(disc);
        if (t > .05 && t < maxDist) {
          best = { dist: t, zone: 'head', point: new T.Vector3(origin.x + dir.x * t, origin.y + dir.y * t, origin.z + dir.z * t) };
        }
      }
    }
    // 2. Torso & Legs AABB
    const boxes = [
      { zone: 'body', minX: x - .28, maxX: x + .28, minY: y + .86, maxY: y + 1.44, minZ: z - .24, maxZ: z + .24 },
      { zone: 'limb', minX: x - .24, maxX: x + .24, minY: y + .04, maxY: y + .86, minZ: z - .22, maxZ: z + .22 }
    ];
    const invX = Math.abs(dir.x) > 1e-8 ? 1 / dir.x : 1e12;
    const invY = Math.abs(dir.y) > 1e-8 ? 1 / dir.y : 1e12;
    const invZ = Math.abs(dir.z) > 1e-8 ? 1 / dir.z : 1e12;
    for (const box of boxes) {
      const t1 = (box.minX - origin.x) * invX, t2 = (box.maxX - origin.x) * invX;
      const ty1 = (box.minY - origin.y) * invY, ty2 = (box.maxY - origin.y) * invY;
      const tz1 = (box.minZ - origin.z) * invZ, tz2 = (box.maxZ - origin.z) * invZ;
      const tmin = Math.max(Math.min(t1, t2), Math.min(ty1, ty2), Math.min(tz1, tz2));
      const tmax = Math.min(Math.max(t1, t2), Math.max(ty1, ty2), Math.max(tz1, tz2));
      if (tmax >= Math.max(.05, tmin) && tmin > .05 && tmin < (best ? best.dist : maxDist)) {
        best = { dist: tmin, zone: box.zone, point: new T.Vector3(origin.x + dir.x * tmin, origin.y + dir.y * tmin, origin.z + dir.z * tmin) };
      }
    }
    return best;
  }

  return { root, update, triggerFlash, triggerHit, getMuzzleWorld, hitTest };
}
