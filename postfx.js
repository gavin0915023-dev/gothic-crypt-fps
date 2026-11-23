import * as T from 'three';

/**
 * URP-style HDR Post-Processing Pipeline for Gothic Crypt FPS (WebGL1/WebGL2 + SwiftShader safe):
 * 1. Renders main 3D scene to an offscreen HDR/Linear RenderTarget (with DepthBuffer).
 * 2. Extracts soft-knee bright highlights (stained-glass windows, lanterns, altar candles, muzzle flash, operator visors) at 1/2 resolution.
 * 3. Runs a 2-tier multi-scale separable Gaussian Bloom pyramid (1/2 res + 1/4 res).
 * 4. Composites Base + Dual-Tier Bloom with ACES Filmic Tonemapping, Gothic Cool/Warm Split-Toning, Indigo Vignette, and subtle Film Grain.
 */
export function createGothicPostFX(renderer) {
  const isWebGL2 = Boolean(renderer.capabilities?.isWebGL2);
  const canFloatFBO = Boolean(
    (isWebGL2 && renderer.extensions?.get?.('EXT_color_buffer_float')) ||
    renderer.extensions?.get?.('EXT_color_buffer_half_float')
  );
  const targetType = canFloatFBO ? T.HalfFloatType : T.UnsignedByteType;

  const makeRT = (w, h, withDepth = false) => new T.WebGLRenderTarget(Math.max(2, w), Math.max(2, h), {
    type: targetType,
    format: T.RGBAFormat,
    minFilter: T.LinearFilter,
    magFilter: T.LinearFilter,
    depthBuffer: withDepth,
    stencilBuffer: false,
    samples: 0,
  });

  let width = 1280;
  let height = 720;
  let sceneRT = makeRT(width, height, true);
  let bloomRT1A = makeRT(width >> 1, height >> 1, false);
  let bloomRT1B = makeRT(width >> 1, height >> 1, false);
  let bloomRT2A = makeRT(width >> 2, height >> 2, false);
  let bloomRT2B = makeRT(width >> 2, height >> 2, false);

  const fsCamera = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const fsGeo = new T.PlaneGeometry(2, 2);

  const vertShader = /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position.xy, 0.0, 1.0);
    }
  `;

  // Soft-knee bright pass shader (URP Bloom prefilter curve)
  const brightMat = new T.ShaderMaterial({
    uniforms: {
      tDiffuse: { value: null },
      uThreshold: { value: 0.72 },
      uSoftKnee: { value: 0.42 },
      uTexelSize: { value: new T.Vector2(1 / 640, 1 / 360) },
    },
    vertexShader: vertShader,
    fragmentShader: /* glsl */`
      varying vec2 vUv;
      uniform sampler2D tDiffuse;
      uniform float uThreshold;
      uniform float uSoftKnee;
      uniform vec2 uTexelSize;

      vec3 sampleBox4(sampler2D tex, vec2 uv, vec2 texel) {
        vec3 c0 = texture2D(tex, uv + vec2(-0.75, -0.75) * texel).rgb;
        vec3 c1 = texture2D(tex, uv + vec2( 0.75, -0.75) * texel).rgb;
        vec3 c2 = texture2D(tex, uv + vec2(-0.75,  0.75) * texel).rgb;
        vec3 c3 = texture2D(tex, uv + vec2( 0.75,  0.75) * texel).rgb;
        return 0.25 * (c0 + c1 + c2 + c3);
      }

      void main() {
        vec3 col = max(sampleBox4(tDiffuse, vUv, uTexelSize), vec3(0.0));
        float br = max(col.r, max(col.g, col.b));
        float knee = uThreshold * uSoftKnee + 1e-4;
        float soft = clamp(br - uThreshold + knee, 0.0, 2.0 * knee);
        soft = (soft * soft) / (4.0 * knee + 1e-4);
        float contrib = max(soft, br - uThreshold) / max(br, 1e-4);
        gl_FragColor = vec4(min(col * contrib, vec3(10.0)), 1.0);
      }
    `,
    depthTest: false,
    depthWrite: false,
  });

  // 9-tap separable Gaussian blur shader
  const blurMat = new T.ShaderMaterial({
    uniforms: {
      tDiffuse: { value: null },
      uDirection: { value: new T.Vector2(1 / 640, 0) },
    },
    vertexShader: vertShader,
    fragmentShader: /* glsl */`
      varying vec2 vUv;
      uniform sampler2D tDiffuse;
      uniform vec2 uDirection;

      void main() {
        vec2 off1 = uDirection * 1.3846153846;
        vec2 off2 = uDirection * 3.2307692308;
        vec3 sum = texture2D(tDiffuse, vUv).rgb * 0.2270270270;
        sum += texture2D(tDiffuse, vUv + off1).rgb * 0.3162162162;
        sum += texture2D(tDiffuse, vUv - off1).rgb * 0.3162162162;
        sum += texture2D(tDiffuse, vUv + off2).rgb * 0.0702702703;
        sum += texture2D(tDiffuse, vUv - off2).rgb * 0.0702702703;
        gl_FragColor = vec4(sum, 1.0);
      }
    `,
    depthTest: false,
    depthWrite: false,
  });

  // Final URP-style composite: Base + Multi-scale Bloom + ACES Filmic + Cool/Warm Split-Toning + Vignette + Film Grain
  const compositeMat = new T.ShaderMaterial({
    uniforms: {
      tBase: { value: null },
      tBloom1: { value: null },
      tBloom2: { value: null },
      uBloomStrength: { value: 0.72 },
      uExposure: { value: 1.24 },
      uVignette: { value: 0.30 },
      uTime: { value: 0.0 },
    },
    vertexShader: vertShader,
    fragmentShader: /* glsl */`
      varying vec2 vUv;
      uniform sampler2D tBase;
      uniform sampler2D tBloom1;
      uniform sampler2D tBloom2;
      uniform float uBloomStrength;
      uniform float uExposure;
      uniform float uVignette;
      uniform float uTime;

      vec3 ACESFilm(vec3 x) {
        const float a = 2.51;
        const float b = 0.03;
        const float c = 2.43;
        const float d = 0.59;
        const float e = 0.14;
        return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
      }

      void main() {
        vec3 baseCol = texture2D(tBase, vUv).rgb;
        vec3 b1 = texture2D(tBloom1, vUv).rgb;
        vec3 b2 = texture2D(tBloom2, vUv).rgb;
        vec3 bloom = (b1 * 0.62 + b2 * 0.88) * uBloomStrength;

        vec3 hdr = (baseCol + bloom) * uExposure;
        vec3 mapped = ACESFilm(hdr);

        // Gothic Cool/Warm Split-Toning (indigo shadows + warm candlelight highlights) & contrast S-curve
        float luma = dot(mapped, vec3(0.2126, 0.7152, 0.0722));
        vec3 shadowTint = vec3(0.91, 0.96, 1.07);
        vec3 highTint   = vec3(1.06, 1.01, 0.93);
        mapped *= mix(shadowTint, highTint, smoothstep(0.14, 0.84, luma));

        // Saturation lift (+15%)
        luma = dot(mapped, vec3(0.2126, 0.7152, 0.0722));
        mapped = mix(vec3(luma), mapped, 1.15);

        // Indigo cathedral vignette
        vec2 centered = vUv - 0.5;
        float distSq = dot(centered, centered);
        float vig = clamp(1.0 - distSq * (uVignette * 2.15), 0.36, 1.0);
        mapped = mix(vec3(0.025, 0.032, 0.058), mapped, vig);

        // Linear to sRGB gamma
        vec3 srgb = pow(max(mapped, vec3(0.0)), vec3(1.0 / 2.2));

        // Subtle dithering / film grain to prevent night-sky banding
        float grain = fract(sin(dot(vUv * 512.0 + fract(uTime * 0.37), vec2(12.9898, 78.233))) * 43758.5453);
        srgb += (grain - 0.5) * 0.011;

        gl_FragColor = vec4(clamp(srgb, 0.0, 1.0), 1.0);
      }
    `,
    depthTest: false,
    depthWrite: false,
  });

  const fsQuad = new T.Mesh(fsGeo, brightMat);
  const fsScene = new T.Scene();
  fsScene.add(fsQuad);

  function setSize(w, h, dpr = 1) {
    const pw = Math.max(4, Math.floor(w * dpr));
    const ph = Math.max(4, Math.floor(h * dpr));
    if (pw === width && ph === height) return;
    width = pw;
    height = ph;
    sceneRT.setSize(width, height);
    const w1 = Math.max(2, width >> 1);
    const h1 = Math.max(2, height >> 1);
    const w2 = Math.max(2, width >> 2);
    const h2 = Math.max(2, height >> 2);
    bloomRT1A.setSize(w1, h1);
    bloomRT1B.setSize(w1, h1);
    bloomRT2A.setSize(w2, h2);
    bloomRT2B.setSize(w2, h2);
  }

  function render(scene, camera, timeSec = 0) {
    const prevAutoClear = renderer.autoClear;
    const prevToneMapping = renderer.toneMapping;
    // Disable built-in renderer tonemapping while rendering to offscreen HDR target; composite shader applies ACES + sRGB
    renderer.toneMapping = T.NoToneMapping;

    // 1. Render main 3D scene into sceneRT
    renderer.setRenderTarget(sceneRT);
    renderer.clear(true, true, false);
    renderer.render(scene, camera);

    const w1 = Math.max(2, width >> 1);
    const h1 = Math.max(2, height >> 1);
    const w2 = Math.max(2, width >> 2);
    const h2 = Math.max(2, height >> 2);

    // 2. Bright-pass prefilter to bloomRT1A (1/2 res)
    fsQuad.material = brightMat;
    brightMat.uniforms.tDiffuse.value = sceneRT.texture;
    brightMat.uniforms.uTexelSize.value.set(1 / width, 1 / height);
    renderer.setRenderTarget(bloomRT1A);
    renderer.render(fsScene, fsCamera);

    // 3. Blur Tier 1 (1/2 res horizontal + vertical)
    fsQuad.material = blurMat;
    blurMat.uniforms.tDiffuse.value = bloomRT1A.texture;
    blurMat.uniforms.uDirection.value.set(1.25 / w1, 0);
    renderer.setRenderTarget(bloomRT1B);
    renderer.render(fsScene, fsCamera);

    blurMat.uniforms.tDiffuse.value = bloomRT1B.texture;
    blurMat.uniforms.uDirection.value.set(0, 1.25 / h1);
    renderer.setRenderTarget(bloomRT1A);
    renderer.render(fsScene, fsCamera);

    // 4. Downsample + Blur Tier 2 (1/4 res wide halo horizontal + vertical)
    blurMat.uniforms.tDiffuse.value = bloomRT1A.texture;
    blurMat.uniforms.uDirection.value.set(1.65 / w2, 0);
    renderer.setRenderTarget(bloomRT2B);
    renderer.render(fsScene, fsCamera);

    blurMat.uniforms.tDiffuse.value = bloomRT2B.texture;
    blurMat.uniforms.uDirection.value.set(0, 1.65 / h2);
    renderer.setRenderTarget(bloomRT2A);
    renderer.render(fsScene, fsCamera);

    // 5. Final ACES + Dual-Bloom + Split-Toning + Vignette composite to screen
    fsQuad.material = compositeMat;
    compositeMat.uniforms.tBase.value = sceneRT.texture;
    compositeMat.uniforms.tBloom1.value = bloomRT1A.texture;
    compositeMat.uniforms.tBloom2.value = bloomRT2A.texture;
    compositeMat.uniforms.uTime.value = timeSec;
    renderer.setRenderTarget(null);
    renderer.render(fsScene, fsCamera);

    renderer.toneMapping = prevToneMapping;
    renderer.autoClear = prevAutoClear;
  }

  return { setSize, render };
}
