// Renderer foundation: color pipeline (sRGB out + ACES), quality tiers,
// PMREM environment, resize, visibility pause, context-loss recovery,
// and an FPS watchdog that steps DPR down on weak GPUs.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { tickTweens } from './anim.js';

export function detectTier() {
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const small = Math.min(window.innerWidth, window.innerHeight) < 700;
  const mobile = coarse && (small || navigator.maxTouchPoints > 0);
  return mobile
    ? { name: 'mobile', maxDPR: 1.5, texScale: 0.5, anisotropy: 4 }
    : { name: 'desktop', maxDPR: 2, texScale: 1, anisotropy: 8 };
}

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

  const frameCbs = new Set();
  const resizeCbs = new Set();
  let contextRestoreCb = null;

  const clock = new THREE.Clock();
  let running = false;
  let rafId = 0;
  let elapsed = 0;

  // Watchdog
  let frames = 0;
  let windowStart = 0;
  let fpsEl = null;
  if (debug) {
    fpsEl = document.createElement('div');
    fpsEl.style.cssText =
      'position:fixed;top:4px;left:6px;z-index:999;color:#0f0;font:12px monospace;pointer-events:none;';
    document.body.appendChild(fpsEl);
  }

  function loop() {
    rafId = requestAnimationFrame(loop);
    // Clamp only pathological gaps (tab resume); 0.1 keeps animations
    // real-time even on slow GPUs down to 10fps.
    const dt = Math.min(clock.getDelta(), 0.1);
    elapsed += dt;
    tickTweens(dt);
    for (const cb of frameCbs) cb(dt, elapsed);
    renderer.render(scene, camera);

    frames++;
    const span = elapsed - windowStart;
    if (span >= 4) {
      const fps = frames / span;
      frames = 0;
      windowStart = elapsed;
      if (fps < 42 && dpr > 1) {
        dpr = Math.max(1, dpr - 0.25);
        renderer.setPixelRatio(dpr);
        console.info(`[engine] fps ${fps.toFixed(0)} — stepping DPR down to ${dpr}`);
      }
      if (fpsEl) fpsEl.textContent = `${fps.toFixed(0)} fps  dpr ${dpr.toFixed(2)}`;
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
    compile: () => renderer.compile(scene, camera),
  };
}
