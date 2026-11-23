import * as T from 'three';

// 3 Procedural 3D First-Person Weapons + Viewmodel Animations + Tracers / Sparks / Decals.
// Zero external models or textures.

export const WEAPONS = [
  {
    id: 'rifle', slot: 1, name: 'M4-圣堂', subtitle: '突击步枪',
    auto: true, rpm: 640, mag: 30, reloadSec: 1.55,
    damage: 28, headMult: 2.3, limbMult: .78,
    hipSpread: .012, adsSpread: .0028, moveSpread: .018, jumpSpread: .048,
    recoilPitch: .017, recoilYaw: .007, adsFov: 52, scoped: false,
    hipPos: [.23, -.23, -.44], adsPos: [0, -.162, -.34],
    tracerColor: '#ffe39c', sound: 'rifle'
  },
  {
    id: 'smg', slot: 2, name: 'VX-9 影袭', subtitle: '冲锋枪',
    auto: true, rpm: 880, mag: 36, reloadSec: 1.25,
    damage: 20, headMult: 2.15, limbMult: .8,
    hipSpread: .014, adsSpread: .0045, moveSpread: .011, jumpSpread: .034,
    recoilPitch: .012, recoilYaw: .009, adsFov: 58, scoped: false,
    hipPos: [.22, -.24, -.40], adsPos: [0, -.166, -.31],
    tracerColor: '#9ceeff', sound: 'smg'
  },
  {
    id: 'sniper', slot: 3, name: 'AWP-猎月', subtitle: '栓动狙击',
    auto: false, rpm: 48, mag: 5, reloadSec: 2.1,
    damage: 90, headMult: 2.2, limbMult: .82,
    hipSpread: .048, adsSpread: .0004, moveSpread: .028, jumpSpread: .08,
    recoilPitch: .062, recoilYaw: .014, adsFov: 24, scoped: true,
    hipPos: [.25, -.25, -.48], adsPos: [0, -.16, -.30],
    tracerColor: '#ffb578', sound: 'sniper'
  }
];

function buildWeaponMesh(id) {
  const g = new T.Group();
  const metal = new T.MeshStandardMaterial({ color: '#272e36', roughness: .32, metalness: .82 });
  const darkMetal = new T.MeshStandardMaterial({ color: '#171b20', roughness: .46, metalness: .72 });
  const goldTrim = new T.MeshStandardMaterial({ color: '#dcb464', roughness: .26, metalness: .88, emissive: new T.Color('#5a3c0e'), emissiveIntensity: .35 });
  const woodGrip = new T.MeshStandardMaterial({ color: '#422c22', roughness: .72, metalness: .08 });
  const gloveMat = new T.MeshStandardMaterial({ color: '#222830', roughness: .78 });
  const sleeveMat = new T.MeshStandardMaterial({ color: '#1b4357', roughness: .82 });
  const redDot = new T.MeshBasicMaterial({ color: new T.Color(2.6, 0.45, 0.35) });
  const cyanDot = new T.MeshBasicMaterial({ color: new T.Color(0.45, 2.2, 2.6) });
  const lensMat = new T.MeshBasicMaterial({ color: '#7ad8ff', transparent: true, opacity: .22 });

  const part = (w, h, d, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const m = new T.Mesh(new T.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    g.add(m);
    return m;
  };

  let mag, muzzleZ = -.55;

  if (id === 'rifle') {
    part(.058, .082, .34, metal, 0, .02, -.04);           // Receiver
    part(.062, .016, .36, darkMetal, 0, .064, -.06);       // Top picatinny rail
    part(.048, .064, .28, darkMetal, 0, .022, -.34);       // Handguard
    part(.064, .014, .22, goldTrim, 0, .035, -.05);        // Gothic gold filigree accent
    part(.008, .026, .072, goldTrim, .029, .028, -.03);    // Brass ejection port cover
    part(.038, .012, .042, goldTrim, 0, .058, .12);        // Rear charging handle
    for (let i = 0; i < 4; i++) {
      part(.054, .024, .018, goldTrim, 0, .022, -.24 - i * .055); // Ventilated quad-rail brass ribs
    }
    part(.030, .048, .075, darkMetal, 0, -.025, -.33, -.35); // Angled tactical foregrip
    const barrel = new T.Mesh(new T.CylinderGeometry(.014, .016, .26, 10), darkMetal);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, .028, -.58);
    g.add(barrel);
    const comp = new T.Mesh(new T.CylinderGeometry(.019, .019, .065, 8), goldTrim);
    comp.rotation.x = Math.PI / 2;
    comp.position.set(0, .028, -.71);
    g.add(comp);
    muzzleZ = -.75;
    // Holographic red-dot sight (aligned cleanly at y = +0.162 for ADS!)
    part(.046, .012, .09, darkMetal, 0, .078, -.02);
    part(.008, .048, .07, darkMetal, -.021, .106, -.02);
    part(.008, .048, .07, darkMetal, .021, .106, -.02);
    part(.050, .008, .07, goldTrim, 0, .132, -.02);
    part(.034, .038, .004, lensMat, 0, .106, -.02);
    const dot = new T.Mesh(new T.SphereGeometry(.0035, 6, 6), redDot);
    dot.position.set(0, .106, -.02);
    g.add(dot);
    // Stock, Cheek-rest & Grip
    part(.048, .085, .20, woodGrip, 0, .01, .21);
    part(.052, .022, .13, darkMetal, 0, .056, .22);        // Raised cheek rest
    part(.052, .096, .024, darkMetal, 0, .006, .315);      // Rubberized buttpad
    part(.038, .12, .046, woodGrip, 0, -.065, .07, .28);
    mag = part(.034, .165, .056, darkMetal, 0, -.095, -.11, -.16);
  } else if (id === 'smg') {
    part(.054, .078, .28, darkMetal, 0, .02, -.04);
    part(.058, .014, .22, goldTrim, 0, .042, -.06);
    // Side tactical laser module with glowing cyan emitter
    part(.022, .024, .075, metal, .036, .022, -.13);
    const laserDot = new T.Mesh(new T.SphereGeometry(.005, 6, 6), cyanDot);
    laserDot.position.set(.036, .022, -.17);
    g.add(laserDot);
    const suppressor = new T.Mesh(new T.CylinderGeometry(.021, .021, .20, 12), metal);
    suppressor.rotation.x = Math.PI / 2;
    suppressor.position.set(0, .024, -.28);
    g.add(suppressor);
    for (let i = 0; i < 3; i++) {
      const ring = new T.Mesh(new T.CylinderGeometry(.023, .023, .012, 12), goldTrim);
      ring.rotation.x = Math.PI / 2;
      ring.position.set(0, .024, -.21 - i * .065);
      g.add(ring);
    }
    muzzleZ = -.40;
    // Compact reflex sight
    part(.040, .010, .065, metal, 0, .066, -.02);
    part(.006, .040, .05, metal, -.018, .090, -.02);
    part(.006, .040, .05, metal, .018, .090, -.02);
    part(.042, .006, .05, goldTrim, 0, .112, -.02);
    const dot = new T.Mesh(new T.SphereGeometry(.0034, 6, 6), cyanDot);
    dot.position.set(0, .090, -.02);
    g.add(dot);
    part(.036, .11, .042, darkMetal, 0, -.06, .05, .22);
    part(.016, .018, .17, metal, 0, .032, .18);            // Skeleton folding stock Strut
    part(.042, .082, .018, darkMetal, 0, .012, .265);      // Stock buttplate
    mag = part(.026, .195, .036, metal, 0, -.11, -.12, -.06);
  } else {
    // AWP-LUNAR Gothic Sniper Rifle
    part(.062, .088, .40, new T.MeshStandardMaterial({ color: '#24343b', roughness: .48, metalness: .42 }), 0, .018, -.06);
    part(.066, .014, .26, goldTrim, 0, .036, -.12);
    // Bolt handle + brass sphere knob
    part(.045, .010, .012, metal, .045, .036, .02, 0, 0, -.25);
    const knob = new T.Mesh(new T.SphereGeometry(.013, 8, 8), goldTrim);
    knob.position.set(.068, .030, .02);
    g.add(knob);
    // Folded forward bipod legs under chassis
    for (const s of [-1, 1]) {
      const leg = new T.Mesh(new T.CylinderGeometry(.006, .006, .20, 6), metal);
      leg.rotation.x = Math.PI / 2;
      leg.position.set(s * .026, -.026, -.28);
      g.add(leg);
    }
    const barrel = new T.Mesh(new T.CylinderGeometry(.016, .020, .54, 10), darkMetal);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, .036, -.52);
    g.add(barrel);
    const brake = part(.044, .036, .082, goldTrim, 0, .036, -.80);
    brake.castShadow = false;
    muzzleZ = -.85;
    // Long sniper scope tube + brass scope rings + sapphire objective lens
    const scope = new T.Mesh(new T.CylinderGeometry(.024, .020, .30, 12), darkMetal);
    scope.rotation.x = Math.PI / 2;
    scope.position.set(0, .105, -.07);
    g.add(scope);
    for (const rz of [-.01, -.14]) {
      part(.052, .042, .018, goldTrim, 0, .092, rz);
    }
    const scopeBell = new T.Mesh(new T.CylinderGeometry(.032, .024, .08, 12), darkMetal);
    scopeBell.rotation.x = Math.PI / 2;
    scopeBell.position.set(0, .105, -.25);
    g.add(scopeBell);
    const objLens = new T.Mesh(new T.CylinderGeometry(.028, .028, .006, 12), lensMat);
    objLens.rotation.x = Math.PI / 2;
    objLens.position.set(0, .105, -.291);
    g.add(objLens);
    part(.048, .09, .24, woodGrip, 0, .005, .24);
    part(.052, .026, .14, goldTrim, 0, .056, .23);         // Adjustable cheek rest
    part(.038, .12, .048, woodGrip, 0, -.065, .09, .26);
    mag = part(.036, .11, .075, darkMetal, 0, -.065, -.09, -.05);
  }

  // First-person gloved tactical hands & sleeves gripping the weapon
  part(.056, .056, .085, gloveMat, .01, -.065, .075, .22);              // Right trigger hand
  part(.068, .068, .22, sleeveMat, .06, -.12, .22, .32, -.28);           // Right forearm
  part(.058, .052, .09, gloveMat, -.025, -.025, -.22, 0, .25);           // Left support hand
  part(.068, .068, .26, sleeveMat, -.13, -.10, -.05, .18, .52);          // Left forearm

  // Muzzle flash star (HDR bright for URP Bloom!)
  const flashGroup = new T.Group();
  flashGroup.position.set(0, .03, muzzleZ);
  flashGroup.visible = false;
  const fMat = new T.MeshBasicMaterial({ color: new T.Color(2.8, 2.2, 1.25), transparent: true, opacity: .94, blending: T.AdditiveBlending, depthWrite: false });
  const f1 = new T.Mesh(new T.OctahedronGeometry(.085, 0), fMat);
  f1.scale.set(1, 1, 2.2);
  const f2 = new T.Mesh(new T.PlaneGeometry(.24, .24), fMat);
  flashGroup.add(f1, f2);
  g.add(flashGroup);

  return { group: g, mag, magBaseY: mag.position.y, flashGroup, muzzleLocal: new T.Vector3(0, .03, muzzleZ) };
}

export function createWeaponSystem(camera, scene) {
  const rig = new T.Group();
  rig.name = 'fps-weapon-rig';
  camera.add(rig);

  // Subtle dynamic light emitted at muzzle when firing to illuminate dark Gothic stone!
  const muzzleLight = new T.PointLight('#ffbe66', 0, 14, 1.8);
  muzzleLight.position.set(.15, -.1, -.9);
  camera.add(muzzleLight);

  const models = {};
  for (const w of WEAPONS) {
    const built = buildWeaponMesh(w.id);
    built.group.visible = false;
    rig.add(built.group);
    models[w.id] = built;
  }

  let currentIndex = 0;
  const ammo = WEAPONS.map(w => w.mag);
  let fireCooldown = 0;
  let reloadTimer = 0;
  let reloadTotal = 1;
  let adsBlend = 0;
  let recoilZ = 0, recoilPitch = 0;
  let swayX = 0, swayY = 0;
  let bobPhase = 0;
  let flashTimer = 0;
  let switchDip = 0;

  // Effects pools (tracers, impact sparks, bullet-hole decals)
  const fxGroup = new T.Group();
  scene.add(fxGroup);
  const tracers = [];
  const sparks = [];
  const decals = [];
  const decalGeo = new T.PlaneGeometry(.14, .14);
  const decalMat = new T.MeshBasicMaterial({ color: '#0d1014', transparent: true, opacity: .78, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 });
  const sparkGeo = new T.BoxGeometry(.045, .045, .045);

  function selectWeapon(idx) {
    const next = ((idx % WEAPONS.length) + WEAPONS.length) % WEAPONS.length;
    for (const w of WEAPONS) models[w.id].group.visible = false;
    currentIndex = next;
    models[WEAPONS[currentIndex].id].group.visible = true;
    reloadTimer = 0;
    fireCooldown = .18;
    switchDip = 1;
    return WEAPONS[currentIndex];
  }
  selectWeapon(0);

  function resetAmmo() {
    for (let i = 0; i < WEAPONS.length; i++) ammo[i] = WEAPONS[i].mag;
    reloadTimer = 0;
    fireCooldown = 0;
  }

  function startReload() {
    const w = WEAPONS[currentIndex];
    if (reloadTimer > 0 || ammo[currentIndex] >= w.mag) return false;
    reloadTimer = w.reloadSec;
    reloadTotal = w.reloadSec;
    return true;
  }

  function canFire() {
    return fireCooldown <= 0 && reloadTimer <= 0 && ammo[currentIndex] > 0;
  }

  function consumeShot() {
    const w = WEAPONS[currentIndex];
    ammo[currentIndex] = Math.max(0, ammo[currentIndex] - 1);
    fireCooldown = 60 / w.rpm;
    recoilZ = Math.min(.14, recoilZ + (w.id === 'sniper' ? .12 : .042));
    recoilPitch = Math.min(.22, recoilPitch + w.recoilPitch * 2.6);
    flashTimer = .055;
    muzzleLight.intensity = w.id === 'sniper' ? 22 : 14;
    const m = models[w.id];
    m.flashGroup.visible = true;
    m.flashGroup.rotation.z = Math.random() * Math.PI * 2;
    return w;
  }

  function getMuzzleWorld() {
    const m = models[WEAPONS[currentIndex].id];
    m.group.updateWorldMatrix(true, false);
    return m.muzzleLocal.clone().applyMatrix4(m.group.matrixWorld);
  }

  function spawnTracer(from, to, color = '#ffe39c') {
    const geo = new T.BufferGeometry().setFromPoints([from, to]);
    const mat = new T.LineBasicMaterial({ color, transparent: true, opacity: .88 });
    const line = new T.Line(geo, mat);
    fxGroup.add(line);
    tracers.push({ line, life: .09, max: .09 });
  }

  function spawnImpact(point, normal, isBlood = false) {
    const color = isBlood ? '#ff4f42' : '#ffcf84';
    for (let i = 0; i < (isBlood ? 6 : 5); i++) {
      const m = new T.Mesh(sparkGeo, new T.MeshBasicMaterial({ color, transparent: true, opacity: .95 }));
      m.position.copy(point);
      const vx = normal.x * (2 + Math.random() * 3) + (Math.random() - .5) * 4.5;
      const vy = normal.y * (2 + Math.random() * 3) + Math.random() * 3.2;
      const vz = normal.z * (2 + Math.random() * 3) + (Math.random() - .5) * 4.5;
      fxGroup.add(m);
      sparks.push({ mesh: m, vx, vy, vz, life: .28 + Math.random() * .16 });
    }
    if (!isBlood) {
      const d = new T.Mesh(decalGeo, decalMat);
      d.position.copy(point).addScaledVector(normal, .016);
      d.lookAt(point.clone().add(normal));
      fxGroup.add(d);
      decals.push(d);
      if (decals.length > 48) {
        const old = decals.shift();
        fxGroup.remove(old);
      }
    }
  }

  function addLookSway(dx, dy) {
    swayX = T.MathUtils.clamp(swayX - dx * .00028, -.035, .035);
    swayY = T.MathUtils.clamp(swayY + dy * .00028, -.028, .028);
  }

  function update(dt, { speed = 0, sprinting = false, grounded = true, aiming = false, reducedMotion = false, visible = true }) {
    const w = WEAPONS[currentIndex];
    const m = models[w.id];

    if (fireCooldown > 0) fireCooldown = Math.max(0, fireCooldown - dt);
    let reloadDone = false;
    if (reloadTimer > 0) {
      reloadTimer = Math.max(0, reloadTimer - dt);
      if (reloadTimer === 0) {
        ammo[currentIndex] = w.mag;
        reloadDone = true;
      }
    }

    if (flashTimer > 0) {
      flashTimer = Math.max(0, flashTimer - dt);
      if (flashTimer === 0) {
        m.flashGroup.visible = false;
        muzzleLight.intensity = 0;
      }
    }

    const targetAds = aiming && reloadTimer <= 0 && !sprinting ? 1 : 0;
    adsBlend += (targetAds - adsBlend) * Math.min(1, dt * 15);
    switchDip = Math.max(0, switchDip - dt * 5.2);
    recoilZ *= Math.exp(-15 * dt);
    recoilPitch *= Math.exp(-12 * dt);
    swayX *= Math.exp(-10 * dt);
    swayY *= Math.exp(-10 * dt);

    // Hide 3D weapon in lobby/death or when zoomed into 2D optical sniper scope overlay
    rig.visible = visible && !(w.scoped && adsBlend > .72);

    const amp = grounded && speed > .4 && !reducedMotion ? Math.min(1, speed / 10) * (1 - adsBlend * .78) : 0;
    if (amp > .01) bobPhase += dt * (sprinting ? 11.5 : 8.2);
    const bx = Math.cos(bobPhase * .5) * .014 * amp;
    const by = Math.abs(Math.sin(bobPhase)) * -.015 * amp;

    const px = T.MathUtils.lerp(w.hipPos[0], w.adsPos[0], adsBlend) + bx + swayX * (1 - adsBlend * .65);
    const py = T.MathUtils.lerp(w.hipPos[1], w.adsPos[1], adsBlend) + by + swayY * (1 - adsBlend * .65) - switchDip * .22;
    const pz = T.MathUtils.lerp(w.hipPos[2], w.adsPos[2], adsBlend) + recoilZ;
    rig.position.set(px, py, pz);

    // Reload tilt + sprint diagonal cant + recoil climb
    const reloadPhase = reloadTimer > 0 ? Math.sin((1 - reloadTimer / reloadTotal) * Math.PI) : 0;
    const sprintCant = sprinting && adsBlend < .2 && reloadTimer <= 0 ? 1 : 0;
    rig.rotation.set(
      recoilPitch - reloadPhase * .38 - sprintCant * .18 - switchDip * .35,
      sprintCant * .36 + reloadPhase * .22,
      reloadPhase * .34 - sprintCant * .16 - swayX * 2.2
    );
    m.mag.position.y = m.magBaseY - reloadPhase * .18;

    // Update tracers & sparks
    for (let i = tracers.length - 1; i >= 0; i--) {
      const tr = tracers[i];
      tr.life -= dt;
      if (tr.life <= 0) {
        fxGroup.remove(tr.line);
        tr.line.geometry.dispose();
        tr.line.material.dispose();
        tracers.splice(i, 1);
      } else {
        tr.line.material.opacity = tr.life / tr.max;
      }
    }
    for (let i = sparks.length - 1; i >= 0; i--) {
      const sp = sparks[i];
      sp.life -= dt;
      if (sp.life <= 0) {
        fxGroup.remove(sp.mesh);
        sp.mesh.material.dispose();
        sparks.splice(i, 1);
      } else {
        sp.vy -= 14 * dt;
        sp.mesh.position.x += sp.vx * dt;
        sp.mesh.position.y += sp.vy * dt;
        sp.mesh.position.z += sp.vz * dt;
        sp.mesh.material.opacity = Math.min(1, sp.life * 3.5);
      }
    }

    return {
      weapon: w,
      ammo: ammo[currentIndex],
      reloading: reloadTimer > 0,
      reloadProgress: reloadTimer > 0 ? 1 - reloadTimer / reloadTotal : 0,
      reloadDone,
      adsBlend,
      scopedView: w.scoped && adsBlend > .72
    };
  }

  return {
    selectWeapon, resetAmmo, startReload, canFire, consumeShot,
    getMuzzleWorld, spawnTracer, spawnImpact, addLookSway, update,
    get current() { return WEAPONS[currentIndex]; },
    get currentIndex() { return currentIndex; },
    get currentAmmo() { return ammo[currentIndex]; },
    get isReloading() { return reloadTimer > 0; }
  };
}
