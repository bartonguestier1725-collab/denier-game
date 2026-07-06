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

let cfg = { texScale: 1, anisotropy: 8, physical: true };
const textureCache = new Map();
const materialCache = new Map();
let damaskImage = null; // loaded once, nullable on failure

export function setTextureDefaults({ texScale, anisotropy, physical = true }) {
  cfg = { texScale, anisotropy, physical };
}

// Deterministic RNG — every denier shares the SAME fiber layout so the weave
// pattern itself is never a matching tell; only sheerness differs.
function seededRandom(seed) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Physically-flavored denier -> fabric coverage curve (0d bare .. 110d opaque). */
function denierAlpha(d) {
  return d <= 0 ? 0 : Math.min(0.93, 1 - Math.exp(-d / 45));
}

/**
 * Stocking fabric swatch: sheer film + fine weave + fibers + baked sheen.
 * Alpha is the only per-denier variable (fairness: angle-independent, seeded).
 */
function drawFabric(ctx, x, y, w, h, alpha, s) {
  if (alpha <= 0) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();

  ctx.fillStyle = `rgba(24, 18, 22, ${(alpha * 0.72).toFixed(3)})`;
  ctx.fillRect(x, y, w, h);

  const rnd = seededRandom(1337);
  const step = 3.2 * s;
  ctx.strokeStyle = `rgba(16, 12, 16, ${Math.min(1, alpha * 0.8).toFixed(3)})`;
  ctx.lineWidth = 1 * s;
  for (let vx = x; vx <= x + w; vx += step) {
    const j = (rnd() - 0.5) * s;
    ctx.beginPath();
    ctx.moveTo(vx + j, y);
    ctx.lineTo(vx + j, y + h);
    ctx.stroke();
  }
  for (let hy = y; hy <= y + h; hy += step) {
    const j = (rnd() - 0.5) * s;
    ctx.beginPath();
    ctx.moveTo(x, hy + j);
    ctx.lineTo(x + w, hy + j);
    ctx.stroke();
  }

  ctx.strokeStyle = `rgba(32, 25, 30, ${(alpha * 0.5).toFixed(3)})`;
  for (let i = 0; i < 240; i++) {
    const fx = x + rnd() * w;
    const fy = y + rnd() * h;
    const ang = rnd() * Math.PI;
    const len = (2 + rnd() * 5) * s;
    ctx.beginPath();
    ctx.moveTo(fx, fy);
    ctx.lineTo(fx + Math.cos(ang) * len, fy + Math.sin(ang) * len);
    ctx.stroke();
  }

  // Baked diagonal sheen — identical for every card position (fairness)
  const sheen = ctx.createLinearGradient(x, y, x + w, y + h);
  sheen.addColorStop(0.35, 'rgba(255, 255, 255, 0)');
  sheen.addColorStop(0.5, `rgba(255, 245, 235, ${(0.05 + alpha * 0.05).toFixed(3)})`);
  sheen.addColorStop(0.65, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = sheen;
  ctx.fillRect(x, y, w, h);
  ctx.restore();
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

/** Linear (non-color) texture for metalness/roughness/emissive masks. */
function toDataTexture(canvas) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = cfg.anisotropy;
  return tex;
}

let tintedDamaskCache = new Map();
/** Damask motif re-tinted to a flat color (for gold overlay + foil masks). */
function tintedDamask(color) {
  if (!damaskImage) return null;
  if (tintedDamaskCache.has(color)) return tintedDamaskCache.get(color);
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const cx = c.getContext('2d');
  cx.drawImage(damaskImage, 0, 0, 256, 256);
  cx.globalCompositeOperation = 'source-in';
  cx.fillStyle = color;
  cx.fillRect(0, 0, 256, 256);
  tintedDamaskCache.set(color, c);
  return c;
}

function drawDamaskTiled(ctx, W, H, image, alpha, composite = 'source-over') {
  if (!image) return;
  ctx.save();
  ctx.globalCompositeOperation = composite;
  ctx.globalAlpha = alpha;
  const tile = W / 4;
  for (let y = 0; y < H; y += tile) {
    for (let x = 0; x < W; x += tile) {
      ctx.drawImage(image, x, y, tile, tile);
    }
  }
  ctx.restore();
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
 * Card front — a hosiery sample card: a specimen window showing the stocking
 * fabric stretched over skin tone, engraved gold numeral beneath.
 * Nightmare: the fabric floods the whole face, no window, no numeral —
 * darkness alone (NIGHTMARE_OPACITY) is the only clue.
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

  // Warm candle glow from upper-left
  const glow = ctx.createRadialGradient(W * 0.3, 0, 0, W * 0.3, 0, H * 0.75);
  glow.addColorStop(0, 'rgba(255, 214, 150, 0.16)');
  glow.addColorStop(1, 'rgba(255, 214, 150, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  if (nightmare) {
    drawFabric(ctx, 10 * s, 10 * s, W - 20 * s, H - 20 * s, NIGHTMARE_OPACITY[denier] ?? 0.5, s);
  } else {
    // --- Specimen window: skin tone under stretched fabric ---
    const winW = W * 0.62;
    const winH = H * 0.44;
    const winX = (W - winW) / 2;
    const winY = H * 0.13;

    const skin = ctx.createLinearGradient(winX, winY, winX, winY + winH);
    skin.addColorStop(0, '#eec3a3');
    skin.addColorStop(0.55, '#e2ab87');
    skin.addColorStop(1, '#d29677');
    ctx.fillStyle = skin;
    ctx.fillRect(winX, winY, winW, winH);

    // soft thigh-curve highlight
    const hl = ctx.createRadialGradient(
      winX + winW * 0.36, winY + winH * 0.34, 0,
      winX + winW * 0.36, winY + winH * 0.34, winW * 0.55,
    );
    hl.addColorStop(0, 'rgba(255, 240, 225, 0.35)');
    hl.addColorStop(1, 'rgba(255, 240, 225, 0)');
    ctx.fillStyle = hl;
    ctx.fillRect(winX, winY, winW, winH);

    drawFabric(ctx, winX, winY, winW, winH, denierAlpha(denier), s);

    // window inner shadow + gold specimen frame
    ctx.save();
    ctx.beginPath();
    ctx.rect(winX, winY, winW, winH);
    ctx.clip();
    ctx.strokeStyle = 'rgba(30, 18, 8, 0.55)';
    ctx.lineWidth = 10 * s;
    ctx.filter = `blur(${4 * s}px)`;
    ctx.strokeRect(winX - 4 * s, winY - 4 * s, winW + 8 * s, winH + 8 * s);
    ctx.filter = 'none';
    ctx.restore();

    ctx.strokeStyle = PALETTE.goldDark;
    ctx.lineWidth = 3.5 * s;
    ctx.strokeRect(winX, winY, winW, winH);
    ctx.strokeStyle = 'rgba(232, 212, 139, 0.5)';
    ctx.lineWidth = 1.2 * s;
    ctx.strokeRect(winX - 2.5 * s, winY - 2.5 * s, winW + 5 * s, winH + 5 * s);

    // --- Engraved gold numeral (high contrast — this is the fair-play channel) ---
    const numeral = String(denier);
    const numeralSize = H * (numeral.length >= 3 ? 0.175 : 0.21);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `700 ${numeralSize}px "Playfair Display", "Noto Serif JP", serif`;
    const ny = H * 0.715;
    // dark ink outline anchors it against the cream stock
    ctx.lineWidth = 3 * s;
    ctx.strokeStyle = 'rgba(42, 26, 10, 0.85)';
    ctx.strokeText(numeral, W / 2, ny + 1 * s);
    // engraved shadow pass
    ctx.fillStyle = 'rgba(60, 40, 10, 0.7)';
    ctx.fillText(numeral, W / 2, ny + 2.5 * s);
    // gold body
    const goldGrad = ctx.createLinearGradient(0, ny - numeralSize / 2, 0, ny + numeralSize / 2);
    goldGrad.addColorStop(0, '#ecd992');
    goldGrad.addColorStop(0.45, '#c9a84c');
    goldGrad.addColorStop(1, '#8f6d24');
    ctx.fillStyle = goldGrad;
    ctx.fillText(numeral, W / 2, ny);
    // top glint
    ctx.fillStyle = 'rgba(255, 250, 230, 0.28)';
    ctx.fillText(numeral, W / 2, ny - 1.5 * s);

    ctx.font = `400 ${H * 0.042}px "Libre Baskerville", serif`;
    try { ctx.letterSpacing = `${6 * s}px`; } catch { /* older browsers */ }
    ctx.fillStyle = PALETTE.goldDark;
    ctx.fillText('D E N I E R', W / 2, H * 0.865);
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
    drawDamaskTiled(ctx, W, H, damaskImage, 0.6, 'soft-light');
    // Gold foil pass — the metalness mask picks this up as actual metal
    drawDamaskTiled(ctx, W, H, tintedDamask('#a8853c'), 0.4);
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

/**
 * Foil mask for the back: white where gold leaf lives (damask, frame,
 * fleuron), black elsewhere. Drives metalness + emissive (selective bloom
 * hook for Stage 3). Must mirror bakeBackTexture's transform exactly.
 */
export function bakeBackMask() {
  const key = `backMask|${cfg.texScale}`;
  if (textureCache.has(key)) return textureCache.get(key);

  const canvas = makeCanvas();
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  const s = cfg.texScale;

  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  ctx.translate(0, H);
  ctx.scale(1, -1);

  drawDamaskTiled(ctx, W, H, tintedDamask('#ffffff'), 0.85);

  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 12 * s;
  roundedRect(ctx, 8 * s, 8 * s, W - 16 * s, H - 16 * s, 30 * s);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
  ctx.lineWidth = 3 * s;
  roundedRect(ctx, 28 * s, 28 * s, W - 56 * s, H - 56 * s, 20 * s);
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `${H * 0.15}px "Playfair Display", serif`;
  ctx.fillStyle = '#ffffff';
  ctx.fillText('❦', W / 2, H / 2);

  ctx.restore();

  const tex = toDataTexture(canvas);
  textureCache.set(key, tex);
  return tex;
}

/** Roughness map derived from the foil mask: gold ~0.35x, felt 1.0x. */
export function bakeBackRoughness() {
  const key = `backRough|${cfg.texScale}`;
  if (textureCache.has(key)) return textureCache.get(key);

  const maskTex = bakeBackMask();
  const src = maskTex.image;
  const canvas = document.createElement('canvas');
  canvas.width = src.width;
  canvas.height = src.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(src, 0, 0);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const px = data.data;
  for (let i = 0; i < px.length; i += 4) {
    const v = 255 - px[i] * 0.65; // white foil -> 0.35, black felt -> 1.0
    px[i] = v;
    px[i + 1] = v;
    px[i + 2] = v;
  }
  ctx.putImageData(data, 0, 0);

  const tex = toDataTexture(canvas);
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
  const key = `mBack|${cfg.texScale}|${cfg.physical ? 'p' : 's'}`;
  if (materialCache.has(key)) return materialCache.get(key);
  const common = {
    map: bakeBackTexture(),
    metalness: 1.0,               // scaled per-pixel by the foil mask
    metalnessMap: bakeBackMask(),
    roughness: 0.85,
    roughnessMap: bakeBackRoughness(),
    emissive: new THREE.Color(0xffaa44), // candle-lit foil; bloom hook (Stage 3)
    emissiveMap: bakeBackMask(),
    emissiveIntensity: 0.05,
    envMapIntensity: 1.1,
  };
  // Lacquered finish on desktop; plain standard on mobile GPUs
  const mat = cfg.physical
    ? new THREE.MeshPhysicalMaterial({ ...common, clearcoat: 0.55, clearcoatRoughness: 0.35 })
    : new THREE.MeshStandardMaterial(common);
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
