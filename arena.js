import * as T from 'three';

// 3-Lane Gothic Cathedral & Ancient Crypt FPS Arena (Identity V Red Church / Cemetery aesthetic).
// Unified single source of truth for 3D meshes, AABB collisions, walkable ramps, analytical bullet
// raycasts, 2D radar floorplan, and AI navigation waypoints.

export function createGothicArena(scene, mats) {
  const group = new T.Group();
  group.name = 'gothic-arena';
  scene.add(group);

  const colliders = []; // { minX, maxX, minY, maxY, minZ, maxZ, tag }
  const ramps = [];     // { minX, maxX, minZ, maxZ, y0, y1, axis: 'z'|'x' }
  const radarShapes = []; // { x, z, w, d, kind }
  const lanterns = [];  // { light, halo, baseIntensity, phase }

  function addBox(x, y, z, w, h, d, mat, { collide = true, cast = true, receive = true, tag = 'stone', radar = null } = {}) {
    const mesh = new T.Mesh(new T.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y + h / 2, z);
    mesh.castShadow = cast;
    mesh.receiveShadow = receive;
    group.add(mesh);
    if (collide) {
      colliders.push({
        minX: x - w / 2, maxX: x + w / 2,
        minY: y, maxY: y + h,
        minZ: z - d / 2, maxZ: z + d / 2,
        tag
      });
    }
    if (radar) radarShapes.push({ x, z, w, d, kind: radar });
    return mesh;
  }

  // Smooth walkable stone staircase/ramp (visual stepped stone + smooth ramp height query)
  function addRamp(x, z, w, d, y0, y1, axis = 'z', mat = mats.cryptStone) {
    ramps.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, y0, y1, axis });
    const steps = 8;
    for (let i = 0; i < steps; i++) {
      const t = (i + .5) / steps;
      const h = Math.max(.14, y0 + (y1 - y0) * ((i + 1) / steps));
      if (axis === 'z') {
        const sz = z - d / 2 + d * t;
        const m = new T.Mesh(new T.BoxGeometry(w, h, d / steps + .03), mat);
        m.position.set(x, h / 2, sz);
        m.castShadow = true;
        m.receiveShadow = true;
        group.add(m);
      } else {
        const sx = x - w / 2 + w * t;
        const m = new T.Mesh(new T.BoxGeometry(w / steps + .03, h, d), mat);
        m.position.set(sx, h / 2, z);
        m.castShadow = true;
        m.receiveShadow = true;
        group.add(m);
      }
    }
    radarShapes.push({ x, z, w, d, kind: 'ramp' });
  }

  // Pointed Gothic arch lintel (sleek ribbed gothic arch cleanly framed under rose window)
  function addGothicArch(x, z, span, height, depth, rotY, mat = mats.redBrick) {
    const g = new T.Group();
    g.position.set(x, 0, z);
    g.rotation.y = rotY;
    const half = span / 2;
    const beamLen = half * 1.12;
    for (const s of [-1, 1]) {
      const arch = new T.Mesh(new T.BoxGeometry(beamLen, .42, depth), mat);
      arch.position.set(s * half * .49, height + .45, 0);
      arch.rotation.z = -s * .38;
      arch.castShadow = true;
      arch.receiveShadow = true;
      g.add(arch);
    }
    const keystone = new T.Mesh(new T.BoxGeometry(.56, .76, depth + .16), mats.trimStone);
    keystone.position.set(0, height + 1.05, 0);
    g.add(keystone);
    group.add(g);
  }

  // Gothic wrought-iron lamp post with warm amber glow & ground pool
  function addLantern(x, z, height = 4.4, withPointLight = false) {
    const post = new T.Mesh(new T.CylinderGeometry(.08, .12, height, 8), mats.iron);
    post.position.set(x, height / 2, z);
    post.castShadow = true;
    group.add(post);

    const base = new T.Mesh(new T.CylinderGeometry(.24, .32, .55, 8), mats.cryptStone);
    base.position.set(x, .275, z);
    group.add(base);

    const cap = new T.Mesh(new T.ConeGeometry(.38, .36, 6), mats.iron);
    cap.position.set(x, height + .42, z);
    group.add(cap);

    const glass = new T.Mesh(new T.CylinderGeometry(.22, .16, .48, 6), mats.lanternGlow);
    glass.position.set(x, height + .04, z);
    group.add(glass);

    const poolGeo = new T.PlaneGeometry(7.8, 7.8);
    poolGeo.rotateX(-Math.PI / 2);
    const pool = new T.Mesh(poolGeo, mats.lanternPool);
    pool.position.set(x, .03, z);
    group.add(pool);

    let light = null;
    if (withPointLight) {
      light = new T.PointLight('#ffaa52', 24, 26, 1.55);
      light.position.set(x, height + .1, z);
      group.add(light);
    }
    lanterns.push({ light, glass, baseIntensity: 24, phase: (x * .37 + z * .51) });
  }

  // Twisted dead Gothic tree (signature Identity V cemetery mood!)
  function addDeadTree(x, z, scale = 1, seed = 1) {
    const g = new T.Group();
    g.position.set(x, 0, z);
    g.rotation.y = seed * 2.1;
    const seg = (len, r0, r1, px, py, pz, rx, rz) => {
      const m = new T.Mesh(new T.CylinderGeometry(r1, r0, len, 6), mats.bark);
      m.position.set(px, py, pz);
      m.rotation.set(rx, 0, rz);
      m.castShadow = true;
      g.add(m);
    };
    seg(3.6 * scale, .34 * scale, .20 * scale, 0, 1.8 * scale, 0, .06, .08);
    seg(2.8 * scale, .19 * scale, .09 * scale, -.7 * scale, 4.1 * scale, .2 * scale, .18, .55);
    seg(2.6 * scale, .18 * scale, .08 * scale, .8 * scale, 4.0 * scale, -.3 * scale, -.22, -.52);
    seg(2.1 * scale, .11 * scale, .04 * scale, -1.6 * scale, 5.2 * scale, .55 * scale, .32, .85);
    seg(1.9 * scale, .10 * scale, .04 * scale, 1.65 * scale, 5.1 * scale, -.7 * scale, -.28, -.78);
    seg(1.7 * scale, .12 * scale, .05 * scale, .15 * scale, 4.7 * scale, .65 * scale, .55, -.12);
    group.add(g);
  }

  // Weathered Gothic tombstone / Celtic cross
  function addTombstone(x, z, rotY = 0, cross = false) {
    const g = new T.Group();
    g.position.set(x, 0, z);
    g.rotation.set((Math.sin(x) * .06), rotY, Math.cos(z) * .07);
    if (cross) {
      const v = new T.Mesh(new T.BoxGeometry(.28, 1.55, .18), mats.tombStone);
      v.position.y = .78; v.castShadow = true; v.receiveShadow = true;
      const h = new T.Mesh(new T.BoxGeometry(.92, .24, .18), mats.tombStone);
      h.position.y = 1.15; h.castShadow = true;
      const ring = new T.Mesh(new T.TorusGeometry(.24, .055, 6, 12), mats.tombStone);
      ring.position.y = 1.15;
      g.add(v, h, ring);
    } else {
      const plinth = new T.Mesh(new T.BoxGeometry(.96, .22, .42), mats.cryptStone);
      plinth.position.y = .11;
      const slab = new T.Mesh(new T.BoxGeometry(.76, 1.05, .20), mats.tombStone);
      slab.position.y = .74; slab.castShadow = true; slab.receiveShadow = true;
      const top = new T.Mesh(new T.CylinderGeometry(.38, .38, .20, 10), mats.tombStone);
      top.rotation.x = Math.PI / 2;
      top.position.y = 1.24; top.castShadow = true;
      g.add(plinth, slab, top);
    }
    group.add(g);
  }

  // Carved Gothic stone sarcophagus (waist-high jumpable tactical cover!)
  function addSarcophagus(x, z, w = 1.55, d = 2.85) {
    addBox(x, 0, z, w, 1.05, d, mats.cryptStone, { tag: 'stone', radar: 'cover' });
    // Sculpted beveled lid
    const lid = new T.Mesh(new T.BoxGeometry(w + .18, .22, d + .18), mats.trimStone);
    lid.position.set(x, 1.12, z);
    lid.castShadow = true; lid.receiveShadow = true;
    group.add(lid);
    const crossV = new T.Mesh(new T.BoxGeometry(.18, .08, d * .55), mats.tombStone);
    crossV.position.set(x, 1.25, z);
    const crossH = new T.Mesh(new T.BoxGeometry(w * .52, .08, .18), mats.tombStone);
    crossH.position.set(x, 1.25, z - d * .12);
    group.add(crossV, crossH);
  }

  // Ornate Cemetery Mausoleum (solid stone crypt cover with mossy pitched roof & cross spire)
  function addMausoleum(x, z, w = 5.4, h = 4.4, d = 6.2) {
    addBox(x, 0, z, w, h, d, mats.cryptStone, { tag: 'stone', radar: 'wall' });
    // Pitched slate roof
    const roof = new T.Mesh(new T.ConeGeometry(Math.hypot(w, d) * .52, 2.3, 4), mats.roofSlate);
    roof.position.set(x, h + 1.15, z);
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    group.add(roof);
    // Decorative recessed iron crypt door facing center nave
    const doorDir = x < 0 ? 1 : -1;
    const door = new T.Mesh(new T.BoxGeometry(.16, 2.6, 1.8), mats.iron);
    door.position.set(x + doorDir * (w / 2 + .04), 1.3, z);
    group.add(door);
    const spire = new T.Mesh(new T.BoxGeometry(.16, 1.1, .16), mats.iron);
    spire.position.set(x, h + 2.6, z);
    const spireBar = new T.Mesh(new T.BoxGeometry(.6, .12, .12), mats.iron);
    spireBar.position.set(x, h + 2.8, z);
    group.add(spire, spireBar);
  }

  // =========================================================================
  // 1. GROUND & PERIMETER WROUGHT-IRON CEMETERY WALLS
  // =========================================================================
  const floor = new T.Mesh(new T.PlaneGeometry(160, 160), mats.ground);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  group.add(floor);

  // Mossy dark cemetery earth patch in West Lane
  const westSoil = new T.Mesh(new T.PlaneGeometry(19, 62), mats.cemeteryDirt);
  westSoil.rotation.x = -Math.PI / 2;
  westSoil.position.set(-26, .012, 0);
  westSoil.receiveShadow = true;
  group.add(westSoil);

  // Outer perimeter courtyard walls (stone plinth + wrought-iron spiked fence rails)
  const B = 37;
  addBox(0, 0, -B, 76, 5.2, 1.6, mats.cryptStone, { tag: 'wall', radar: 'wall' });
  addBox(0, 0, B, 76, 5.2, 1.6, mats.cryptStone, { tag: 'wall', radar: 'wall' });
  addBox(-B, 0, 0, 1.6, 5.2, 76, mats.cryptStone, { tag: 'wall', radar: 'wall' });
  addBox(B, 0, 0, 1.6, 5.2, 76, mats.cryptStone, { tag: 'wall', radar: 'wall' });

  // Stone piers & spiked iron crests along the perimeter walls
  for (let p = -32; p <= 32; p += 8) {
    for (const [px, pz] of [[p, -B], [p, B], [-B, p], [B, p]]) {
      const pier = new T.Mesh(new T.BoxGeometry(2.1, 6.4, 2.1), mats.trimStone);
      pier.position.set(px, 3.2, pz);
      pier.castShadow = true;
      group.add(pier);
      const finial = new T.Mesh(new T.ConeGeometry(.55, 1.1, 4), mats.iron);
      finial.position.set(px, 6.95, pz);
      group.add(finial);
    }
    if (p < 32) {
      const mid = p + 4;
      for (const sz of [-B, B]) {
        const rail = new T.Mesh(new T.BoxGeometry(6.2, .12, .12), mats.iron);
        rail.position.set(mid, 6.15, sz);
        group.add(rail);
      }
      for (const sx of [-B, B]) {
        const rail = new T.Mesh(new T.BoxGeometry(.12, .12, 6.2), mats.iron);
        rail.position.set(sx, 6.15, mid);
        group.add(rail);
      }
      for (let k = -2; k <= 2; k++) {
        const off = mid + k * 1.15;
        for (const sz of [-B, B]) {
          const spear = new T.Mesh(new T.CylinderGeometry(.04, .05, 1.35, 6), mats.iron);
          spear.position.set(off, 5.85, sz);
          group.add(spear);
        }
        for (const sx of [-B, B]) {
          const spear = new T.Mesh(new T.CylinderGeometry(.04, .05, 1.35, 6), mats.iron);
          spear.position.set(sx, 5.85, off);
          group.add(spear);
        }
      }
    }
  }

  // =========================================================================
  // 2. CENTER LANDMARK: RUINED RED CATHEDRAL NAVE (破损红教堂中殿)
  // =========================================================================
  // Vaulted open-sky pointed Gothic ceiling ribs spanning across the Red Cathedral Nave
  for (const rz of [-10.2, -4.6, 4.6, 10.2]) {
    addGothicArch(0, rz, 28.0, 7.6, .62, 0, mats.trimStone);
  }

  // West & East Red-Brick Nave Walls with 5.4m central pointed archways (z in [-2.7, 2.7] open!)
  for (const sx of [-14.5, 14.5]) {
    addBox(sx, 0, -9.2, 1.6, 7.6, 12.6, mats.redBrick, { tag: 'brick', radar: 'wall' });
    addBox(sx, 0, 9.2, 1.6, 7.6, 12.6, mats.redBrick, { tag: 'brick', radar: 'wall' });
    // Upper lintel bridge above the central 5.4m archway (walkable underneath!)
    addBox(sx, 5.2, 0, 1.7, 2.8, 6.2, mats.redBrick, { collide: true, tag: 'brick' });
    addGothicArch(sx, 0, 5.4, 4.8, 1.8, Math.PI / 2, mats.trimStone);

    // Glowing Gothic lancet stained-glass windows inset along the nave walls
    for (const wz of [-10.5, -6.5, 6.5, 10.5]) {
      const win = new T.Mesh(new T.BoxGeometry(1.72, 3.4, 1.35), mats.stainedGlassLancet || mats.stainedGlass);
      win.position.set(sx, 4.4, wz);
      group.add(win);
      const frame = new T.Mesh(new T.BoxGeometry(1.82, .24, 1.65), mats.trimStone);
      frame.position.set(sx, 2.65, wz);
      group.add(frame);
    }
    // Flying buttress piers
    for (const bz of [-15, -3.4, 3.4, 15]) {
      addBox(sx + (sx < 0 ? -1.1 : 1.1), 0, bz, 1.1, 6.6, 1.1, mats.trimStone, { tag: 'stone' });
    }
  }

  // North & South Cathedral Facades with wide 9m grand portals & towering Rose Window Bell Gables!
  for (const sz of [-15.2, 15.2]) {
    // Left & right flanking brick towers
    addBox(-9.8, 0, sz, 9.6, 9.2, 1.6, mats.redBrick, { tag: 'brick', radar: 'wall' });
    addBox(9.8, 0, sz, 9.6, 9.2, 1.6, mats.redBrick, { tag: 'brick', radar: 'wall' });
    // Grand overhead bridge & pointed cathedral gable rising 18m into the moonlight
    addBox(0, 6.2, sz, 11.4, 5.4, 1.7, mats.redBrick, { collide: true, tag: 'brick' });
    addBox(0, 6.05, sz, 11.8, .32, 1.95, mats.trimStone, { collide: false });
    addGothicArch(0, sz, 9.4, 4.75, 1.9, 0, mats.trimStone);

    const gable = new T.Mesh(new T.ConeGeometry(8.2, 6.6, 4), mats.redBrick);
    gable.position.set(0, 14.8, sz);
    gable.rotation.y = Math.PI / 4;
    gable.scale.set(1.1, 1, .16);
    gable.castShadow = true;
    group.add(gable);

    // Iconic Illuminated Stained-Glass Rose Window cleanly framed above the stone cornice!
    const rose = new T.Mesh(new T.CylinderGeometry(2.15, 2.15, 1.88, 24), mats.stainedGlassRose || mats.stainedGlass);
    rose.rotation.x = Math.PI / 2;
    rose.position.set(0, 9.15, sz);
    group.add(rose);
    const roseRing = new T.Mesh(new T.TorusGeometry(2.22, .20, 8, 24), mats.trimStone);
    roseRing.position.set(0, 9.15, sz + (sz > 0 ? .92 : -.92));
    group.add(roseRing);

    // Warm crimson/gold stained-glass bounce light inside the cathedral nave
    const roseLight = new T.PointLight('#f27a63', 26, 26, 1.5);
    roseLight.position.set(0, 8.6, sz + (sz > 0 ? -2.2 : 2.2));
    group.add(roseLight);

    // Roofline cross pinnacle
    const cV = new T.Mesh(new T.BoxGeometry(.24, 2.4, .24), mats.iron);
    cV.position.set(0, 18.8, sz);
    const cH = new T.Mesh(new T.BoxGeometry(1.25, .20, .20), mats.iron);
    cH.position.set(0, 19.2, sz);
    group.add(cV, cH);
  }

  // Elevated Central Altar Sanctuary Platform (y = 2.0m, reachable via North & South stone stairs!)
  addBox(0, 0, 0, 10.6, 2.0, 8.2, mats.cryptStone, { tag: 'stone', radar: 'platform' });
  addRamp(0, 6.6, 4.4, 5.0, 2.0, 0, 'z', mats.cryptStone);   // South stairs up to Altar
  addRamp(0, -6.6, 4.4, 5.0, 0, 2.0, 'z', mats.cryptStone);  // North stairs up to Altar
  // Half-height Gothic stone balustrades on East & West sides of Altar deck (high-ground cover!)
  addBox(-4.95, 2.0, 0, .55, 1.05, 7.6, mats.trimStone, { tag: 'stone' });
  addBox(4.95, 2.0, 0, .55, 1.05, 7.6, mats.trimStone, { tag: 'stone' });
  // Altar stone relic centerpiece (peek cover on top of platform)
  addBox(0, 2.0, 0, 2.4, 1.1, 1.4, mats.tombStone, { tag: 'stone', radar: 'cover' });

  // Crimson cathedral velvet runner carpet on top of Altar Sanctuary & gold chalice cross
  const altarCarpet = new T.Mesh(new T.BoxGeometry(2.6, .04, 7.8), mats.crimsonCarpet || mats.redBrick);
  altarCarpet.position.set(0, 2.02, 0);
  altarCarpet.receiveShadow = true;
  group.add(altarCarpet);

  const relicCrossV = new T.Mesh(new T.BoxGeometry(.12, .68, .12), mats.goldRelic || mats.trimStone);
  relicCrossV.position.set(0, 3.44, 0);
  const relicCrossH = new T.Mesh(new T.BoxGeometry(.42, .11, .11), mats.goldRelic || mats.trimStone);
  relicCrossH.position.set(0, 3.55, 0);
  group.add(relicCrossV, relicCrossH);

  // 6 flickering wax candles around the Altar centerpiece + warm candle point light
  const candleFlames = [];
  for (const [cx, cz] of [[-0.95, -0.45], [-0.95, 0.45], [0.95, -0.45], [0.95, 0.45], [-0.55, 0], [0.55, 0]]) {
    const wax = new T.Mesh(new T.CylinderGeometry(.045, .052, .32, 8), mats.candleWax || mats.trimStone);
    wax.position.set(cx, 3.26, cz);
    const flame = new T.Mesh(new T.SphereGeometry(.055, 6, 6), mats.candleFlame || mats.lanternGlow);
    flame.scale.set(.75, 1.65, .75);
    flame.position.set(cx, 3.48, cz);
    group.add(wax, flame);
    candleFlames.push({ flame, baseY: 3.48, phase: cx * 3.1 + cz * 4.7 });
  }
  const altarLight = new T.PointLight('#ffaa48', 22, 18, 1.5);
  altarLight.position.set(0, 3.85, 0);
  group.add(altarLight);
  lanterns.push({ light: altarLight, glass: null, baseIntensity: 22, phase: 1.7 });

  // Volumetric slanted Moonbeam God-Rays streaming from the Rose Windows & Cathedral Vaults
  if (mats.moonBeamMat) {
    for (const [bx, by, bz, w, h, rx, ry, rz] of [
      [-1.5, 6.2, 6.8, 5.2, 11.5, -0.42, 0.22, -0.14],
      [ 1.5, 6.2, -6.8, 5.2, 11.5,  0.42, -0.22, 0.14],
      [ 0.0, 5.8, 0.0, 6.4, 10.5,  0.24, 0.35, -0.18],
    ]) {
      const beam = new T.Mesh(new T.PlaneGeometry(w, h), mats.moonBeamMat);
      beam.position.set(bx, by, bz);
      beam.rotation.set(rx, ry, rz);
      group.add(beam);
    }
  }

  // Weathered Wooden Church Pews inside the Nave (waist-high jumpable FPS cover!)
  for (const [px, pz] of [[-9.4, -7.8], [-9.4, 7.8], [9.4, -7.8], [9.4, 7.8]]) {
    addBox(px, 0, pz, 4.2, 1.02, 1.15, mats.darkWood, { tag: 'wood', radar: 'cover' });
  }

  // =========================================================================
  // 3. WEST LANE: MISTY ANCIENT CEMETERY (雾林古墓园)
  // =========================================================================
  addMausoleum(-25.8, -11.5, 5.2, 4.2, 5.8);
  addMausoleum(-25.8, 11.5, 5.2, 4.2, 5.8);
  addSarcophagus(-25.5, 0, 1.7, 3.2);
  addSarcophagus(-19.5, -20.5, 2.9, 1.6);
  addSarcophagus(-19.5, 20.5, 2.9, 1.6);
  addSarcophagus(-31.5, -2.5, 1.6, 2.8);
  addSarcophagus(-31.5, 4.5, 1.6, 2.8);

  // Scattered atmospheric gravestones & Celtic crosses (visual atmosphere + edges)
  for (const [tx, tz, r, cross] of [
    [-21, -5.5, .2, true], [-21.5, 5.5, -.3, false], [-32.5, -18, .4, true],
    [-33, -14, -.15, false], [-32.8, 15, .25, false], [-32.2, 19, -.35, true],
    [-29.5, -22, .12, false], [-29.5, 22, -.2, true], [-19.5, -11, .3, false],
    [-19.5, 11, -.25, false], [-33.5, -7, .1, true], [-33.5, 8.5, -.18, false]
  ]) addTombstone(tx, tz, r, cross);

  // Twisted dead trees silhouetted against the harvest moon
  addDeadTree(-32.5, -26.5, 1.15, 1);
  addDeadTree(-33.0, 26.5, 1.10, 2);
  addDeadTree(-21.0, -28.0, .95, 3);
  addDeadTree(-21.0, 28.0, .98, 4);
  addDeadTree(-33.8, 0.5, 1.05, 5);

  // =========================================================================
  // 4. EAST LANE: SUNKEN CRYPT CLOISTER (古墓石棺回廊)
  // =========================================================================
  // Elevated Crypt Catwalk Balcony overlooking East Lane & Mid Arch (y = 2.2m)
  addBox(31.8, 0, 0, 6.2, 2.2, 11.4, mats.cryptStone, { tag: 'stone', radar: 'platform' });
  addRamp(31.8, 8.2, 4.0, 5.2, 2.2, 0, 'z', mats.cryptStone);   // South steps up
  addRamp(31.8, -8.2, 4.0, 5.2, 0, 2.2, 'z', mats.cryptStone);  // North steps up
  addBox(28.95, 2.2, 0, .55, 1.05, 10.8, mats.trimStone, { tag: 'stone' }); // Balcony cover parapet

  // Ribbed Gothic Stone Colonnade running along x = 22.8
  for (const cz of [-21, -13, -5, 5, 13, 21]) {
    addBox(22.8, 0, cz, 1.5, 6.2, 1.5, mats.cryptStone, { tag: 'stone', radar: 'wall' });
  }
  addBox(22.8, 5.8, 0, 1.7, 1.2, 44, mats.redBrick, { collide: true, tag: 'brick' });
  for (const az of [-17, -9, 0, 9, 17]) {
    addGothicArch(22.8, az, az === 0 ? 8.5 : 6.5, 5.3, 1.6, Math.PI / 2, mats.trimStone);
  }

  // East flank stone coffins & wooden relic crates
  addSarcophagus(19.2, -16.5, 1.6, 2.8);
  addSarcophagus(19.2, 16.5, 1.6, 2.8);
  addBox(26.5, 0, -18.5, 2.4, 1.25, 2.4, mats.darkWood, { tag: 'wood', radar: 'cover' });
  addBox(26.5, 0, 18.5, 2.4, 1.25, 2.4, mats.darkWood, { tag: 'wood', radar: 'cover' });
  addBox(19.5, 0, 0, 1.8, 1.2, 2.8, mats.darkWood, { tag: 'wood', radar: 'cover' });

  // =========================================================================
  // 5. SOUTH (BLUE) & NORTH (RED) SPAWN SANCTUARIES
  // =========================================================================
  for (const sz of [27.5, -27.5]) {
    // Twin spawn cover bastions & flanking stone sarcophagi (keeps center cathedral sightline open!)
    addBox(-8.2, 0, sz, 5.2, 3.6, 1.5, mats.cryptStone, { tag: 'stone', radar: 'wall' });
    addBox(8.2, 0, sz, 5.2, 3.6, 1.5, mats.cryptStone, { tag: 'stone', radar: 'wall' });
    addSarcophagus(-4.6, sz + (sz > 0 ? -4.2 : 4.2), 2.5, 1.35);
    addSarcophagus(4.6, sz + (sz > 0 ? -4.2 : 4.2), 2.5, 1.35);
  }

  // =========================================================================
  // 6. WARM WROUGHT-IRON LANTERNS (Flanking walkways, never blocking center aim!)
  // =========================================================================
  addLantern(-4.8, 11.4, 4.6, true);    // South Cathedral Nave left
  addLantern(4.8, -11.4, 4.6, true);    // North Cathedral Nave right
  addLantern(-22.5, 0, 4.4, true);      // West Cemetery Center
  addLantern(25.2, 0, 4.6, true);       // East Crypt Cloister Center
  addLantern(-5.2, 28.5, 4.5, true);    // Blue Spawn Portico flank
  addLantern(5.2, -28.5, 4.5, true);    // Red Spawn Ossuary flank

  // Extra pool-only lanterns symmetrically paired for crisp nocturnal guidance
  for (const [lx, lz] of [
    [4.8, 11.4], [-4.8, -11.4], [5.2, 28.5], [-5.2, -28.5],
    [-12, 22], [12, 22], [-12, -22], [12, -22],
    [-28, -20], [-28, 20], [28, -20], [28, 20],
    [-7.5, 0], [7.5, 0]
  ]) addLantern(lx, lz, 4.2, false);

  // =========================================================================
  // 7. DISTANT HAUNTED MANOR / CATHEDRAL HORIZON SILHOUETTES (Outside Fence)
  // =========================================================================
  const horizonMat = new T.MeshStandardMaterial({ color: '#18202a', roughness: .95 });
  const distantSpire = (x, z, w, h, d) => {
    const body = new T.Mesh(new T.BoxGeometry(w, h, d), horizonMat);
    body.position.set(x, h / 2, z);
    const roof = new T.Mesh(new T.ConeGeometry(Math.max(w, d) * .72, h * .55, 4), horizonMat);
    roof.position.set(x, h + h * .275, z);
    roof.rotation.y = Math.PI / 4;
    group.add(body, roof);
  };
  distantSpire(-54, -52, 10, 24, 10);
  distantSpire(56, -50, 12, 28, 12);
  distantSpire(-58, 48, 11, 22, 11);
  distantSpire(54, 54, 10, 25, 10);
  distantSpire(0, -64, 18, 20, 10);
  distantSpire(0, 64, 16, 18, 10);
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    addDeadTree(Math.cos(a) * 48, Math.sin(a) * 48, 1.35 + (i % 3) * .25, i + 7);
  }

  // =========================================================================
  // PHYSICS QUERIES (Horizontal wall-sliding, ramp/crate vertical support, bullet raycast)
  // =========================================================================
  function supportHeight(x, y, z, radius = .42) {
    let best = 0;
    // Walkable ramps
    for (const r of ramps) {
      if (x + radius > r.minX && x - radius < r.maxX && z + radius > r.minZ && z - radius < r.maxZ) {
        const t = r.axis === 'z'
          ? T.MathUtils.clamp((z - r.minZ) / (r.maxZ - r.minZ), 0, 1)
          : T.MathUtils.clamp((x - r.minX) / (r.maxX - r.minX), 0, 1);
        const h = r.y0 + (r.y1 - r.y0) * t;
        if (h <= y + .78 && h > best) best = h;
      }
    }
    // Walkable box tops (altar platform, catwalk, jumpable crates/sarcophagi/pews)
    for (const b of colliders) {
      if (x + radius > b.minX && x - radius < b.maxX && z + radius > b.minZ && z - radius < b.maxZ) {
        if (b.maxY <= y + .62 && b.maxY > best) best = b.maxY;
      }
    }
    return best;
  }

  function resolveHorizontal(x, y, z, radius = .42, height = 1.78) {
    let nx = T.MathUtils.clamp(x, -35.4, 35.4);
    let nz = T.MathUtils.clamp(z, -35.4, 35.4);
    // Allow stepping smoothly onto surfaces up to 0.58m above feet (ramps & low steps)
    const feetClear = y + .58;
    const headTop = y + height;

    for (let pass = 0; pass < 2; pass++) {
      for (const b of colliders) {
        if (b.maxY <= feetClear || b.minY >= headTop) continue;
        const closestX = T.MathUtils.clamp(nx, b.minX, b.maxX);
        const closestZ = T.MathUtils.clamp(nz, b.minZ, b.maxZ);
        const dx = nx - closestX, dz = nz - closestZ;
        const d2 = dx * dx + dz * dz;
        if (d2 >= radius * radius) continue;
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2);
          const push = radius - d;
          nx += (dx / d) * push;
          nz += (dz / d) * push;
        } else {
          // Inside box fallback: push out along nearest face
          const penL = Math.abs(nx - b.minX), penR = Math.abs(b.maxX - nx);
          const penN = Math.abs(nz - b.minZ), penS = Math.abs(b.maxZ - nz);
          const m = Math.min(penL, penR, penN, penS);
          if (m === penL) nx = b.minX - radius;
          else if (m === penR) nx = b.maxX + radius;
          else if (m === penN) nz = b.minZ - radius;
          else nz = b.maxZ + radius;
        }
      }
    }
    return { x: nx, z: nz };
  }

  function hasHeadroom(x, y, z, radius = .42, height = 1.78) {
    const feetClear = y + .65;
    const headTop = y + height;
    for (const b of colliders) {
      if (b.maxY <= feetClear || b.minY >= headTop) continue;
      const cx = T.MathUtils.clamp(x, b.minX, b.maxX);
      const cz = T.MathUtils.clamp(z, b.minZ, b.maxZ);
      if ((x - cx) ** 2 + (z - cz) ** 2 < radius * radius) return false;
    }
    return true;
  }

  // Exact analytical slab raycast against ground (y=0) + all AABBs (sub-0.02ms!)
  function raycastWorld(origin, dir, maxDist = 120) {
    let bestT = maxDist;
    let hitNormal = null;
    let hitTag = null;

    // Ground plane y = 0
    if (dir.y < -1e-6 && origin.y > 0) {
      const t = -origin.y / dir.y;
      if (t > .01 && t < bestT) {
        bestT = t;
        hitNormal = [0, 1, 0];
        hitTag = 'stone';
      }
    }

    const invX = Math.abs(dir.x) > 1e-8 ? 1 / dir.x : 1e12;
    const invY = Math.abs(dir.y) > 1e-8 ? 1 / dir.y : 1e12;
    const invZ = Math.abs(dir.z) > 1e-8 ? 1 / dir.z : 1e12;

    for (const b of colliders) {
      let t1 = (b.minX - origin.x) * invX, t2 = (b.maxX - origin.x) * invX;
      let tmin = Math.min(t1, t2), tmax = Math.max(t1, t2);
      let nx = t1 < t2 ? -1 : 1, ny = 0, nz = 0;

      let ty1 = (b.minY - origin.y) * invY, ty2 = (b.maxY - origin.y) * invY;
      const tyMin = Math.min(ty1, ty2), tyMax = Math.max(ty1, ty2);
      if (tyMin > tmin) { tmin = tyMin; nx = 0; ny = ty1 < ty2 ? -1 : 1; nz = 0; }
      tmax = Math.min(tmax, tyMax);

      let tz1 = (b.minZ - origin.z) * invZ, tz2 = (b.maxZ - origin.z) * invZ;
      const tzMin = Math.min(tz1, tz2), tzMax = Math.max(tz1, tz2);
      if (tzMin > tmin) { tmin = tzMin; nx = 0; ny = 0; nz = tz1 < tz2 ? -1 : 1; }
      tmax = Math.min(tmax, tzMax);

      if (tmax >= Math.max(.01, tmin) && tmin > .01 && tmin < bestT) {
        bestT = tmin;
        hitNormal = [nx, ny, nz];
        hitTag = b.tag;
      }
    }

    if (!hitNormal) return null;
    return {
      dist: bestT,
      point: new T.Vector3(origin.x + dir.x * bestT, origin.y + dir.y * bestT, origin.z + dir.z * bestT),
      normal: new T.Vector3(...hitNormal),
      tag: hitTag
    };
  }

  function hasLineOfSight(a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    const dist = Math.hypot(dx, dy, dz);
    if (dist < .2) return true;
    const dir = { x: dx / dist, y: dy / dist, z: dz / dist };
    const hit = raycastWorld(a, dir, dist - .25);
    return !hit;
  }

  // =========================================================================
  // TACTICAL NAVIGATION GRAPH (3 Lanes + Elevated Altar + East Crypt Balcony)
  // =========================================================================
  const waypoints = [
    /* 0  */ { x: 0, z: 31, y: 0, role: 'spawn-blue' },
    /* 1  */ { x: -12, z: 30, y: 0, role: 'spawn-blue' },
    /* 2  */ { x: 12, z: 30, y: 0, role: 'spawn-blue' },
    /* 3  */ { x: 0, z: 20, y: 0, role: 'mid' },
    /* 4  */ { x: 0, z: 11, y: 0, role: 'mid' },
    /* 5  */ { x: 0, z: 3.5, y: 2.0, role: 'high' },   // Altar South high-ground
    /* 6  */ { x: 0, z: -3.5, y: 2.0, role: 'high' },  // Altar North high-ground
    /* 7  */ { x: 0, z: -11, y: 0, role: 'mid' },
    /* 8  */ { x: 0, z: -20, y: 0, role: 'mid' },
    /* 9  */ { x: 0, z: -31, y: 0, role: 'spawn-red' },
    /* 10 */ { x: -12, z: -30, y: 0, role: 'spawn-red' },
    /* 11 */ { x: 12, z: -30, y: 0, role: 'spawn-red' },
    /* 12 */ { x: -19, z: 25, y: 0, role: 'west' },
    /* 13 */ { x: -19, z: 14, y: 0, role: 'west' },
    /* 14 */ { x: -19, z: 0, y: 0, role: 'west' },     // Outside West Nave Arch
    /* 15 */ { x: -19, z: -14, y: 0, role: 'west' },
    /* 16 */ { x: -19, z: -25, y: 0, role: 'west' },
    /* 17 */ { x: -30, z: 19, y: 0, role: 'west' },
    /* 18 */ { x: -30, z: 0, y: 0, role: 'west' },
    /* 19 */ { x: -30, z: -19, y: 0, role: 'west' },
    /* 20 */ { x: 19, z: 25, y: 0, role: 'east' },
    /* 21 */ { x: 19, z: 11, y: 0, role: 'east' },
    /* 22 */ { x: 18, z: 0, y: 0, role: 'east' },      // Outside East Nave Arch
    /* 23 */ { x: 19, z: -11, y: 0, role: 'east' },
    /* 24 */ { x: 19, z: -25, y: 0, role: 'east' },
    /* 25 */ { x: 31.8, z: 13.5, y: 0, role: 'east' },
    /* 26 */ { x: 31.8, z: 0, y: 2.2, role: 'high' },  // East Crypt Balcony
    /* 27 */ { x: 31.8, z: -13.5, y: 0, role: 'east' },
    /* 28 */ { x: -9.5, z: 0, y: 0, role: 'mid' },     // Nave West Interior
    /* 29 */ { x: 9.5, z: 0, y: 0, role: 'mid' }       // Nave East Interior
  ];
  const edges = [
    [0, 1], [0, 2], [0, 3], [1, 12], [2, 20],
    [3, 4], [3, 12], [3, 20], [4, 5], [5, 6], [6, 7], [7, 8], [8, 9],
    [8, 16], [8, 24], [9, 10], [9, 11], [10, 16], [11, 24],
    [4, 28], [4, 29], [7, 28], [7, 29], [28, 14], [29, 22],
    [12, 13], [13, 14], [14, 15], [15, 16],
    [12, 17], [17, 18], [18, 19], [19, 16], [14, 18],
    [20, 21], [21, 22], [22, 23], [23, 24],
    [20, 25], [25, 26], [26, 27], [27, 24], [21, 25], [23, 27]
  ];
  const navAdj = waypoints.map(() => []);
  for (const [a, b] of edges) {
    navAdj[a].push(b);
    navAdj[b].push(a);
  }

  const blueSpawns = [
    { x: 0, z: 31.5, yaw: 0 },
    { x: -11.5, z: 31.2, yaw: .12 },
    { x: 11.5, z: 31.2, yaw: -.12 },
    { x: -4.2, z: 32.8, yaw: 0 }
  ];
  const redSpawns = [
    { x: 0, z: -31.5, yaw: Math.PI },
    { x: -11.5, z: -31.2, yaw: Math.PI - .12 },
    { x: 11.5, z: -31.2, yaw: Math.PI + .12 },
    { x: 4.2, z: -32.8, yaw: Math.PI }
  ];

  // =========================================================================
  // 8. GPU ATMOSPHERIC PARTICLES (Drifting Cemetery Mist + Floating Embers/Motes)
  // =========================================================================
  const emberCount = 110;
  const emberGeo = new T.BufferGeometry();
  const emberPos = new Float32Array(emberCount * 3);
  const emberCol = new Float32Array(emberCount * 3);
  const emberPhase = new Float32Array(emberCount);
  for (let i = 0; i < emberCount; i++) {
    emberPos[i * 3]     = ((i * 37) % 64) - 32;
    emberPos[i * 3 + 1] = 0.6 + ((i * 19) % 75) / 10;
    emberPos[i * 3 + 2] = ((i * 53) % 64) - 32;
    emberPhase[i] = i * 0.73;
    const isWarm = (i % 3 !== 0);
    emberCol[i * 3]     = isWarm ? 1.0 : 0.68;
    emberCol[i * 3 + 1] = isWarm ? 0.74 : 0.86;
    emberCol[i * 3 + 2] = isWarm ? 0.38 : 1.0;
  }
  emberGeo.setAttribute('position', new T.BufferAttribute(emberPos, 3));
  emberGeo.setAttribute('color', new T.BufferAttribute(emberCol, 3));
  const emberMat = new T.PointsMaterial({
    size: 0.34,
    map: mats.moteTex || null,
    vertexColors: true,
    transparent: true,
    opacity: 0.82,
    blending: T.AdditiveBlending,
    depthWrite: false,
  });
  const emberPoints = new T.Points(emberGeo, emberMat);
  group.add(emberPoints);

  function updateAtmosphere(time) {
    for (const l of lanterns) {
      if (l.light) {
        l.light.intensity = l.baseIntensity + Math.sin(time * 5.2 + l.phase) * 1.6 + Math.sin(time * 13.7 + l.phase * 2) * .65;
      }
    }
    for (const c of candleFlames) {
      c.flame.position.y = c.baseY + Math.sin(time * 9.5 + c.phase) * 0.015;
      const s = 0.72 + Math.sin(time * 14.2 + c.phase) * 0.12;
      c.flame.scale.set(s, 1.55 + Math.cos(time * 11.3 + c.phase) * 0.22, s);
    }
    const posAttr = emberGeo.attributes.position;
    for (let i = 0; i < emberCount; i++) {
      const ph = emberPhase[i];
      let y = posAttr.getY(i) + 0.008;
      if (y > 8.5) y = 0.5;
      posAttr.setXYZ(
        i,
        posAttr.getX(i) + Math.sin(time * 0.9 + ph) * 0.006,
        y,
        posAttr.getZ(i) + Math.cos(time * 0.8 + ph) * 0.006
      );
    }
    posAttr.needsUpdate = true;
  }

  return {
    group, colliders, ramps, radarShapes, waypoints, navAdj,
    blueSpawns, redSpawns,
    supportHeight, resolveHorizontal, hasHeadroom, raycastWorld, hasLineOfSight, updateAtmosphere
  };
}
