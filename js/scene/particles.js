// Pooled particles: ambient gold dust drifting over the table (ported from
// the old atmosphere layer) + a burst pool for match celebrations (Stage 4).
// Fixed-size pools, CPU-integrated (tiny counts), additive soft dots.
import * as THREE from 'three';

const DUST_COUNT = 90;
const BURST_POOL = 144;

function bakeDotTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  g.addColorStop(0, 'rgba(255, 236, 190, 1)');
  g.addColorStop(0.4, 'rgba(232, 196, 120, 0.55)');
  g.addColorStop(1, 'rgba(220, 180, 90, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export function createParticles({ scene }) {
  const dotTexture = bakeDotTexture();

  // --- Ambient dust ---
  const dust = [];
  const dustPositions = new Float32Array(DUST_COUNT * 3);
  for (let i = 0; i < DUST_COUNT; i++) {
    dust.push({
      x: (Math.random() - 0.5) * 120,
      y: 1.5 + Math.random() * 16,
      z: (Math.random() - 0.5) * 85,
      phase: Math.random() * Math.PI * 2,
      speed: 0.15 + Math.random() * 0.35,
      amp: 1.2 + Math.random() * 2.6,
    });
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
  const dustMat = new THREE.PointsMaterial({
    map: dotTexture,
    size: 0.55,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.5,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const dustPoints = new THREE.Points(dustGeo, dustMat);
  dustPoints.frustumCulled = false;
  dustPoints.renderOrder = 4;
  scene.add(dustPoints);

  // --- Burst pool (gold sparks for matches — armed here, fired in Stage 4) ---
  const bursts = Array.from({ length: BURST_POOL }, () => ({
    life: 0, ttl: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0,
  }));
  const burstPositions = new Float32Array(BURST_POOL * 3);
  const burstGeo = new THREE.BufferGeometry();
  burstGeo.setAttribute('position', new THREE.BufferAttribute(burstPositions, 3));
  const burstMat = new THREE.PointsMaterial({
    map: dotTexture,
    size: 0.9,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const burstPoints = new THREE.Points(burstGeo, burstMat);
  burstPoints.frustumCulled = false;
  burstPoints.renderOrder = 4;
  scene.add(burstPoints);
  let burstCursor = 0;

  function burst(x, y, z, count = 36) {
    for (let i = 0; i < count; i++) {
      const p = bursts[burstCursor];
      burstCursor = (burstCursor + 1) % BURST_POOL;
      const ang = Math.random() * Math.PI * 2;
      const up = 4 + Math.random() * 9;
      const out = 2 + Math.random() * 7;
      p.life = p.ttl = 0.7 + Math.random() * 0.6;
      p.x = x; p.y = y + 0.5; p.z = z;
      p.vx = Math.cos(ang) * out;
      p.vy = up;
      p.vz = Math.sin(ang) * out;
    }
  }

  const HIDDEN_Y = -100;

  function update(dt, t) {
    for (let i = 0; i < DUST_COUNT; i++) {
      const d = dust[i];
      dustPositions[i * 3] = d.x + Math.sin(t * d.speed + d.phase) * d.amp;
      dustPositions[i * 3 + 1] = d.y + Math.sin(t * d.speed * 0.7 + d.phase * 1.3) * d.amp * 0.45;
      dustPositions[i * 3 + 2] = d.z + Math.cos(t * d.speed * 0.5 + d.phase) * d.amp * 0.8;
    }
    dustGeo.attributes.position.needsUpdate = true;

    for (let i = 0; i < BURST_POOL; i++) {
      const p = bursts[i];
      if (p.life > 0) {
        p.life -= dt;
        p.vy -= 22 * dt; // gravity
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        if (p.y < 0.2) { p.y = 0.2; p.vy *= -0.35; } // felt bounce
        burstPositions[i * 3] = p.x;
        burstPositions[i * 3 + 1] = p.y;
        burstPositions[i * 3 + 2] = p.z;
      } else {
        burstPositions[i * 3 + 1] = HIDDEN_Y;
      }
    }
    burstGeo.attributes.position.needsUpdate = true;
  }

  return { update, burst };
}
