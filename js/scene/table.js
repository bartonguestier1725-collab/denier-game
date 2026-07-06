// The table: an AI-generated baroque photo used as an art-directed, ~unlit
// backdrop plane. Its baked lighting IS the look — dynamic lights only touch
// the cards. Edges are baked down to the scene's near-black so the plane
// dissolves into darkness instead of showing a hard rectangle.
import * as THREE from 'three';

const PHOTO_BY_DIFFICULTY = {
  easy: 'assets/textures/bg-easy.png',
  normal: 'assets/textures/bg-normal.png',
  hard: 'assets/textures/bg-hard.png',
  nightmare: 'assets/textures/bg-hard.png',
};
const DEFAULT_PHOTO = 'assets/textures/bg-normal.png';
const EDGE_COLOR = '#070503';

// The photos are full-table shots (ornate frame, candelabras, marble floor).
// The felt playing area occupies roughly the central 60% x 35% of the image,
// so the plane is scaled per-layout: felt must contain the card grid, which
// puts the gilt table frame just outside it — visible at the screen edges.
const FELT_FRAC_W = 0.60;
const FELT_FRAC_H = 0.349; // felt height as a fraction of plane WIDTH (aspect folded in)
const FALLBACK_ASPECT = 941 / 1672;

const textureCache = new Map();

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`image load failed: ${url}`));
    img.src = url;
  });
}

async function bakePhotoTexture(url, texScale, anisotropy) {
  const key = `${url}|${texScale}`;
  if (textureCache.has(key)) return textureCache.get(key);

  const img = await loadImage(url);
  const w = Math.round(2048 * texScale);
  const h = Math.round(w * (img.height / img.width));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, w, h);

  // Fade the borders into the scene's darkness (rectangular feather)
  const feather = Math.round(w * 0.14);
  const sides = [
    ctx.createLinearGradient(0, 0, feather, 0),
    ctx.createLinearGradient(w, 0, w - feather, 0),
    ctx.createLinearGradient(0, 0, 0, feather),
    ctx.createLinearGradient(0, h, 0, h - feather),
  ];
  const rects = [
    [0, 0, feather, h],
    [w - feather, 0, feather, h],
    [0, 0, w, feather],
    [0, h - feather, w, feather],
  ];
  sides.forEach((g, i) => {
    g.addColorStop(0, EDGE_COLOR);
    g.addColorStop(1, `${EDGE_COLOR}00`);
    ctx.fillStyle = g;
    ctx.fillRect(...rects[i]);
  });

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = anisotropy;
  textureCache.set(key, tex);
  return tex;
}

export function createTable({ scene, texScale, anisotropy }) {
  const material = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
  plane.rotation.x = -Math.PI / 2;
  plane.position.y = 0;
  plane.renderOrder = 0;
  scene.add(plane);

  // Endless dark floor beneath / beyond the photo
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(4000, 4000),
    new THREE.MeshBasicMaterial({ color: 0x070503 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.5;
  scene.add(floor);

  let currentKey = null;
  let planeW = 86; // sized for the default (title) framing

  function applyScale() {
    const aspect = material.map
      ? material.map.image.height / material.map.image.width
      : FALLBACK_ASPECT;
    plane.scale.set(planeW, planeW * aspect, 1);
  }

  /** Size the photo so the felt just contains the grid — frame enters the view. */
  function setLayout(spanW, spanH) {
    planeW = THREE.MathUtils.clamp(
      Math.max((spanW + 6) / FELT_FRAC_W, (spanH + 6) / FELT_FRAC_H),
      70, 140,
    );
    applyScale();
  }

  async function setDifficulty(difficulty) {
    const url = PHOTO_BY_DIFFICULTY[difficulty] || DEFAULT_PHOTO;
    if (currentKey === url) return;
    currentKey = url;
    try {
      const tex = await bakePhotoTexture(url, texScale, anisotropy);
      if (currentKey !== url) return; // difficulty changed while loading
      material.map = tex;
      material.color.setHex(0xffffff);
      material.needsUpdate = true;
      applyScale();
    } catch (e) {
      console.warn('[table] photo unavailable, using dark felt:', e);
      material.map = null;
      material.color.setHex(0x14200f);
      material.needsUpdate = true;
      applyScale();
    }
  }

  return {
    setDifficulty,
    setLayout,
    /** Photo brightness breathes with the shared candle flicker. */
    setFlicker: (f) => {
      if (material.map) material.color.setScalar(0.93 + f * 0.07);
    },
    refresh: () => { if (material.map) material.map.needsUpdate = true; },
  };
}
