import * as T from 'three';

/**
 * Generates an atmospheric 1024x512 moonlit Gothic sky equirectangular texture
 * and sets both scene.background and scene.environment (via PMREMGenerator)
 * so wet cobblestones, wrought iron, brass gun filigree, and tombstones receive true PBR reflections.
 */
export function applyGothicSkyAndEnvironment(renderer, scene) {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 512;
  const g = c.getContext('2d');

  // Twilight moonlit zenith -> luminous indigo cathedral horizon -> warm ground bounce
  const grad = g.createLinearGradient(0, 0, 0, c.height);
  grad.addColorStop(0.00, '#0d1628');
  grad.addColorStop(0.24, '#1b2e4f');
  grad.addColorStop(0.46, '#2d4975');
  grad.addColorStop(0.54, '#3c5a86');
  grad.addColorStop(0.66, '#26293d');
  grad.addColorStop(1.00, '#141724');
  g.fillStyle = grad;
  g.fillRect(0, 0, c.width, c.height);

  // Subtle volumetric moonlit storm clouds across the upper hemisphere
  for (let i = 0; i < 42; i++) {
    const cx = ((i * 97 + 43) % c.width);
    const cy = 58 + ((i * 53) % 175);
    const rx = 70 + (i % 6) * 28;
    const ry = 18 + (i % 4) * 9;
    const cg = g.createRadialGradient(cx, cy, 4, cx, cy, rx);
    const alpha = 0.06 + (i % 3) * 0.03;
    cg.addColorStop(0, `rgba(145, 180, 232, ${alpha})`);
    cg.addColorStop(0.6, `rgba(92, 126, 182, ${alpha * 0.55})`);
    cg.addColorStop(1, 'rgba(30, 48, 78, 0)');
    g.fillStyle = cg;
    g.save();
    g.translate(cx, cy);
    g.scale(1, ry / rx);
    g.beginPath();
    g.arc(0, 0, rx, 0, Math.PI * 2);
    g.restore();
    g.fill();
  }

  // Stars in upper sky dome
  for (let i = 0; i < 240; i++) {
    const x = (i * 173 + 29) % c.width;
    const y = (i * 89 + 13) % 215;
    const a = 0.25 + ((i * 31) % 70) / 100;
    const sz = (i % 9 === 0) ? 2.2 : 1.3;
    g.fillStyle = `rgba(225, 238, 255, ${a})`;
    g.fillRect(x, y, sz, sz);
  }

  // Full Gothic Harvest Moon halo + silver-blue core disc
  const mx = 740, my = 112;
  const moonHalo = g.createRadialGradient(mx, my, 8, mx, my, 185);
  moonHalo.addColorStop(0.00, 'rgba(255, 252, 240, 1.0)');
  moonHalo.addColorStop(0.11, 'rgba(230, 242, 255, 0.94)');
  moonHalo.addColorStop(0.28, 'rgba(165, 202, 255, 0.45)');
  moonHalo.addColorStop(0.58, 'rgba(105, 148, 220, 0.16)');
  moonHalo.addColorStop(1.00, 'rgba(40, 62, 102, 0.0)');
  g.fillStyle = moonHalo;
  g.beginPath();
  g.arc(mx, my, 185, 0, Math.PI * 2);
  g.fill();

  // Warm rose-window & candle bounce glow along the horizon so metal/wet ground reflects warm & cool contrast
  for (const [wx, wy, col] of [
    [220, 258, '255, 165, 95'],
    [512, 254, '235, 110, 130'],
    [830, 258, '255, 175, 102'],
  ]) {
    const wg = g.createRadialGradient(wx, wy, 6, wx, wy, 145);
    wg.addColorStop(0, `rgba(${col}, 0.34)`);
    wg.addColorStop(0.5, `rgba(${col}, 0.12)`);
    wg.addColorStop(1, `rgba(${col}, 0.0)`);
    g.fillStyle = wg;
    g.beginPath();
    g.arc(wx, wy, 145, 0, Math.PI * 2);
    g.fill();
  }

  const skyTex = new T.CanvasTexture(c);
  skyTex.mapping = T.EquirectangularReflectionMapping;
  skyTex.colorSpace = T.SRGBColorSpace;

  const pmrem = new T.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const envRT = pmrem.fromEquirectangular(skyTex);

  scene.background = skyTex;
  scene.environment = envRT.texture;
  scene.environmentIntensity = 1.38;
  pmrem.dispose();
  return { background: skyTex, environment: envRT.texture };
}

export function createGothicSky(renderer) {
  const dummyScene = new T.Scene();
  return applyGothicSkyAndEnvironment(renderer, dummyScene);
}
