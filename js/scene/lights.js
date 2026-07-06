// Lighting rig. Per the art direction: NO shadow-casting lights (blob contact
// shadows handle grounding); candles are shadowless flicker PointLights whose
// shared flicker value also feeds the table pool + HUD (Stage 2).
import * as THREE from 'three';

export function createLights({ scene }) {
  const hemi = new THREE.HemisphereLight(0x3a2f1e, 0x0a0603, 0.55);
  scene.add(hemi);

  const key = new THREE.DirectionalLight(0xffd7a1, 1.05);
  key.position.set(30, 60, 25);
  scene.add(key);

  const candleA = new THREE.PointLight(0xff9a3f, 320, 0, 2);
  const candleB = new THREE.PointLight(0xffa354, 260, 0, 2);
  candleA.position.set(-26, 9, -4);
  candleB.position.set(26, 9, -2);
  scene.add(candleA, candleB);

  const base = {
    hemi: hemi.intensity,
    key: key.intensity,
    candleA: candleA.intensity,
    candleB: candleB.intensity,
  };
  let mood = 1; // difficulty multiplier
  let flicker = 1;
  let reduced = false;

  function setReducedMotion(v) { reduced = v; }

  /** Move candles just outside the card grid. */
  function setLayout(spanW, spanH) {
    candleA.position.set(-(spanW / 2 + 10), 9, -spanH * 0.1);
    candleB.position.set(spanW / 2 + 10, 9, spanH * 0.05);
  }

  function setDifficulty(difficulty) {
    const nightmare = difficulty === 'nightmare';
    mood = nightmare ? 0.52 : 1;
    hemi.color.setHex(nightmare ? 0x2a2030 : 0x3a2f1e);
    candleA.color.setHex(nightmare ? 0xe07028 : 0xff9a3f);
    candleB.color.setHex(nightmare ? 0xd86420 : 0xffa354);
    return {
      exposure: nightmare ? 0.88 : 1.12,
      fogDensity: nightmare ? 0.0052 : 0.0035,
    };
  }

  function update(t) {
    // Multi-frequency noise — organic candle breathing, not a strobe
    flicker = reduced
      ? 1
      : 0.88
        + 0.07 * Math.sin(t * 7.3)
        + 0.04 * Math.sin(t * 13.1 + 1.7)
        + 0.03 * Math.sin(t * 2.1 + 0.4);
    hemi.intensity = base.hemi * mood;
    key.intensity = base.key * mood;
    candleA.intensity = base.candleA * mood * flicker;
    candleB.intensity = base.candleB * mood * (flicker * 0.92 + 0.08);
  }

  return {
    update,
    setLayout,
    setDifficulty,
    setReducedMotion,
    getFlicker: () => flicker,
  };
}
