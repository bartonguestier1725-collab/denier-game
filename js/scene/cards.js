// Card meshes, grid layout, and per-card animation choreography.
//
// One shared rounded-rect extrude geometry for ALL cards, with three material
// groups: 0 = front cap, 1 = gilt walls, 2 = back cap. Cap UVs are normalized
// to the shape bounding box (ExtrudeGeometry leaves them in shape coords).
//
// Orientation contract (see materials.js):
//   rest state  : mesh rotX(+90deg) -> front cap faces DOWN, back cap up
//   flip motion : flipper.rotation.x tweens 0 -> -PI (edge near camera lifts up)
import * as THREE from 'three';
import {
  getFrontMaterial, getBackMaterial, getEdgeMaterial,
  bakeBlobTexture, bakeFocusTexture,
} from './materials.js';
import { tween, damp, Easings } from './anim.js';

export const CARD_W = 5.8;   // world units = cm (bridge size card)
export const CARD_H = 8.9;
export const CARD_T = 0.14;  // slightly chunky — reads better from table distance
export const CARD_R = 0.42;
const GAP_X = 1.15;
const GAP_Z = 1.5;
const PITCH_X = CARD_W + GAP_X;
const PITCH_Z = CARD_H + GAP_Z;
const REST_Y = CARD_T / 2 + 0.012;
const BLOB_Y = 0.006;

let sharedGeometry = null;

function buildCardGeometry() {
  const w = CARD_W / 2;
  const h = CARD_H / 2;
  const r = CARD_R;
  const shape = new THREE.Shape();
  shape.moveTo(-w + r, -h);
  shape.lineTo(w - r, -h);
  shape.absarc(w - r, -h + r, r, -Math.PI / 2, 0);
  shape.lineTo(w, h - r);
  shape.absarc(w - r, h - r, r, 0, Math.PI / 2);
  shape.lineTo(-w + r, h);
  shape.absarc(-w + r, h - r, r, Math.PI / 2, Math.PI);
  shape.lineTo(-w, -h + r);
  shape.absarc(-w + r, -h + r, r, Math.PI, Math.PI * 1.5);

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: CARD_T,
    bevelEnabled: false,
    curveSegments: 6,
  });
  geo.translate(0, 0, -CARD_T / 2);

  // ExtrudeGeometry puts BOTH caps in material group 0 and walls in group 1.
  // Re-split caps by triangle normal (z sign) and normalize their UVs.
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  const triCount = pos.count / 3;
  const triMat = new Array(triCount);

  for (const g of geo.groups) {
    const firstTri = g.start / 3;
    const numTris = g.count / 3;
    for (let t = firstTri; t < firstTri + numTris; t++) {
      if (g.materialIndex === 1) { triMat[t] = 1; continue; }
      const i = t * 3;
      const zAvg = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3;
      triMat[t] = zAvg > 0 ? 0 : 2;
      for (let k = 0; k < 3; k++) {
        uv.setXY(i + k, (pos.getX(i + k) + w) / CARD_W, (pos.getY(i + k) + h) / CARD_H);
      }
    }
  }
  uv.needsUpdate = true;

  geo.clearGroups();
  let runStart = 0;
  for (let t = 1; t <= triCount; t++) {
    if (t === triCount || triMat[t] !== triMat[runStart]) {
      geo.addGroup(runStart * 3, (t - runStart) * 3, triMat[runStart]);
      runStart = t;
    }
  }
  return geo;
}

export function getCardGeometry() {
  if (!sharedGeometry) sharedGeometry = buildCardGeometry();
  return sharedGeometry;
}

/** Grid layout. Transposes tall grids on landscape screens (decided once per deal). */
export function computeLayout(cols, rows, aspect) {
  if (aspect > 1.05 && rows > cols) [cols, rows] = [rows, cols];
  const spanW = cols * PITCH_X - GAP_X;
  const spanH = rows * PITCH_Z - GAP_Z;
  return {
    cols, rows, spanW, spanH,
    slot(i) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      return {
        x: (col - (cols - 1) / 2) * PITCH_X,
        z: (row - (rows - 1) / 2) * PITCH_Z,
      };
    },
  };
}

class CardEntity {
  constructor(card, slot, { blobTexture, nightmare }) {
    this.id = card.id;
    this.denier = card.denier;
    this.slotX = slot.x;
    this.slotZ = slot.z;
    this.jitter = (Math.random() - 0.5) * 0.052; // ±1.5deg hand-dealt feel
    this.faceUp = false;
    this.matched = false;
    this.dealing = false;
    this.hoverT = 0;
    this.hoverTarget = 0;
    this.yFlip = 0;
    this.rotX = 0;
    this.shakeX = 0;
    this.pulse = 1;
    this.blobAlpha = 0;
    this.activeTween = null;
    this.dimmedFront = null;

    const geo = getCardGeometry();
    this.frontMat = getFrontMaterial(card.denier, { nightmare });
    this.mesh = new THREE.Mesh(geo, [this.frontMat, getEdgeMaterial(), getBackMaterial()]);
    this.mesh.rotation.x = Math.PI / 2; // lie flat, face down

    this.flipper = new THREE.Group();
    this.flipper.add(this.mesh);
    this.flipper.position.set(slot.x, REST_Y, slot.z);
    this.flipper.visible = false; // revealed by the deal

    this.blobMat = new THREE.MeshBasicMaterial({
      map: blobTexture,
      transparent: true,
      depthWrite: false,
      opacity: 0,
    });
    this.blob = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.blobMat);
    this.blob.rotation.x = -Math.PI / 2;
    this.blob.position.set(slot.x, BLOB_Y, slot.z);
    this.blob.scale.set(CARD_W * 1.35, CARD_H * 1.28, 1);
    this.blob.renderOrder = 1;
  }

  update(dt) {
    this.hoverT = damp(this.hoverT, this.hoverTarget, 14, dt);
    const lift = this.hoverT * 0.75;

    if (!this.dealing) {
      this.flipper.position.set(
        this.slotX + this.shakeX,
        REST_Y + this.yFlip + lift,
        this.slotZ,
      );
    }
    this.flipper.rotation.x = this.rotX;
    this.flipper.rotation.z = this.jitter;
    this.flipper.scale.setScalar(this.pulse);

    const elevation = this.yFlip + lift;
    const spread = 1 + elevation * 0.045;
    this.blob.scale.set(CARD_W * 1.35 * spread, CARD_H * 1.28 * spread, 1);
    this.blobMat.opacity =
      0.5 * this.blobAlpha * (this.matched ? 0.35 : 1) / (1 + elevation * 0.55);
  }

  _startTween(opts) {
    if (this.activeTween) this.activeTween.cancel();
    this.activeTween = tween(opts);
    return this.activeTween;
  }

  deal(index, from, reduced, onLand) {
    if (reduced) {
      this.flipper.visible = true;
      this.blobAlpha = 1;
      if (onLand) onLand();
      return;
    }
    this.dealing = true;
    const startRot = -0.4 - Math.random() * 0.25;
    this._startTween({
      dur: 0.5,
      delay: index * 0.045,
      ease: Easings.outCubic,
      onUpdate: (e, k) => {
        this.flipper.visible = true;
        const x = from.x + (this.slotX - from.x) * e;
        const z = from.z + (this.slotZ - from.z) * e;
        const y = from.y + (REST_Y - from.y) * e + Math.sin(Math.PI * k) * 4.5;
        this.flipper.position.set(x, y, z);
        this.flipper.rotation.z = this.jitter + startRot * (1 - e);
        this.blobAlpha = Math.max(0, (k - 0.6) / 0.4);
      },
      onComplete: () => {
        this.dealing = false;
        this.blobAlpha = 1;
        if (onLand) onLand();
      },
    });
  }

  flipUp(reduced) {
    this.faceUp = true;
    this.hoverTarget = 0;
    if (reduced) {
      this._startTween({
        dur: 0.12, ease: Easings.linear,
        onUpdate: (e) => { this.rotX = -Math.PI * e; },
        onComplete: () => { this.rotX = -Math.PI; },
      });
      return;
    }
    this._startTween({
      dur: 0.55,
      ease: Easings.outBack(1.3),
      onUpdate: (e, k) => {
        this.rotX = -Math.PI * e;
        this.yFlip = Math.sin(Math.PI * k) * 2.8;
      },
      onComplete: () => { this.yFlip = 0; },
    });
  }

  flipDown(reduced) {
    this.faceUp = false;
    if (reduced) {
      this._startTween({
        dur: 0.12, ease: Easings.linear,
        onUpdate: (e) => { this.rotX = -Math.PI * (1 - e); },
        onComplete: () => { this.rotX = 0; },
      });
      return;
    }
    this._startTween({
      dur: 0.42,
      ease: Easings.inOutCubic,
      onUpdate: (e, k) => {
        this.rotX = -Math.PI * (1 - e);
        this.yFlip = Math.sin(Math.PI * k) * 1.6;
      },
      onComplete: () => { this.rotX = 0; this.yFlip = 0; },
    });
  }

  shake(reduced) {
    if (reduced) return;
    tween({
      dur: 0.45,
      ease: Easings.linear,
      onUpdate: (e, k) => {
        this.shakeX = Math.sin(k * Math.PI * 7) * (1 - k) * 0.55;
      },
      onComplete: () => { this.shakeX = 0; },
    });
  }

  setMatched(reduced) {
    this.matched = true;
    this.hoverTarget = 0;
    // Per-card dimmed clone so the shared per-denier material stays untouched
    this.dimmedFront = this.frontMat.clone();
    this.dimmedFront.color.setHex(0x969288);
    this.mesh.material = [this.dimmedFront, getEdgeMaterial(), getBackMaterial()];
    if (reduced) return;
    tween({
      dur: 0.5,
      ease: Easings.linear,
      onUpdate: (e, k) => { this.pulse = 1 + Math.sin(Math.PI * k) * 0.07; },
      onComplete: () => { this.pulse = 1; },
    });
  }

  dispose() {
    if (this.activeTween) this.activeTween.cancel();
    this.blob.geometry.dispose();
    this.blobMat.dispose();
    if (this.dimmedFront) this.dimmedFront.dispose();
  }
}

export function createCardsManager({ scene }) {
  const boardGroup = new THREE.Group();
  scene.add(boardGroup);

  const entities = new Map();
  const proxies = [];
  const proxyMaterial = new THREE.MeshBasicMaterial({ visible: false });
  let layout = null;
  let hovered = null;

  const focusMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(CARD_W + 2.0, CARD_H + 2.0),
    new THREE.MeshBasicMaterial({
      map: bakeFocusTexture(),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 0.8,
    }),
  );
  focusMesh.rotation.x = -Math.PI / 2;
  focusMesh.position.y = 0.35;
  focusMesh.renderOrder = 3;
  focusMesh.visible = false;
  scene.add(focusMesh);

  function clearBoard() {
    hovered = null;
    focusMesh.visible = false;
    for (const ent of entities.values()) {
      boardGroup.remove(ent.flipper);
      boardGroup.remove(ent.blob);
      ent.dispose();
    }
    entities.clear();
    for (const p of proxies) {
      boardGroup.remove(p);
      p.geometry.dispose();
    }
    proxies.length = 0;
  }

  function buildBoard(deck, difficulty, cfg, aspect) {
    clearBoard();
    layout = computeLayout(cfg.cols, cfg.rows, aspect);
    const nightmare = difficulty === 'nightmare';
    const blobTexture = bakeBlobTexture();

    deck.forEach((card, i) => {
      const slot = layout.slot(i);
      const ent = new CardEntity(card, slot, { blobTexture, nightmare });
      entities.set(card.id, ent);
      boardGroup.add(ent.blob);
      boardGroup.add(ent.flipper);

      const proxy = new THREE.Mesh(
        new THREE.PlaneGeometry(PITCH_X * 0.96, PITCH_Z * 0.96),
        proxyMaterial,
      );
      proxy.rotation.x = -Math.PI / 2;
      proxy.position.set(slot.x, 0.02, slot.z);
      proxy.userData.cardId = card.id;
      proxy.userData.slotIndex = i;
      boardGroup.add(proxy);
      proxies.push(proxy);
    });

    return layout;
  }

  function dealAll(reduced, onAllLanded) {
    const from = {
      x: layout.spanW / 2 + 13,
      y: 5,
      z: layout.spanH / 2 + 8,
    };
    const list = [...entities.values()];
    let landed = 0;
    list.forEach((ent, i) => {
      ent.deal(i, from, reduced, () => {
        landed++;
        if (landed === list.length && onAllLanded) onAllLanded();
      });
    });
  }

  function setHover(id) {
    const next = id != null ? entities.get(id) : null;
    const target = next && !next.matched && !next.faceUp && !next.dealing ? next : null;
    if (hovered === target) return !!target;
    if (hovered) hovered.hoverTarget = 0;
    hovered = target;
    if (hovered) hovered.hoverTarget = 1;
    return !!target;
  }

  function focusSlot(index) {
    if (!layout || index == null) {
      focusMesh.visible = false;
      return;
    }
    const slot = layout.slot(index);
    focusMesh.position.set(slot.x, 0.35, slot.z);
    focusMesh.visible = true;
  }

  function update(dt, t) {
    for (const ent of entities.values()) ent.update(dt);
    if (focusMesh.visible) {
      focusMesh.material.opacity = 0.55 + Math.sin(t * 3.2) * 0.25;
    }
  }

  return {
    buildBoard,
    clearBoard,
    dealAll,
    setHover,
    focusSlot,
    update,
    entity: (id) => entities.get(id),
    raycastTargets: () => proxies,
    getLayout: () => layout,
  };
}
