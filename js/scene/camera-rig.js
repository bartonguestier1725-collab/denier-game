// Camera rig with independent channels: base framing (solved), mouse
// parallax, and breathing sway. The framing solver binary-searches the
// camera distance so the whole grid (+ lifted-card headroom) fits the
// frustum with margins for the HUD — portrait and landscape both work.
import * as THREE from 'three';
import { damp } from './anim.js';

const DEG = THREE.MathUtils.degToRad;

export function createCameraRig(camera) {
  const base = {
    pos: new THREE.Vector3(0, 60, 40),
    target: new THREE.Vector3(0, 0, -0.8),
    fov: 39,
  };
  const par = { x: 0, y: 0 };
  const mouse = { x: 0, y: 0 };
  const lookTarget = new THREE.Vector3();
  let grid = { spanW: 34, spanH: 24 }; // default empty-table framing
  let reduced = false;

  const scratch = new THREE.PerspectiveCamera();
  const probe = new THREE.Vector3();

  function solve(spanW, spanH, aspect) {
    const portrait = aspect < 0.9;
    const tilt = portrait ? DEG(21) : DEG(27); // from straight-down; <=30 for fairness
    const fov = portrait ? 46 : 39;
    const dir = new THREE.Vector3(0, Math.cos(tilt), Math.sin(tilt));
    const mx = spanW / 2 + 3.4;
    const mz = spanH / 2 + 4.0;
    const points = [
      [-mx, 0, -mz], [mx, 0, -mz], [-mx, 0, mz], [mx, 0, mz],
      [-mx, 3.2, -mz], [mx, 3.2, mz], // headroom for lifted/flipping cards
    ];

    scratch.fov = fov;
    scratch.aspect = aspect;
    scratch.near = 1;
    scratch.far = 900;

    let lo = 10;
    let hi = 600;
    for (let i = 0; i < 22; i++) {
      const d = (lo + hi) / 2;
      scratch.position.copy(base.target).addScaledVector(dir, d);
      scratch.lookAt(base.target);
      scratch.updateMatrixWorld();
      scratch.updateProjectionMatrix();
      let fits = true;
      for (const [x, y, z] of points) {
        probe.set(x, y, z).project(scratch);
        if (Math.abs(probe.x) > 0.9 || probe.y > 0.78 || probe.y < -0.88) {
          fits = false;
          break;
        }
      }
      if (fits) hi = d; else lo = d;
    }

    base.fov = fov;
    base.pos.copy(base.target).addScaledVector(dir, hi);
    camera.fov = fov;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
  }

  function frameGrid(spanW, spanH) {
    grid = { spanW, spanH };
    solve(spanW, spanH, window.innerWidth / window.innerHeight);
  }

  return {
    frameGrid,
    frameDefault: () => frameGrid(34, 24),
    onResize: () => solve(grid.spanW, grid.spanH, window.innerWidth / window.innerHeight),
    setMouse: (x, y) => { mouse.x = x; mouse.y = y; },
    setReducedMotion: (v) => { reduced = v; },
    update(dt, t) {
      par.x = damp(par.x, reduced ? 0 : mouse.x, 5, dt);
      par.y = damp(par.y, reduced ? 0 : mouse.y, 5, dt);
      const breatheY = reduced ? 0 : Math.sin(t * 0.42) * 0.35;
      camera.position.copy(base.pos);
      camera.position.x += par.x * 2.4;
      camera.position.y += breatheY - par.y * 1.1;
      lookTarget.copy(base.target);
      lookTarget.x += par.x * 1.2;
      camera.lookAt(lookTarget);
    },
  };
}
