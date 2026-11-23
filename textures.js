import * as T from 'three';

function makeTex(size, draw, opts = {}) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  draw(g, size, c);
  const t = new T.CanvasTexture(c);
  if (opts.srgb !== false) t.colorSpace = T.SRGBColorSpace;
  t.wrapS = t.wrapT = T.RepeatWrapping;
  t.repeat.set(opts.rx || 1, opts.ry || 1);
  t.anisotropy = 8;
  return { tex: t, canvas: c };
}

/**
 * Generates a Tangent-Space RGB Sobel Normal Map from a 2D height/luminance canvas.
 */
function makeSobelNormalTex(sourceCanvas, strength = 2.8, opts = {}) {
  const size = sourceCanvas.width;
  const srcCtx = sourceCanvas.getContext('2d');
  const srcData = srcCtx.getImageData(0, 0, size, size).data;
  const hMap = new Float32Array(size * size);
  for (let i = 0; i < size * size; i++) {
    const idx = i * 4;
    hMap[i] = (srcData[idx] * 0.299 + srcData[idx + 1] * 0.587 + srcData[idx + 2] * 0.114) / 255;
  }

  const outCanvas = document.createElement('canvas');
  outCanvas.width = outCanvas.height = size;
  const outCtx = outCanvas.getContext('2d');
  const outImg = outCtx.createImageData(size, size);
  const dst = outImg.data;
  const mask = size - 1;
  const sample = (x, y) => hMap[((y & mask) * size) + (x & mask)];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const tl = sample(x - 1, y - 1), tc = sample(x, y - 1), tr = sample(x + 1, y - 1);
      const ml = sample(x - 1, y),                             mr = sample(x + 1, y);
      const bl = sample(x - 1, y + 1), bc = sample(x, y + 1), br = sample(x + 1, y + 1);

      const dx = ((tr + 2 * mr + br) - (tl + 2 * ml + bl)) * strength;
      const dy = ((bl + 2 * bc + br) - (tl + 2 * tc + tr)) * strength;
      const dz = 1.0;
      const invLen = 1.0 / Math.hypot(dx, dy, dz);

      const idx = (y * size + x) * 4;
      dst[idx]     = Math.round(((-dx * invLen) * 0.5 + 0.5) * 255);
      dst[idx + 1] = Math.round(((-dy * invLen) * 0.5 + 0.5) * 255);
      dst[idx + 2] = Math.round(((dz * invLen) * 0.5 + 0.5) * 255);
      dst[idx + 3] = 255;
    }
  }
  outCtx.putImageData(outImg, 0, 0);
  const t = new T.CanvasTexture(outCanvas);
  t.wrapS = t.wrapT = T.RepeatWrapping;
  t.repeat.set(opts.rx || 1, opts.ry || 1);
  t.anisotropy = 8;
  return t;
}

export function createGothicMaterials() {
  // 1. Wet Gothic Cobblestone Ground (Albedo + Sobel Normal + Wet Puddle Roughness Map)
  const cobbleHeightCanvas = document.createElement('canvas');
  cobbleHeightCanvas.width = cobbleHeightCanvas.height = 512;
  const cobbleRoughCanvas = document.createElement('canvas');
  cobbleRoughCanvas.width = cobbleRoughCanvas.height = 512;

  const cobble = makeTex(512, (g, s) => {
    const hg = cobbleHeightCanvas.getContext('2d');
    const rg = cobbleRoughCanvas.getContext('2d');

    g.fillStyle = '#252b36';
    g.fillRect(0, 0, s, s);
    hg.fillStyle = '#181818';
    hg.fillRect(0, 0, s, s);
    // Mortar channels collect rainwater -> glossy low roughness (0.16)
    rg.fillStyle = '#282828';
    rg.fillRect(0, 0, s, s);

    const rows = 10, cols = 8;
    const rh = s / rows, cw = s / cols;
    for (let r = 0; r < rows; r++) {
      const off = (r % 2) * (cw * 0.5);
      for (let c = -1; c <= cols; c++) {
        const seed = (r * 31 + c * 17) & 255;
        const x = c * cw + off + ((seed % 7) - 3);
        const y = r * rh + (((seed >> 2) % 5) - 2);
        const w = cw - 5, h = rh - 5;
        const v = 54 + (seed % 32);
        const moss = (seed % 11 === 0);

        g.fillStyle = moss ? `rgb(${v - 8},${v + 12},${v - 4})` : `rgb(${v},${v + 5},${v + 14})`;
        g.beginPath();
        g.roundRect(x + 2, y + 2, w, h, 7);
        g.fill();

        // Top bevel highlight
        g.strokeStyle = `rgba(175,198,232,0.18)`;
        g.lineWidth = 1.6;
        g.stroke();

        // Height map dome for crisp Sobel normal bevels
        const hVal = 155 + (seed % 75);
        const hGrad = hg.createRadialGradient(x + w * 0.45, y + h * 0.42, 2, x + w * 0.5, y + h * 0.5, Math.max(w, h) * 0.65);
        hGrad.addColorStop(0, `rgb(${hVal},${hVal},${hVal})`);
        hGrad.addColorStop(1, `rgb(75,75,75)`);
        hg.fillStyle = hGrad;
        hg.beginPath();
        hg.roundRect(x + 2, y + 2, w, h, 7);
        hg.fill();

        // Roughness map: stone tops are damp-matte (0.68-0.84), rain puddles override below
        const rVal = 165 + (seed % 50);
        rg.fillStyle = `rgb(${rVal},${rVal},${rVal})`;
        rg.beginPath();
        rg.roundRect(x + 3, y + 3, w - 2, h - 2, 6);
        rg.fill();
      }
    }

    // Specular rainwater puddles across the courtyard cobblestones
    const puddles = [
      [118, 134, 88],
      [368, 212, 106],
      [216, 396, 94],
      [420, 430, 68],
    ];
    for (const [px, py, pr] of puddles) {
      // Darken wet stone slightly in albedo
      const aGrad = g.createRadialGradient(px, py, pr * 0.15, px, py, pr);
      aGrad.addColorStop(0, 'rgba(18, 24, 36, 0.36)');
      aGrad.addColorStop(1, 'rgba(18, 24, 36, 0)');
      g.fillStyle = aGrad;
      g.beginPath();
      g.arc(px, py, pr, 0, Math.PI * 2);
      g.fill();

      // Mirror-like low roughness in puddle centers (reflects lanterns, rose windows & moonlight!)
      const pGrad = rg.createRadialGradient(px, py, pr * 0.1, px, py, pr);
      pGrad.addColorStop(0, 'rgb(28, 28, 28)');
      pGrad.addColorStop(0.65, 'rgb(52, 52, 52)');
      pGrad.addColorStop(1, 'rgba(160, 160, 160, 0)');
      rg.fillStyle = pGrad;
      rg.beginPath();
      rg.arc(px, py, pr, 0, Math.PI * 2);
      rg.fill();
    }
  }, { rx: 22, ry: 22 });

  const cobbleNormal = makeSobelNormalTex(cobbleHeightCanvas, 3.2, { rx: 22, ry: 22 });
  const cobbleRoughTex = new T.CanvasTexture(cobbleRoughCanvas);
  cobbleRoughTex.wrapS = cobbleRoughTex.wrapT = T.RepeatWrapping;
  cobbleRoughTex.repeat.set(22, 22);
  cobbleRoughTex.anisotropy = 8;

  // 2. Weathered Red Church Brick (Albedo + Deep Mortar Normal Map)
  const brickHeightCanvas = document.createElement('canvas');
  brickHeightCanvas.width = brickHeightCanvas.height = 512;
  const redBrick = makeTex(512, (g, s) => {
    const hg = brickHeightCanvas.getContext('2d');
    g.fillStyle = '#382228';
    g.fillRect(0, 0, s, s);
    hg.fillStyle = '#202020';
    hg.fillRect(0, 0, s, s);

    const rows = 16, cols = 8;
    const rh = s / rows, cw = s / cols;
    for (let r = 0; r < rows; r++) {
      const off = (r % 2) * (cw * 0.5);
      for (let c = -1; c <= cols; c++) {
        const seed = (r * 43 + c * 29) & 255;
        const x = c * cw + off;
        const y = r * rh;
        const R = 132 + (seed % 42);
        const G = 52 + (seed % 22);
        const B = 58 + (seed % 24);
        g.fillStyle = `rgb(${R},${G},${B})`;
        g.fillRect(x + 2, y + 2, cw - 4, rh - 4);
        g.fillStyle = 'rgba(255,210,190,0.09)';
        g.fillRect(x + 2, y + 2, cw - 4, 2);

        const hVal = 175 + (seed % 65);
        hg.fillStyle = `rgb(${hVal},${hVal},${hVal})`;
        hg.fillRect(x + 3, y + 3, cw - 6, rh - 6);
      }
    }
    // Damp moss/soot streaks
    for (let i = 0; i < 18; i++) {
      const x = (i * 59) % s;
      const grd = g.createLinearGradient(x, 0, x, s);
      grd.addColorStop(0, 'rgba(18,22,26,0.34)');
      grd.addColorStop(0.5, 'rgba(20,24,28,0.05)');
      grd.addColorStop(1, 'rgba(14,28,22,0.38)');
      g.fillStyle = grd;
      g.fillRect(x, 0, 26, s);
    }
  }, { rx: 2, ry: 2 });
  const redBrickNormal = makeSobelNormalTex(brickHeightCanvas, 3.0, { rx: 2, ry: 2 });

  // 3. Carved Gothic Ashlar Crypt Stone (Albedo + Chiseled Normal Map)
  const cryptStone = makeTex(512, (g, s) => {
    g.fillStyle = '#535e72';
    g.fillRect(0, 0, s, s);
    const rows = 8, cols = 4;
    const rh = s / rows, cw = s / cols;
    for (let r = 0; r < rows; r++) {
      const off = (r % 2) * (cw * 0.5);
      for (let c = -1; c <= cols; c++) {
        const seed = (r * 19 + c * 37) & 255;
        const v = 86 + (seed % 30);
        g.fillStyle = `rgb(${v},${v + 8},${v + 20})`;
        g.fillRect(c * cw + off + 3, r * rh + 3, cw - 6, rh - 6);
        g.strokeStyle = 'rgba(215,230,255,0.22)';
        g.lineWidth = 1.5;
        g.strokeRect(c * cw + off + 4, r * rh + 4, cw - 8, rh - 8);
      }
    }
  }, { rx: 2, ry: 2 });
  const cryptStoneNormal = makeSobelNormalTex(cryptStone.canvas, 2.8, { rx: 2, ry: 2 });

  // 4. Aged Dark Wood & Roof Slate (Albedo + Grain Normal Maps)
  const darkWood = makeTex(256, (g, s) => {
    g.fillStyle = '#4e3526';
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 80; i++) {
      g.fillStyle = i % 2 ? 'rgba(22,12,8,0.24)' : 'rgba(135,96,68,0.16)';
      g.fillRect(0, (i * 11) % s, s, 3);
    }
    for (let p = 0; p < 4; p++) {
      g.fillStyle = 'rgba(10,6,4,0.48)';
      g.fillRect(0, p * (s / 4), s, 2);
    }
  }, { rx: 2, ry: 2 });
  const darkWoodNormal = makeSobelNormalTex(darkWood.canvas, 2.2, { rx: 2, ry: 2 });

  const roofSlate = makeTex(256, (g, s) => {
    g.fillStyle = '#2d3748';
    g.fillRect(0, 0, s, s);
    const rows = 8, cols = 8;
    const rh = s / rows, cw = s / cols;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const v = 46 + ((r * 13 + c * 7) % 22);
        g.fillStyle = `rgb(${v},${v + 7},${v + 18})`;
        g.fillRect(c * cw + 1, r * rh + 1, cw - 2, rh - 2);
        g.fillStyle = 'rgba(180,205,245,0.14)';
        g.fillRect(c * cw + 1, r * rh + rh - 3, cw - 2, 2);
      }
    }
  }, { rx: 4, ry: 2 });
  const roofSlateNormal = makeSobelNormalTex(roofSlate.canvas, 2.5, { rx: 4, ry: 2 });

  // 5A. Gothic Rose Window Mandala (12-petal radial stained glass with gold/crimson/sapphire leading)
  const stainedRoseTex = makeTex(512, (g, s) => {
    const cx = s / 2, cy = s / 2, R = s * 0.47;
    g.fillStyle = '#120a18';
    g.fillRect(0, 0, s, s);

    const bgGrad = g.createRadialGradient(cx, cy, 8, cx, cy, R);
    bgGrad.addColorStop(0, '#fff3c4');
    bgGrad.addColorStop(0.24, '#ff9e44');
    bgGrad.addColorStop(0.55, '#d9385a');
    bgGrad.addColorStop(0.82, '#4a3694');
    bgGrad.addColorStop(1, '#181024');
    g.fillStyle = bgGrad;
    g.beginPath();
    g.arc(cx, cy, R, 0, Math.PI * 2);
    g.fill();

    const petalColors = ['#ffbe4f', '#e84862', '#5294ff', '#b25cff'];
    const petals = 12;
    for (let i = 0; i < petals; i++) {
      const a0 = (i / petals) * Math.PI * 2;
      const a1 = ((i + 1) / petals) * Math.PI * 2;
      const am = (a0 + a1) * 0.5;

      // Outer lancet petal
      g.fillStyle = petalColors[i % petalColors.length];
      g.beginPath();
      g.moveTo(cx + Math.cos(a0) * R * 0.28, cy + Math.sin(a0) * R * 0.28);
      g.quadraticCurveTo(cx + Math.cos(am) * R * 0.92, cy + Math.sin(am) * R * 0.92, cx + Math.cos(a1) * R * 0.28, cy + Math.sin(a1) * R * 0.28);
      g.closePath();
      g.fill();
      g.lineWidth = 5;
      g.strokeStyle = '#18121e';
      g.stroke();

      // Outer trefoil medallion
      const mx = cx + Math.cos(am) * R * 0.72;
      const my = cy + Math.sin(am) * R * 0.72;
      g.fillStyle = i % 2 === 0 ? '#ffe596' : '#63b8ff';
      g.beginPath();
      g.arc(mx, my, R * 0.11, 0, Math.PI * 2);
      g.fill();
      g.lineWidth = 4;
      g.strokeStyle = '#18121e';
      g.stroke();
    }

    // Concentric iron leading rings & golden core sun
    for (const rFrac of [0.28, 0.54, 0.88, 0.96]) {
      g.lineWidth = rFrac > 0.9 ? 10 : 6;
      g.strokeStyle = '#16111c';
      g.beginPath();
      g.arc(cx, cy, R * rFrac, 0, Math.PI * 2);
      g.stroke();
    }
    g.fillStyle = '#fff5cc';
    g.beginPath();
    g.arc(cx, cy, R * 0.14, 0, Math.PI * 2);
    g.fill();
  }).tex;

  // 5B. Gothic Pointed-Arch Lancet Window (Quatrefoil & leaded diamond quarries)
  const stainedLancetTex = makeTex(512, (g, s) => {
    g.fillStyle = '#140c1c';
    g.fillRect(0, 0, s, s);

    const grad = g.createLinearGradient(0, 0, 0, s);
    grad.addColorStop(0, '#ffcf70');
    grad.addColorStop(0.35, '#e04868');
    grad.addColorStop(0.72, '#8242b8');
    grad.addColorStop(1, '#3268c8');
    g.fillStyle = grad;
    g.fillRect(28, 24, s - 56, s - 48);

    // Diamond leaded glass lattice
    g.strokeStyle = 'rgba(20, 14, 26, 0.78)';
    g.lineWidth = 4;
    const step = 48;
    for (let y = -s; y < s * 2; y += step) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(s, y + s);
      g.moveTo(s, y);
      g.lineTo(0, y + s);
      g.stroke();
    }

    // Pointed gothic arch tracery frame & central mullions
    g.strokeStyle = '#16101c';
    g.lineWidth = 18;
    g.strokeRect(20, 16, s - 40, s - 32);
    g.lineWidth = 10;
    g.beginPath();
    g.moveTo(s * 0.34, 20); g.lineTo(s * 0.34, s - 20);
    g.moveTo(s * 0.66, 20); g.lineTo(s * 0.66, s - 20);
    g.stroke();

    for (let row = 1; row <= 3; row++) {
      const cy = (s / 4) * row;
      g.fillStyle = row === 1 ? '#ffe89e' : (row === 2 ? '#ff647c' : '#64b5ff');
      g.beginPath();
      g.arc(s * 0.5, cy, 44, 0, Math.PI * 2);
      g.fill();
      g.lineWidth = 7;
      g.strokeStyle = '#16101c';
      g.stroke();
    }
  }).tex;

  // 6. Volumetric Moonbeam Gradient Texture & Soft Radial Particle Sprite
  const moonBeamTex = makeTex(256, (g, s) => {
    const grd = g.createLinearGradient(0, 0, 0, s);
    grd.addColorStop(0, 'rgba(225, 238, 255, 0.42)');
    grd.addColorStop(0.45, 'rgba(180, 212, 255, 0.18)');
    grd.addColorStop(0.85, 'rgba(235, 165, 190, 0.06)');
    grd.addColorStop(1, 'rgba(160, 195, 255, 0.0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, s, s);

    // Soft horizontal edge fade
    g.globalCompositeOperation = 'destination-in';
    const hGrd = g.createLinearGradient(0, 0, s, 0);
    hGrd.addColorStop(0, 'rgba(255,255,255,0)');
    hGrd.addColorStop(0.22, 'rgba(255,255,255,0.9)');
    hGrd.addColorStop(0.5, 'rgba(255,255,255,1)');
    hGrd.addColorStop(0.78, 'rgba(255,255,255,0.9)');
    hGrd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = hGrd;
    g.fillRect(0, 0, s, s);
    g.globalCompositeOperation = 'source-over';
  }).tex;
  moonBeamTex.wrapS = moonBeamTex.wrapT = T.ClampToEdgeWrapping;

  const moteTex = makeTex(64, (g, s) => {
    const grd = g.createRadialGradient(s / 2, s / 2, 1, s / 2, s / 2, s / 2);
    grd.addColorStop(0, 'rgba(255, 255, 255, 1)');
    grd.addColorStop(0.35, 'rgba(235, 245, 255, 0.65)');
    grd.addColorStop(1, 'rgba(200, 225, 255, 0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, s, s);
  }).tex;
  moteTex.wrapS = moteTex.wrapT = T.ClampToEdgeWrapping;

  const stainedGlassRose = new T.MeshStandardMaterial({
    map: stainedRoseTex,
    emissiveMap: stainedRoseTex,
    emissive: new T.Color('#ffe2b0'),
    emissiveIntensity: 2.35,
    roughness: 0.16,
    metalness: 0.12,
  });

  const stainedGlassLancet = new T.MeshStandardMaterial({
    map: stainedLancetTex,
    emissiveMap: stainedLancetTex,
    emissive: new T.Color('#ffd9a8'),
    emissiveIntensity: 1.95,
    roughness: 0.18,
    metalness: 0.12,
  });

  const lanternPoolTex = makeTex(128, (g, s) => {
    const grd = g.createRadialGradient(s / 2, s / 2, 2, s / 2, s / 2, s / 2);
    grd.addColorStop(0, 'rgba(255, 185, 92, 0.44)');
    grd.addColorStop(0.45, 'rgba(255, 148, 62, 0.16)');
    grd.addColorStop(1, 'rgba(255, 120, 40, 0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, s, s);
  }).tex;
  lanternPoolTex.wrapS = lanternPoolTex.wrapT = T.ClampToEdgeWrapping;

  const shadowTex = makeTex(64, (g, s) => {
    const grd = g.createRadialGradient(s / 2, s / 2, 2, s / 2, s / 2, s / 2);
    grd.addColorStop(0, 'rgba(6, 8, 12, 0.85)');
    grd.addColorStop(0.55, 'rgba(6, 8, 12, 0.38)');
    grd.addColorStop(1, 'rgba(6, 8, 12, 0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, s, s);
  }).tex;
  shadowTex.wrapS = shadowTex.wrapT = T.ClampToEdgeWrapping;

  const cemeteryDirt = makeTex(256, (g, s) => {
    g.fillStyle = '#202624';
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 240; i++) {
      const x = (i * 73) % s, y = (i * 41) % s;
      g.fillStyle = i % 3 === 0 ? 'rgba(42,64,46,0.28)' : 'rgba(14,18,16,0.34)';
      g.beginPath();
      g.arc(x, y, 4 + (i % 10), 0, Math.PI * 2);
      g.fill();
    }
  }, { rx: 6, ry: 18 }).tex;

  const wroughtIronMat = new T.MeshStandardMaterial({
    color: new T.Color('#283140'),
    roughness: 0.30,
    metalness: 0.88,
  });

  const deadTreeMat = new T.MeshStandardMaterial({
    map: darkWood.tex,
    normalMap: darkWoodNormal,
    color: new T.Color('#42363c'),
    roughness: 0.82,
    metalness: 0.05,
  });

  return {
    ground: new T.MeshStandardMaterial({
      map: cobble.tex,
      normalMap: cobbleNormal,
      normalScale: new T.Vector2(1.18, 1.18),
      roughnessMap: cobbleRoughTex,
      roughness: 0.88,
      metalness: 0.14,
    }),
    cemeteryDirt: new T.MeshStandardMaterial({
      map: cemeteryDirt,
      normalMap: cobbleNormal,
      normalScale: new T.Vector2(0.55, 0.55),
      roughness: 0.92,
      metalness: 0.04,
    }),
    redBrick: new T.MeshStandardMaterial({
      map: redBrick.tex,
      normalMap: redBrickNormal,
      normalScale: new T.Vector2(1.12, 1.12),
      roughness: 0.72,
      metalness: 0.08,
    }),
    cryptStone: new T.MeshStandardMaterial({
      map: cryptStone.tex,
      normalMap: cryptStoneNormal,
      normalScale: new T.Vector2(1.05, 1.05),
      roughness: 0.66,
      metalness: 0.12,
    }),
    trimStone: new T.MeshStandardMaterial({
      map: cryptStone.tex,
      normalMap: cryptStoneNormal,
      normalScale: new T.Vector2(0.85, 0.85),
      color: new T.Color('#8a9bb5'),
      roughness: 0.54,
      metalness: 0.18,
    }),
    tombStone: new T.MeshStandardMaterial({
      map: cryptStone.tex,
      normalMap: cryptStoneNormal,
      normalScale: new T.Vector2(0.95, 0.95),
      color: new T.Color('#97a7c0'),
      roughness: 0.56,
      metalness: 0.16,
    }),
    darkWood: new T.MeshStandardMaterial({
      map: darkWood.tex,
      normalMap: darkWoodNormal,
      normalScale: new T.Vector2(0.9, 0.9),
      roughness: 0.68,
      metalness: 0.08,
    }),
    roofSlate: new T.MeshStandardMaterial({
      map: roofSlate.tex,
      normalMap: roofSlateNormal,
      normalScale: new T.Vector2(0.95, 0.95),
      roughness: 0.52,
      metalness: 0.24,
    }),
    iron: wroughtIronMat,
    wroughtIron: wroughtIronMat,
    bark: deadTreeMat,
    DeadTreeMat: deadTreeMat,
    goldRelic: new T.MeshStandardMaterial({
      color: new T.Color('#f4c86a'),
      roughness: 0.22,
      metalness: 0.92,
      emissive: new T.Color('#7a4e12'),
      emissiveIntensity: 0.65,
    }),
    crimsonCarpet: new T.MeshStandardMaterial({
      color: new T.Color('#7c1d2e'),
      roughness: 0.82,
      metalness: 0.06,
      emissive: new T.Color('#28060c'),
      emissiveIntensity: 0.25,
    }),
    candleWax: new T.MeshStandardMaterial({
      color: new T.Color('#f2e5c8'),
      roughness: 0.42,
      metalness: 0.05,
      emissive: new T.Color('#ff9d3b'),
      emissiveIntensity: 0.45,
    }),
    stainedGlass: stainedGlassLancet,
    stainedGlassRose,
    stainedGlassLancet,
    lanternGlow: new T.MeshBasicMaterial({
      color: new T.Color(2.45, 1.82, 0.96),
    }),
    lanternPool: new T.MeshBasicMaterial({
      map: lanternPoolTex,
      transparent: true,
      blending: T.AdditiveBlending,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    }),
    candleFlame: new T.MeshBasicMaterial({
      color: new T.Color(2.85, 2.05, 1.05),
    }),
    moonBeamMat: new T.MeshBasicMaterial({
      map: moonBeamTex,
      transparent: true,
      opacity: 0.52,
      blending: T.AdditiveBlending,
      depthWrite: false,
      side: T.DoubleSide,
    }),
    moteTex,
    shadowTex,
  };
}
