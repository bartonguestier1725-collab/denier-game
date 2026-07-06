// Lighting rig + physical candle props. Per the art direction there are NO
// shadow-casting lights (blob contact shadows ground the cards); candles are
// shadowless flicker PointLights. The single flicker value drives: the lights,
// the flame sprites, the table light pools, the photo brightness (table.js),
// and the HUD warmth CSS var (view3d.js) — one shared breath.
import * as THREE from 'three';

function bakeFlameTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 78, 2, 32, 72, 46);
  g.addColorStop(0, 'rgba(255, 252, 235, 1)');
  g.addColorStop(0.25, 'rgba(255, 214, 130, 0.9)');
  g.addColorStop(0.55, 'rgba(255, 140, 40, 0.45)');
  g.addColorStop(1, 'rgba(255, 90, 20, 0)');
  ctx.fillStyle = g;
  // teardrop: squash the gradient vertically toward the tip
  ctx.save();
  ctx.translate(32, 64);
  ctx.scale(0.55, 1);
  ctx.translate(-32, -64);
  ctx.fillRect(0, 0, 64, 128);
  ctx.restore();
  return new THREE.CanvasTexture(c);
}

function bakePoolTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
  g.addColorStop(0, 'rgba(255, 170, 80, 0.55)');
  g.addColorStop(0.5, 'rgba(255, 140, 60, 0.22)');
  g.addColorStop(1, 'rgba(255, 120, 50, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

function buildCandelabra(goldMat, waxMat, flameTexture) {
  const g = new THREE.Group();

  const base = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 2.3, 0.7, 24), goldMat);
  base.position.y = 0.35;
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.55, 4.2, 16), goldMat);
  stem.position.y = 2.8;
  const knop = new THREE.Mesh(new THREE.SphereGeometry(0.62, 16, 12), goldMat);
  knop.position.y = 2.6;
  const pan = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 0.75, 0.5, 20), goldMat);
  pan.position.y = 5.15;
  const candle = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.58, 3.2, 16), waxMat);
  candle.position.y = 7.0;

  const flame = new THREE.Sprite(new THREE.SpriteMaterial({
    map: flameTexture,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
  }));
  flame.scale.set(1.5, 2.6, 1);
  flame.position.y = 9.35;
  flame.renderOrder = 5;

  g.add(base, stem, knop, pan, candle, flame);
  return { group: g, flame };
}

export function createLights({ scene }) {
  const hemi = new THREE.HemisphereLight(0x3a2f1e, 0x0a0603, 0.55);
  scene.add(hemi);

  const key = new THREE.DirectionalLight(0xffd7a1, 1.05);
  key.position.set(30, 60, 25);
  scene.add(key);

  const goldMat = new THREE.MeshStandardMaterial({
    color: 0xb9964a, metalness: 0.9, roughness: 0.32, envMapIntensity: 1.2,
  });
  // Unlit wax: the candle sits centimeters from its own point light — lit
  // materials there blow out to a white square under ACES + bloom.
  const waxMat = new THREE.MeshBasicMaterial({ color: 0xd8c9a8 });
  const flameTexture = bakeFlameTexture();
  const poolTexture = bakePoolTexture();

  const candles = [
    { tint: 0xff9a3f, intensity: 320, phase: 0 },
    { tint: 0xffa354, intensity: 260, phase: 1.7 },
  ].map(({ tint, intensity, phase }) => {
    const prop = buildCandelabra(goldMat, waxMat, flameTexture);
    const light = new THREE.PointLight(tint, intensity, 0, 2);
    light.position.y = 9.35;
    prop.group.add(light);

    const pool = new THREE.Mesh(
      new THREE.PlaneGeometry(30, 24),
      new THREE.MeshBasicMaterial({
        map: poolTexture,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
        opacity: 0.1,
      }),
    );
    pool.rotation.x = -Math.PI / 2;
    pool.position.y = 0.015;
    pool.renderOrder = 1;

    scene.add(prop.group, pool);
    return { ...prop, light, pool, baseIntensity: intensity, phase };
  });

  const base = { hemi: hemi.intensity, key: key.intensity };
  let mood = 1;
  let flicker = 1;
  let reduced = false;

  function setReducedMotion(v) { reduced = v; }

  /** Park candelabras just beyond the grid corners. */
  function setLayout(spanW, spanH) {
    const [a, b] = candles;
    a.group.position.set(-(spanW / 2 + 11), 0, -spanH * 0.18);
    b.group.position.set(spanW / 2 + 11, 0, spanH * 0.1);
    for (const c of [a, b]) {
      c.pool.position.set(c.group.position.x, 0.015, c.group.position.z);
    }
  }

  function setDifficulty(difficulty) {
    const nightmare = difficulty === 'nightmare';
    mood = nightmare ? 0.52 : 1;
    hemi.color.setHex(nightmare ? 0x2a2030 : 0x3a2f1e);
    candles[0].light.color.setHex(nightmare ? 0xe07028 : 0xff9a3f);
    candles[1].light.color.setHex(nightmare ? 0xd86420 : 0xffa354);
    return {
      exposure: nightmare ? 0.88 : 1.12,
      fogDensity: nightmare ? 0.0052 : 0.0035,
    };
  }

  function update(t) {
    flicker = reduced
      ? 1
      : 0.88
        + 0.07 * Math.sin(t * 7.3)
        + 0.04 * Math.sin(t * 13.1 + 1.7)
        + 0.03 * Math.sin(t * 2.1 + 0.4);
    hemi.intensity = base.hemi * mood;
    key.intensity = base.key * mood;

    for (const c of candles) {
      const f = reduced
        ? 1
        : 0.86
          + 0.08 * Math.sin(t * 7.3 + c.phase)
          + 0.04 * Math.sin(t * 12.4 + c.phase * 2.3)
          + 0.03 * Math.sin(t * 2.6 + c.phase);
      c.light.intensity = c.baseIntensity * mood * f;
      c.flame.material.opacity = 0.75 + f * 0.25;
      const wobble = reduced ? 0 : Math.sin(t * 9.1 + c.phase) * 0.08;
      c.flame.scale.set(1.5 + wobble, 2.6 - wobble * 0.6, 1);
      c.pool.material.opacity = 0.10 * mood * f;
    }
  }

  return {
    update,
    setLayout,
    setDifficulty,
    setReducedMotion,
    getFlicker: () => flicker,
  };
}
