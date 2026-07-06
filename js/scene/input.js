// Pointer + keyboard input for the 3D view.
// Taps are distinguished from drags (distance/time thresholds); picking
// raycasts against invisible per-slot proxy planes, never the animated meshes.
import * as THREE from 'three';

const TAP_MAX_DIST_SQ = 81; // 9px
const TAP_MAX_MS = 450;

export function createInput({ element, camera, getTargets, onTap, onHover, onMouse, onKey }) {
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  let down = null;
  let hoverRafPending = false;
  let lastMove = null;

  function pick(clientX, clientY) {
    ndc.x = (clientX / window.innerWidth) * 2 - 1;
    ndc.y = -(clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects(getTargets(), false);
    return hits.length ? hits[0].object.userData : null;
  }

  function onPointerDown(e) {
    down = { x: e.clientX, y: e.clientY, t: performance.now() };
  }

  function onPointerUp(e) {
    if (!down) return;
    const dx = e.clientX - down.x;
    const dy = e.clientY - down.y;
    const dtMs = performance.now() - down.t;
    down = null;
    if (dx * dx + dy * dy > TAP_MAX_DIST_SQ || dtMs > TAP_MAX_MS) return;
    if (e.target.closest('button, a, input')) return; // UI owns its clicks
    onTap(pick(e.clientX, e.clientY));
  }

  function onPointerMove(e) {
    onMouse((e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1);
    if (!finePointer) return;
    lastMove = e;
    if (hoverRafPending) return;
    hoverRafPending = true;
    requestAnimationFrame(() => {
      hoverRafPending = false;
      if (lastMove) onHover(pick(lastMove.clientX, lastMove.clientY));
    });
  }

  function onKeyDown(e) {
    onKey(e);
  }

  element.addEventListener('pointerdown', onPointerDown);
  element.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointermove', onPointerMove, { passive: true });
  window.addEventListener('keydown', onKeyDown);

  return {
    dispose() {
      element.removeEventListener('pointerdown', onPointerDown);
      element.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('keydown', onKeyDown);
    },
  };
}
