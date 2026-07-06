// Texture bakery + card materials.
// All card faces are baked to canvases once per denier (NOT per card) and cached.
// Orientation contract with cards.js:
//   - front canvas is drawn upright — it reads correctly AFTER the -PI flip around X
//   - back canvas is drawn vertically flipped — it reads correctly in the face-down rest state
import * as THREE from 'three';
import { NIGHTMARE_OPACITY } from '../constants.js';

const PALETTE = {
  gold: '#c9a84c',
  goldDark: '#8b7332',
  goldLight: '#e8d48b',
  cream: '#f5f0e1',
  burgundy: '#7a1528',
  burgundyDark: '#5a0f1e',
  burgundyDeep: '#3a0812',
  ink: '#2a1a0a',
};

// Base bake resolution (scaled by quality tier)
const BASE_W = 512;
const BASE_H = 768;

let cfg = { texScale: 1, anisotropy: 8 };
const textureCache = new Map();
const materialCache = new Map();
let damaskImage = null; // loaded once, nullable on failure

export function setTextureDefaults({ texScale, anisotropy }) {
  cfg = { texScale, anisotropy };
}

export async function ensureFonts() {
  if (!document.fonts || !document.fonts.load) return;
  const specs = [
    '700 200px "Playfair Display"',
    '400 80px "Libre Baskerville"',
    '700 80px "Noto Serif JP"',
  ];
  const timeout = new Promise((r) => setTimeout(r, 2500));
  try {
    await Promise.race([Promise.all(specs.map((s) => document.fonts.load(s))), timeout]);
  } catch { /* fall back to generic serif */ }
}

export async function loadDamask() {
  if (damaskImage) return damaskImage;
  try {
    const res = await fetch('assets/decorations/openclipart-damask-pattern.svg');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    damaskImage = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });
  } catch (e) {
    console.warn('[materials] damask SVG unavailable, using lattice fallback:', e);
    damaskImage = null;
  }
  return damaskImage;
}

function makeCanvas() {
  const c = document.createElement('canvas');
  c.width = Math.round(BASE_W * cfg.texScale);
  c.height = Math.round(BASE_H * cfg.texScale);
  return c;
}

function roundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function toTexture(canvas) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = cfg.anisotropy;
  return tex;
}

/** Shared frame: gold outer border + inner hairline. Scale-aware. */
function drawFrame(ctx, W, H, s) {
  ctx.strokeStyle = PALETTE.goldDark;
  ctx.lineWidth = 12 * s;
  roundedRect(ctx, 8 * s, 8 * s, W - 16 * s, H - 16 * s, 30 * s);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(201, 168, 76, 0.5)';
  ctx.lineWidth = 3 * s;
  roundedRect(ctx, 28 * s, 28 * s, W - 56 * s, H - 56 * s, 20 * s);
  ctx.stroke();
}

/**
 * Card front. Stage 1 = enriched port of the DOM look:
 * cream stock, candle glow, gold frame, letterpress numeral.
 * Nightmare = fabric-darkness fill only, no numeral (NIGHTMARE_OPACITY drives darkness).
 */
export function bakeFrontTexture(denier, { nightmare = false } = {}) {
  const key = `front|${denier}|${nightmare ? 1 : 0}|${cfg.texScale}`;
  if (textureCache.has(key)) return textureCache.get(key);

  const canvas = makeCanvas();
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  const s = cfg.texScale;

  // Paper stock
  const base = ctx.createLinearGradient(0, 0, 0, H);
  base.addColorStop(0, '#f6f1e2');
  base.addColorStop(1, '#e9e0c9');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, W, H);

  // Warm candle glow from upper-left (ported from the CSS radial-gradient)
  const glow = ctx.createRadialGradient(W * 0.3, 0, 0, W * 0.3, 0, H * 0.75);
  glow.addColorStop(0, 'rgba(255, 214, 150, 0.16)');
  glow.addColorStop(1, 'rgba(255, 214, 150, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  if (nightmare) {
    const opacity = NIGHTMARE_OPACITY[denier] ?? 0.5;
    ctx.fillStyle = `rgba(6, 4, 8, ${opacity})`;
    ctx.fillRect(0, 0, W, H);
  } else {
    // Letterpress numeral: light under-shadow first, then ink
    const numeral = String(denier);
    const numeralSize = H * (numeral.length >= 3 ? 0.24 : 0.3);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `700 ${numeralSize}px "Playfair Display", "Noto Serif JP", serif`;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.fillText(numeral, W / 2, H * 0.44 + 3 * s);
    ctx.fillStyle = PALETTE.ink;
    ctx.fillText(numeral, W / 2, H * 0.44);

    ctx.font = `400 ${H * 0.048}px "Libre Baskerville", serif`;
    try { ctx.letterSpacing = `${6 * s}px`; } catch { /* older browsers */ }
    ctx.fillStyle = PALETTE.goldDark;
    ctx.fillText('D E N I E R', W / 2, H * 0.63);
    try { ctx.letterSpacing = '0px'; } catch { /* noop */ }
  }

  drawFrame(ctx, W, H, s);

  const tex = toTexture(canvas);
  textureCache.set(key, tex);
  return tex;
}

/** Card back: burgundy damask with gold frame + fleuron. Drawn vertically flipped (see contract). */
export function bakeBackTexture() {
  const key = `back|${cfg.texScale}`;
  if (textureCache.has(key)) return textureCache.get(key);

  const canvas = makeCanvas();
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  const s = cfg.texScale;

  // Face-down cards show the back cap from above: canvas rows land bottom-up
  // on screen (rotX(90) mesh + flipY texture), so bake with a vertical flip.
  ctx.save();
  ctx.translate(0, H);
  ctx.scale(1, -1);

  const base = ctx.createLinearGradient(0, 0, W, H);
  base.addColorStop(0, PALETTE.burgundy);
  base.addColorStop(0.5, PALETTE.burgundyDark);
  base.addColorStop(1, PALETTE.burgundyDeep);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, W, H);

  // Damask tiling (soft-light, like the CSS background-blend-mode)
  if (damaskImage) {
    ctx.save();
    ctx.globalCompositeOperation = 'soft-light';
    ctx.globalAlpha = 0.6;
    const tile = W / 4;
    for (let y = 0; y < H; y += tile) {
      for (let x = 0; x < W; x += tile) {
        ctx.drawImage(damaskImage, x, y, tile, tile);
      }
    }
    ctx.restore();
  } else {
    // Fallback: subtle diagonal lattice
    ctx.save();
    ctx.strokeStyle = 'rgba(201, 168, 76, 0.08)';
    ctx.lineWidth = 2 * s;
    const step = W / 6;
    for (let i = -H; i < W + H; i += step) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + H, H); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(i + H, 0); ctx.lineTo(i, H); ctx.stroke();
    }
    ctx.restore();
  }

  // Edge shadow (inset depth)
  const vig = ctx.createRadialGradient(W / 2, H / 2, H * 0.28, W / 2, H / 2, H * 0.72);
  vig.addColorStop(0, 'rgba(0, 0, 0, 0)');
  vig.addColorStop(1, 'rgba(0, 0, 0, 0.42)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, W, H);

  drawFrame(ctx, W, H, s);

  // Center fleuron
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `${H * 0.15}px "Playfair Display", serif`;
  ctx.shadowColor = 'rgba(201, 168, 76, 0.5)';
  ctx.shadowBlur = 22 * s;
  ctx.fillStyle = 'rgba(201, 168, 76, 0.42)';
  ctx.fillText('❦', W / 2, H / 2);
  ctx.shadowBlur = 0;

  ctx.restore();

  const tex = toTexture(canvas);
  textureCache.set(key, tex);
  return tex;
}

/** Soft elliptical contact shadow (shared by all cards). */
export function bakeBlobTexture() {
  const key = 'blob';
  if (textureCache.has(key)) return textureCache.get(key);

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(128, 128, 10, 128, 128, 122);
  g.addColorStop(0, 'rgba(0, 0, 0, 0.62)');
  g.addColorStop(0.55, 'rgba(0, 0, 0, 0.38)');
  g.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);

  const tex = new THREE.CanvasTexture(canvas);
  textureCache.set(key, tex);
  return tex;
}

/** Gold glow ring for keyboard focus. */
export function bakeFocusTexture() {
  const key = 'focus';
  if (textureCache.has(key)) return textureCache.get(key);

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 384;
  const ctx = canvas.getContext('2d');

  ctx.shadowColor = 'rgba(232, 212, 139, 0.9)';
  ctx.shadowBlur = 26;
  ctx.strokeStyle = PALETTE.goldLight;
  ctx.lineWidth = 7;
  roundedRect(ctx, 22, 22, 212, 340, 18);
  ctx.stroke();
  ctx.stroke(); // double pass fattens the glow

  const tex = new THREE.CanvasTexture(canvas);
  textureCache.set(key, tex);
  return tex;
}

// --- Materials (shared instances, cached) ---

export function getFrontMaterial(denier, { nightmare = false } = {}) {
  const key = `mFront|${denier}|${nightmare ? 1 : 0}|${cfg.texScale}`;
  if (materialCache.has(key)) return materialCache.get(key);
  const mat = new THREE.MeshStandardMaterial({
    map: bakeFrontTexture(denier, { nightmare }),
    roughness: 0.85,
    metalness: 0.0,
    envMapIntensity: 0.4,
  });
  materialCache.set(key, mat);
  return mat;
}

export function getBackMaterial() {
  const key = `mBack|${cfg.texScale}`;
  if (materialCache.has(key)) return materialCache.get(key);
  const mat = new THREE.MeshStandardMaterial({
    map: bakeBackTexture(),
    roughness: 0.6,
    metalness: 0.18,
    envMapIntensity: 0.9,
  });
  materialCache.set(key, mat);
  return mat;
}

export function getEdgeMaterial() {
  const key = 'mEdge';
  if (materialCache.has(key)) return materialCache.get(key);
  // Gilt edges — the "ギラッ" when a card tilts under candlelight
  const mat = new THREE.MeshStandardMaterial({
    color: 0xb9964a,
    roughness: 0.38,
    metalness: 0.85,
    envMapIntensity: 1.3,
  });
  materialCache.set(key, mat);
  return mat;
}

/** Re-upload canvas textures after a WebGL context restore. */
export function refreshAllTextures() {
  for (const tex of textureCache.values()) tex.needsUpdate = true;
}
