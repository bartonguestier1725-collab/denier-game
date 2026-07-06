// Renderer foundation: color pipeline (sRGB out + ACES), quality tiers,
// PMREM environment, resize, visibility pause, context-loss recovery,
// desktop HDR post stack, and an FPS watchdog with a degrade ladder:
// DPR steps -> bloom off -> composer off.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { tickTweens } from './anim.js';

export function detectTier() {
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const small = Math.min(window.innerWidth, window.innerHeight) < 700;
  const mobile = coarse && (small || navigator.maxTouchPoints > 0);
  return mobile
    ? { name: 'mobile', maxDPR: 1.5, texScale: 0.5, anisotropy: 4, post: false }
    : { name: 'desktop', maxDPR: 2, texScale: 1, anisotropy: 8, post: true };
}

// Final LDR pass: chromatic aberration + saturation/tint grade + vignette +
// animated grain. Runs AFTER OutputPass (post-tonemap, sRGB space).
const GradeShader = {
  name: 'GradeShader',
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uGrain: { value: 0.045 },
    uVignette: { value: 1.12 },
    uSaturation: { value: 1.02 },
    uCA: { value: 1.15 },
    uTint: { value: new THREE.Vector3(1.0, 0.985, 0.955) },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uGrain;
    uniform float uVignette;
    uniform float uSaturation;
    uniform float uCA;
    uniform vec3 uTint;
    varying vec2 vUv;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
    }

    void main() {
      vec2 d = vUv - 0.5;
      float r2 = dot(d, d);

      vec2 off = d * r2 * 0.012 * uCA;
      vec3 col;
      col.r = texture2D(tDiffuse, vUv + off).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv - off).b;

      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, uSaturation);
      col *= uTint;

      float vig = smoothstep(0.9, 0.2, r2 * uVignette);
      col *= mix(0.5, 1.0, vig);

      float g = hash(vUv * vec2(1287.0, 718.0) + fract(uTime * 0.61) * 43.7) - 0.5;
      col += g * uGrain;

      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

export function createEngine(canvas, tier, { debug = false } = {}) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
    stencil: false,
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;

  let dpr = Math.min(window.devicePixelRatio || 1, tier.maxDPR);
  renderer.setPixelRatio(dpr);
  renderer.setSize(window.innerWidth, window.innerHeight, false);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x070503);
  scene.fog = new THREE.FogExp2(0x070503, 0.0035);

  const camera = new THREE.PerspectiveCamera(
    39, window.innerWidth / window.innerHeight, 1, 900,
  );

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.35;
  pmrem.dispose();

  // --- Post stack (desktop tier): HDR render -> bloom (threshold 1.0 = only
  // true HDR highlights: flames, foil glints) -> tonemap/sRGB -> grade ---
  let composer = null;
  let bloomPass = null;
  let gradePass = null;

  if (tier.post && renderer.capabilities.isWebGL2) {
    const size = new THREE.Vector2();
    renderer.getDrawingBufferSize(size);
    const target = new THREE.WebGLRenderTarget(size.x, size.y, {
      type: THREE.HalfFloatType,
      samples: 4, // MSAA inside the composer
    });
    composer = new EffectComposer(renderer, target);
    composer.setPixelRatio(dpr);
    composer.setSize(window.innerWidth, window.innerHeight);

    composer.addPass(new RenderPass(scene, camera));
    bloomPass = new UnrealBloomPass(size.clone(), 0.55, 0.4, 1.0);
    composer.addPass(bloomPass);
    composer.addPass(new OutputPass());
    gradePass = new ShaderPass(GradeShader);
    composer.addPass(gradePass);
    document.body.dataset.post = '1';
  } else {
    document.body.dataset.post = '0';
  }

  const frameCbs = new Set();
  const resizeCbs = new Set();
  let contextRestoreCb = null;

  const clock = new THREE.Clock();
  let running = false;
  let rafId = 0;
  let elapsed = 0;

  // Watchdog + degrade ladder
  let frames = 0;
  let windowStart = 0;
  let fpsEl = null;
  if (debug) {
    fpsEl = document.createElement('div');
    fpsEl.style.cssText =
      'position:fixed;top:4px;left:6px;z-index:999;color:#0f0;font:12px monospace;pointer-events:none;';
    document.body.appendChild(fpsEl);
  }

  function applyDPR(v) {
    dpr = v;
    renderer.setPixelRatio(dpr);
    if (composer) {
      composer.setPixelRatio(dpr);
      composer.setSize(window.innerWidth, window.innerHeight);
    }
  }

  function degradeOnce(fps) {
    if (dpr > 1) {
      applyDPR(Math.max(1, dpr - 0.25));
      console.info(`[engine] fps ${fps.toFixed(0)} — DPR down to ${dpr}`);
    } else if (bloomPass && bloomPass.enabled) {
      bloomPass.enabled = false;
      console.info(`[engine] fps ${fps.toFixed(0)} — bloom off`);
    } else if (composer) {
      composer = null;
      document.body.dataset.post = '0';
      console.info(`[engine] fps ${fps.toFixed(0)} — post stack off`);
    }
  }

  function loop() {
    rafId = requestAnimationFrame(loop);
    const rawDt = clock.getDelta();
    // Scene simulation clamps to 0.1 (sanity on huge gaps) but tweens are pure
    // interpolation — tick them on near-real time so animations (and the
    // input unlock that waits on them) finish on schedule even at 3fps.
    const dt = Math.min(rawDt, 0.1);
    elapsed += dt;
    tickTweens(Math.min(rawDt, 1));
    for (const cb of frameCbs) cb(dt, elapsed);

    if (composer) {
      if (gradePass) gradePass.uniforms.uTime.value = elapsed;
      composer.render(dt);
    } else {
      renderer.render(scene, camera);
    }

    frames++;
    const span = elapsed - windowStart;
    if (span >= 4) {
      const fps = frames / span;
      frames = 0;
      windowStart = elapsed;
      if (fps < 42) degradeOnce(fps);
      if (fpsEl) {
        fpsEl.textContent =
          `${fps.toFixed(0)} fps  dpr ${dpr.toFixed(2)}  post ${composer ? 'on' : 'off'}`;
      }
    }
  }

  function start() {
    if (running) return;
    running = true;
    clock.getDelta(); // swallow the pause gap
    rafId = requestAnimationFrame(loop);
  }

  function stop() {
    running = false;
    cancelAnimationFrame(rafId);
  }

  function onWindowResize() {
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    if (composer) composer.setSize(window.innerWidth, window.innerHeight);
    for (const cb of resizeCbs) cb();
  }

  window.addEventListener('resize', onWindowResize);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop(); else start();
  });
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    stop();
  });
  canvas.addEventListener('webglcontextrestored', () => {
    if (contextRestoreCb) contextRestoreCb();
    start();
  });

  /** Difficulty mood for the grade pass (no-op when post is off). */
  function setGrade({ saturation, tint, vignette, grain, ca } = {}) {
    if (!gradePass) return;
    const u = gradePass.uniforms;
    if (saturation != null) u.uSaturation.value = saturation;
    if (vignette != null) u.uVignette.value = vignette;
    if (grain != null) u.uGrain.value = grain;
    if (ca != null) u.uCA.value = ca;
    if (tint) u.uTint.value.set(tint[0], tint[1], tint[2]);
  }

  return {
    renderer,
    scene,
    camera,
    start,
    stop,
    onFrame: (cb) => frameCbs.add(cb),
    onResize: (cb) => resizeCbs.add(cb),
    setContextRestore: (cb) => { contextRestoreCb = cb; },
    setExposure: (v) => { renderer.toneMappingExposure = v; },
    setFogDensity: (v) => { scene.fog.density = v; },
    setGrade,
    compile: () => {
      renderer.compile(scene, camera);
      if (composer) composer.render(0.016); // warm the pass programs too
    },
  };
}
