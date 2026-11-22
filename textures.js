import * as T from 'three';

// Procedural Gothic Cathedral & Ancient Crypt PBR textures (100% offline, zero external images).
// Follows the same procedural surface synthesis pattern as henu-jinming-map.

function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function makeCanvasTex(size, draw, { repeatX = 1, repeatY = 1, srgb = true, anisotropy = 4 } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  draw(ctx, size);
  const tex = new T.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = T.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  if (srgb) tex.colorSpace = T.SRGBColorSpace;
  tex.anisotropy = anisotropy;
  tex.needsUpdate = true;
  return tex;
}

export function createGothicMaterials(anisotropy = 4) {
  const rand = seeded(915023);

  // 1. Cracked mossy courtyard flagstone & cemetery cobble
  const floorMap = makeCanvasTex(512, (ctx, S) => {
    ctx.fillStyle = '#252d34';
    ctx.fillRect(0, 0, S, S);
    const rows = 8, cols = 8, rh = S / rows, cw = S / cols;
    for (let r = 0; r < rows; r++) {
      const offset = (r % 2) * (cw * .5);
      for (let c = -1; c <= cols; c++) {
        const x = c * cw + offset, y = r * rh;
        const v = 46 + Math.floor(rand() * 24);
        const tint = rand() > .72 ? 5 : 0;
        ctx.fillStyle = `rgb(${v - 4},${v + tint},${v + 7})`;
        ctx.fillRect(x + 2.5, y + 2.5, cw - 5, rh - 5);
        // Subtle wear & moss corner
        if (rand() > .62) {
          ctx.fillStyle = `rgba(38,66,52,${(.16 + rand() * .22).toFixed(2)})`;
          ctx.fillRect(x + 2, y + 2, 10 + rand() * 18, 6 + rand() * 12);
        }
        // Fine hairline crack
        if (rand() > .78) {
          ctx.strokeStyle = 'rgba(15,20,24,0.55)';
          ctx.lineWidth = 1.1;
          ctx.beginPath();
          ctx.moveTo(x + 8, y + rh * .4);
          ctx.lineTo(x + cw * .55, y + rh * .58);
          ctx.lineTo(x + cw - 8, y + rh * .32);
          ctx.stroke();
        }
      }
    }
    // Subtle speckle grain
    for (let i = 0; i < 1400; i++) {
      const a = .04 + rand() * .07;
      ctx.fillStyle = rand() > .5 ? `rgba(180,205,220,${a})` : `rgba(8,12,16,${a})`;
      ctx.fillRect(rand() * S, rand() * S, 2, 2);
    }
  }, { repeatX: 20, repeatY: 20, anisotropy });

  const floorBump = makeCanvasTex(256, (ctx, S) => {
    ctx.fillStyle = '#303030';
    ctx.fillRect(0, 0, S, S);
    const rows = 8, cols = 8, rh = S / rows, cw = S / cols;
    for (let r = 0; r < rows; r++) {
      const offset = (r % 2) * (cw * .5);
      for (let c = -1; c <= cols; c++) {
        const v = 165 + Math.floor(rand() * 45);
        ctx.fillStyle = `rgb(${v},${v},${v})`;
        ctx.fillRect(c * cw + offset + 2, r * rh + 2, cw - 4, rh - 4);
      }
    }
  }, { repeatX: 20, repeatY: 20, srgb: false, anisotropy });

  // 2. Identity V "Red Church" weathered dark crimson masonry brick
  const redBrickMap = makeCanvasTex(512, (ctx, S) => {
    ctx.fillStyle = '#241d1f';
    ctx.fillRect(0, 0, S, S);
    const rows = 16, cols = 8, rh = S / rows, cw = S / cols;
    for (let r = 0; r < rows; r++) {
      const off = (r % 2) * (cw * .5);
      for (let c = -1; c <= cols; c++) {
        const R = 126 + Math.floor(rand() * 38);
        const G = 58 + Math.floor(rand() * 22);
        const B = 58 + Math.floor(rand() * 20);
        ctx.fillStyle = `rgb(${R},${G},${B})`;
        ctx.fillRect(c * cw + off + 2, r * rh + 2, cw - 4, rh - 4);
        if (rand() > .74) {
          ctx.fillStyle = `rgba(20,16,18,${(.18 + rand() * .24).toFixed(2)})`;
          ctx.fillRect(c * cw + off + 2, r * rh + 2, cw - 4, rh - 4);
        }
      }
    }
    // Weathering soot gradient at bottom
    const g = ctx.createLinearGradient(0, S * .65, 0, S);
    g.addColorStop(0, 'rgba(18,24,22,0)');
    g.addColorStop(1, 'rgba(18,28,24,0.42)');
    ctx.fillStyle = g;
    ctx.fillRect(0, S * .65, S, S * .35);
  }, { repeatX: 2, repeatY: 2, anisotropy });

  // 3. Ancient carved crypt ashlar limestone (tombs, arches, sarcophagi, columns)
  const cryptStoneMap = makeCanvasTex(512, (ctx, S) => {
    ctx.fillStyle = '#252a30';
    ctx.fillRect(0, 0, S, S);
    const rows = 8, cols = 4, rh = S / rows, cw = S / cols;
    for (let r = 0; r < rows; r++) {
      const off = (r % 2) * (cw * .5);
      for (let c = -1; c <= cols; c++) {
        const v = 86 + Math.floor(rand() * 28);
        ctx.fillStyle = `rgb(${v},${v + 4},${v + 8})`;
        ctx.fillRect(c * cw + off + 2.5, r * rh + 2.5, cw - 5, rh - 5);
        // Moss patches near seams
        if (rand() > .60) {
          ctx.fillStyle = `rgba(42,68,54,${(.18 + rand() * .22).toFixed(2)})`;
          ctx.fillRect(c * cw + off + 3, r * rh + rh - 14, 18 + rand() * 34, 11);
        }
      }
    }
    for (let i = 0; i < 900; i++) {
      ctx.fillStyle = rand() > .5 ? 'rgba(220,232,240,0.06)' : 'rgba(12,16,20,0.08)';
      ctx.fillRect(rand() * S, rand() * S, 2, 2);
    }
  }, { repeatX: 2, repeatY: 2, anisotropy });

  // 4. Aged dark oak wood (church pews, coffins, supply crates)
  const darkWoodMap = makeCanvasTex(256, (ctx, S) => {
    ctx.fillStyle = '#382a22';
    ctx.fillRect(0, 0, S, S);
    for (let y = 0; y < S; y += 32) {
      const tone = 44 + Math.floor(rand() * 22);
      ctx.fillStyle = `rgb(${tone + 18},${tone + 4},${tone - 4})`;
      ctx.fillRect(0, y + 1, S, 30);
      ctx.fillStyle = 'rgba(18,12,10,0.55)';
      ctx.fillRect(0, y, S, 2);
      for (let k = 0; k < 14; k++) {
        ctx.fillStyle = 'rgba(20,13,10,0.16)';
        ctx.fillRect(0, y + rand() * 30, S, 1);
      }
    }
  }, { repeatX: 1, repeatY: 1, anisotropy });

  // 5. Glowing Gothic Stained Glass (Rose Window & Lancet Arches!)
  const stainedGlassMap = makeCanvasTex(256, (ctx, S) => {
    ctx.fillStyle = '#14171c';
    ctx.fillRect(0, 0, S, S);
    const palette = ['#b83b4a', '#d99346', '#4a7ec4', '#7a4594', '#38857d', '#e5be67'];
    const cell = 32;
    for (let y = 0; y < S; y += cell) {
      for (let x = 0; x < S; x += cell) {
        ctx.fillStyle = palette[(Math.floor(x / cell) + Math.floor(y / cell) * 3) % palette.length];
        ctx.fillRect(x + 3, y + 3, cell - 6, cell - 6);
        // Diamond lead mullion
        ctx.strokeStyle = '#15181e';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(x + cell / 2, y);
        ctx.lineTo(x + cell, y + cell / 2);
        ctx.lineTo(x + cell / 2, y + cell);
        ctx.lineTo(x, y + cell / 2);
        ctx.closePath();
        ctx.stroke();
      }
    }
    // Warm center rose medallion
    const grad = ctx.createRadialGradient(S / 2, S / 2, 6, S / 2, S / 2, S * .44);
    grad.addColorStop(0, 'rgba(255,212,130,0.85)');
    grad.addColorStop(.55, 'rgba(196,74,88,0.45)');
    grad.addColorStop(1, 'rgba(42,76,128,0.15)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(S / 2, S / 2, S * .44, 0, Math.PI * 2);
    ctx.fill();
    // Radial gothic spokes
    ctx.strokeStyle = '#14171c';
    ctx.lineWidth = 4;
    for (let i = 0; i < 12; i++) {
      const a = i * Math.PI / 6;
      ctx.beginPath();
      ctx.moveTo(S / 2, S / 2);
      ctx.lineTo(S / 2 + Math.cos(a) * S * .48, S / 2 + Math.sin(a) * S * .48);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(S / 2, S / 2, S * .44, 0, Math.PI * 2);
    ctx.stroke();
  }, { repeatX: 1, repeatY: 1, anisotropy });

  // Soft radial light pool texture for wrought-iron lanterns & contact shadows
  function makeRadialTex(r, g, b) {
    const size = 64;
    const data = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = (x + .5) / size * 2 - 1, v = (y + .5) / size * 2 - 1;
        const d = Math.hypot(u, v);
        const a = Math.max(0, 1 - d);
        const smooth = a * a * (3 - 2 * a);
        const i = (y * size + x) * 4;
        data[i] = r; data[i + 1] = g; data[i + 2] = b;
        data[i + 3] = Math.round(smooth * 255);
      }
    }
    const tex = new T.DataTexture(data, size, size, T.RGBAFormat);
    tex.needsUpdate = true;
    return tex;
  }

  return {
    ground: new T.MeshStandardMaterial({ map: floorMap, bumpMap: floorBump, bumpScale: .04, roughness: .88, metalness: .06 }),
    cemeteryDirt: new T.MeshStandardMaterial({ color: '#26302d', roughness: .96, metalness: .02 }),
    redBrick: new T.MeshStandardMaterial({ map: redBrickMap, roughness: .86, metalness: .04 }),
    cryptStone: new T.MeshStandardMaterial({ map: cryptStoneMap, roughness: .84, metalness: .05 }),
    tombStone: new T.MeshStandardMaterial({ color: '#6b757d', roughness: .90, metalness: .04 }),
    trimStone: new T.MeshStandardMaterial({ color: '#838d94', roughness: .80, metalness: .06 }),
    darkWood: new T.MeshStandardMaterial({ map: darkWoodMap, roughness: .84, metalness: .05 }),
    iron: new T.MeshStandardMaterial({ color: '#24292e', roughness: .48, metalness: .68 }),
    roofSlate: new T.MeshStandardMaterial({ color: '#2a3440', roughness: .82, metalness: .12 }),
    bark: new T.MeshStandardMaterial({ color: '#2b2421', roughness: .95 }),
    stainedGlass: new T.MeshStandardMaterial({
      map: stainedGlassMap,
      emissiveMap: stainedGlassMap,
      emissive: new T.Color('#ffd096'),
      emissiveIntensity: 1.15,
      roughness: .28,
      metalness: .15
    }),
    lanternGlow: new T.MeshBasicMaterial({ color: '#ffd082' }),
    lanternPool: new T.MeshBasicMaterial({
      map: makeRadialTex(255, 178, 86),
      transparent: true,
      opacity: .34,
      depthWrite: false,
      blending: T.AdditiveBlending,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2
    }),
    shadowTex: makeRadialTex(12, 18, 22)
  };
}
