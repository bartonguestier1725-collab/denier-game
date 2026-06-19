/**
 * atmosphere.js — Three.js atmospheric particle effects layer
 *
 * Creates a candlelit gambling hall ambiance:
 *   - Floating golden dust particles
 *   - Candle flicker lighting (warm amber oscillation)
 *   - Subtle camera breathing
 *   - 3D vignette overlay
 *
 * The canvas sits BEHIND the game content (z-index: 0, below table-panel's z-index: 1).
 * Gracefully degrades if Three.js is unavailable.
 * Respects prefers-reduced-motion.
 */

const PARTICLE_COUNT = 65;
const FIELD_WIDTH = 12;
const FIELD_HEIGHT = 10;
const FIELD_DEPTH = 6;
const BREATHING_AMPLITUDE = 0.015;
const BREATHING_PERIOD = 5.0; // seconds

export function initAtmosphere() {
  // --- Guard: reduced motion ---
  const prefersReducedMotion = window.matchMedia(
    '(prefers-reduced-motion: reduce)'
  ).matches;
  if (prefersReducedMotion) return null;

  // --- Guard: Three.js availability ---
  if (typeof THREE === 'undefined') {
    console.warn('[atmosphere] Three.js not loaded — skipping atmospheric effects.');
    return null;
  }

  // --- Canvas element ---
  const canvas = document.getElementById('atmosphere-canvas');
  if (!canvas) {
    console.warn('[atmosphere] #atmosphere-canvas not found.');
    return null;
  }

  // --- Scene setup ---
  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(
    50,
    window.innerWidth / window.innerHeight,
    0.1,
    100
  );
  camera.position.set(0, 0, 8);

  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: false,
    powerPreference: 'low-power',
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setClearColor(0x000000, 0);

  // --- Particles ---
  const positions = new Float32Array(PARTICLE_COUNT * 3);
  const phases = new Float32Array(PARTICLE_COUNT * 3); // per-axis phase offsets
  const speeds = new Float32Array(PARTICLE_COUNT * 3); // per-axis speed multipliers

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const i3 = i * 3;
    // Distribute particles in a 3D volume; sizeAttenuation makes farther ones smaller
    positions[i3] = (Math.random() - 0.5) * FIELD_WIDTH;
    positions[i3 + 1] = (Math.random() - 0.5) * FIELD_HEIGHT;
    positions[i3 + 2] = (Math.random() - 0.5) * FIELD_DEPTH;

    phases[i3] = Math.random() * Math.PI * 2;
    phases[i3 + 1] = Math.random() * Math.PI * 2;
    phases[i3 + 2] = Math.random() * Math.PI * 2;

    speeds[i3] = 0.08 + Math.random() * 0.15;
    speeds[i3 + 1] = 0.05 + Math.random() * 0.12;
    speeds[i3 + 2] = 0.04 + Math.random() * 0.10;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  // Warm golden particle texture (procedural)
  const particleTexture = createParticleTexture();

  const material = new THREE.PointsMaterial({
    size: 0.12,
    sizeAttenuation: true,
    map: particleTexture,
    transparent: true,
    opacity: 0.6,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    color: new THREE.Color(0xffe8b0), // warm golden
  });

  const points = new THREE.Points(geometry, material);
  scene.add(points);

  // --- Candle flicker light ---
  const candleLight = new THREE.PointLight(0xffaa44, 0.35, 30, 1.5);
  candleLight.position.set(0, 2, 6);
  scene.add(candleLight);

  // Secondary dimmer fill light from below
  const fillLight = new THREE.PointLight(0xff8833, 0.12, 25, 2);
  fillLight.position.set(-2, -3, 4);
  scene.add(fillLight);

  // Minimal ambient so particles are always slightly visible
  const ambient = new THREE.AmbientLight(0xffddaa, 0.08);
  scene.add(ambient);

  // --- Vignette (3D quad) ---
  const vignetteTexture = createVignetteTexture();
  const vignetteMaterial = new THREE.MeshBasicMaterial({
    map: vignetteTexture,
    transparent: true,
    depthWrite: false,
    depthTest: false,
  });
  const vignetteMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    vignetteMaterial
  );
  // Render in screen-space by adding to a separate scene rendered with an ortho camera
  const vignetteScene = new THREE.Scene();
  const vignetteCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  vignetteScene.add(vignetteMesh);

  // --- Store initial positions for drift calculation ---
  const basePositions = new Float32Array(positions);

  // --- Animation state ---
  let animationId = null;
  let startTime = performance.now();
  let disposed = false;

  // --- Animation loop ---
  function animate() {
    if (disposed) return;
    animationId = requestAnimationFrame(animate);

    const now = performance.now();
    const elapsed = (now - startTime) / 1000; // seconds

    // Update particle positions (organic drift via sine waves)
    const posAttr = geometry.getAttribute('position');

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const i3 = i * 3;

      // Drift each axis with unique sine combination
      posAttr.array[i3] =
        basePositions[i3] +
        Math.sin(elapsed * speeds[i3] + phases[i3]) * 0.8 +
        Math.sin(elapsed * speeds[i3] * 0.37 + phases[i3] * 1.7) * 0.3;

      posAttr.array[i3 + 1] =
        basePositions[i3 + 1] +
        Math.sin(elapsed * speeds[i3 + 1] + phases[i3 + 1]) * 0.6 +
        Math.cos(elapsed * speeds[i3 + 1] * 0.53 + phases[i3 + 1]) * 0.25;

      posAttr.array[i3 + 2] =
        basePositions[i3 + 2] +
        Math.sin(elapsed * speeds[i3 + 2] + phases[i3 + 2]) * 0.4;
    }
    posAttr.needsUpdate = true;

    // Subtle global glow pulse on all particles (tied to candle rhythm)
    material.opacity =
      0.55 +
      Math.sin(elapsed * 1.1 + 2.5) * 0.08 +
      Math.sin(elapsed * 3.1) * 0.04;

    // Candle flicker: multi-frequency noise approximation
    const flicker =
      0.35 +
      Math.sin(elapsed * 3.1) * 0.05 +
      Math.sin(elapsed * 7.3 + 1.2) * 0.03 +
      Math.sin(elapsed * 13.7 + 0.7) * 0.02 +
      Math.sin(elapsed * 1.1 + 2.5) * 0.04;
    candleLight.intensity = Math.max(0.15, flicker);

    // Fill light flicker (slower, subtler)
    fillLight.intensity =
      0.12 +
      Math.sin(elapsed * 1.7 + 3.0) * 0.03 +
      Math.sin(elapsed * 4.3 + 1.0) * 0.015;

    // Camera breathing
    const breathY =
      Math.sin((elapsed * Math.PI * 2) / BREATHING_PERIOD) * BREATHING_AMPLITUDE;
    const breathRot =
      Math.sin((elapsed * Math.PI * 2) / (BREATHING_PERIOD * 1.3)) *
      0.0008;
    camera.position.y = breathY;
    camera.rotation.z = breathRot;

    // Render main scene then vignette on top
    renderer.render(scene, camera);
    renderer.autoClear = false;
    renderer.render(vignetteScene, vignetteCamera);
    renderer.autoClear = true;
  }

  // --- Resize handler ---
  function onResize() {
    if (disposed) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }
  window.addEventListener('resize', onResize);

  // --- Start ---
  animate();

  // --- Cleanup function ---
  return function cleanup() {
    disposed = true;
    if (animationId !== null) cancelAnimationFrame(animationId);
    window.removeEventListener('resize', onResize);
    geometry.dispose();
    material.dispose();
    particleTexture.dispose();
    vignetteTexture.dispose();
    vignetteMaterial.dispose();
    renderer.dispose();
  };
}

// --- Procedural particle texture (soft circle) ---
function createParticleTexture() {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  const center = size / 2;
  const gradient = ctx.createRadialGradient(center, center, 0, center, center, center);
  gradient.addColorStop(0, 'rgba(255, 240, 200, 1)');
  gradient.addColorStop(0.3, 'rgba(255, 220, 160, 0.8)');
  gradient.addColorStop(0.7, 'rgba(255, 200, 120, 0.2)');
  gradient.addColorStop(1, 'rgba(255, 180, 80, 0)');

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

// --- Procedural vignette texture ---
function createVignetteTexture() {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  const center = size / 2;
  const gradient = ctx.createRadialGradient(center, center, size * 0.15, center, center, center);
  gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
  gradient.addColorStop(0.5, 'rgba(0, 0, 0, 0)');
  gradient.addColorStop(0.8, 'rgba(0, 0, 0, 0.12)');
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0.3)');

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}
