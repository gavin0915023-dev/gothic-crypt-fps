import * as T from 'three';

// Procedural moonlit Gothic sky dome & PMREM environment (Identity V Red Church / Crypt atmosphere).
// Balances eerie moonlit ambiance with crisp tactical silhouette readability.

export function createGothicSky(renderer) {
  const width = 512, height = 256;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  // Deep indigo-teal twilight gradient down to misty blue-grey horizon
  const skyGrad = ctx.createLinearGradient(0, 0, 0, height);
  skyGrad.addColorStop(0.00, '#0a101d');
  skyGrad.addColorStop(0.28, '#142034');
  skyGrad.addColorStop(0.47, '#223447');
  skyGrad.addColorStop(0.54, '#2d4152');
  skyGrad.addColorStop(0.62, '#1d2b38');
  skyGrad.addColorStop(1.00, '#121a22');
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, width, height);

  // Subtle scattered high stars
  let s = 481516;
  const rand = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  for (let i = 0; i < 160; i++) {
    const x = rand() * width;
    const y = rand() * height * .42;
    const r = .4 + rand() * 1.05;
    ctx.fillStyle = `rgba(215,232,250,${(.22 + rand() * .48).toFixed(2)})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Large pale harvest moon & glowing atmospheric halo (matching moon DirectionalLight direction)
  const mx = width * .74, my = height * .25;
  const halo = ctx.createRadialGradient(mx, my, 4, mx, my, 76);
  halo.addColorStop(0.0, 'rgba(244,242,226,0.95)');
  halo.addColorStop(0.16, 'rgba(214,228,244,0.55)');
  halo.addColorStop(0.45, 'rgba(130,170,210,0.18)');
  halo.addColorStop(1.0, 'rgba(40,65,92,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(mx - 80, my - 80, 160, 160);

  // Moon disc with subtle craters
  ctx.fillStyle = '#f2efe2';
  ctx.beginPath();
  ctx.arc(mx, my, 12.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(162,172,182,0.34)';
  for (const [dx, dy, r] of [[-3.5, -2, 3.2], [4, 2.5, 2.5], [-1, 4.5, 2.1], [2.5, -4, 1.8]]) {
    ctx.beginPath();
    ctx.arc(mx + dx, my + dy, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Wispy Gothic moonlit clouds drifting across mid-sky
  for (let i = 0; i < 34; i++) {
    const cx = rand() * width;
    const cy = height * (.20 + rand() * .29);
    const rx = 22 + rand() * 54;
    const ry = 4 + rand() * 11;
    const nearMoon = Math.max(0, 1 - Math.hypot(cx - mx, cy - my) / 130);
    const cg = ctx.createRadialGradient(cx, cy, 1, cx, cy, rx);
    const col = nearMoon > .3 ? '176,198,218' : '74,98,122';
    cg.addColorStop(0, `rgba(${col},${(.10 + nearMoon * .14).toFixed(2)})`);
    cg.addColorStop(1, `rgba(${col},0)`);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1, ry / rx);
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.arc(0, 0, rx, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  const skyTex = new T.CanvasTexture(canvas);
  skyTex.mapping = T.EquirectangularReflectionMapping;
  skyTex.colorSpace = T.SRGBColorSpace;
  skyTex.needsUpdate = true;

  const pmrem = new T.PMREMGenerator(renderer);
  const envRT = pmrem.fromEquirectangular(skyTex);
  pmrem.dispose();

  return { background: skyTex, environment: envRT.texture };
}
