// Camera rig with independent channels: solved base framing, glide tweens
// between framings (menu <-> table), mouse parallax, breathing sway, and a
// decaying impact shake. The framing solver binary-searches the camera
// distance so the whole grid (+ lifted-card headroom) fits the frustum with
// margins for the HUD — portrait and landscape both work.
import * as THREE from 'three';
import { damp, tween, Easings } from './anim.js';

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
  let grid = { spanW: 34, spanH: 24 };
  let reduced = false;
  let framedOnce = false;
  let glideTween = null;
  let shakeAmp = 0;
  let dollyMul = 1; // win-sequence pullback

  const scratch = new THREE.PerspectiveCamera();
  const probe = new THREE.Vector3();

  function solve(spanW, spanH, aspect) {
    const portrait = aspect < 0.9;
    const tilt = portrait ? DEG(21) : DEG(27); // from straight-down; <=30 for fairness
    const fov = portrait ? 46 : 39;
    const dir = new THREE.Vector3(0, Math.cos(tilt), Math.sin(tilt));
    const target = new THREE.Vector3(0, 0, -0.8);
    const mx = spanW / 2 + 3.4;
    const mz = spanH / 2 + 4.0;
    const points = [
      [-mx, 0, -mz], [mx, 0, -mz], [-mx, 0, mz], [mx, 0, mz],
      [-mx, 3.2, -mz], [mx, 3.2, mz],
    ];

    scratch.fov = fov;
    scratch.aspect = aspect;
    scratch.near = 1;
    scratch.far = 900;

    let lo = 10;
    let hi = 600;
    for (let i = 0; i < 22; i++) {
      const d = (lo + hi) / 2;
      scratch.position.copy(target).addScaledVector(dir, d);
      scratch.lookAt(target);
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

    return {
      pos: target.clone().addScaledVector(dir, hi),
      target,
      fov,
    };
  }

  function applyFraming(f) {
    base.pos.copy(f.pos);
    base.target.copy(f.target);
    base.fov = f.fov;
    camera.fov = f.fov;
    camera.updateProjectionMatrix();
  }

  function frameGrid(spanW, spanH, { instant = false } = {}) {
    grid = { spanW, spanH };
    const next = solve(spanW, spanH, window.innerWidth / window.innerHeight);
    dollyMul = 1;
    if (glideTween) { glideTween.cancel(); glideTween = null; }

    if (!framedOnce || instant || reduced) {
      framedOnce = true;
      applyFraming(next);
      return;
    }
    // Glide: tween pos/target/fov from current base to the new framing
    const from = {
      pos: base.pos.clone(),
      target: base.target.clone(),
      fov: base.fov,
    };
    glideTween = tween({
      dur: 1.0,
      ease: Easings.inOutCubic,
      onUpdate: (e) => {
        base.pos.lerpVectors(from.pos, next.pos, e);
        base.target.lerpVectors(from.target, next.target, e);
        base.fov = from.fov + (next.fov - from.fov) * e;
        camera.fov = base.fov;
        camera.updateProjectionMatrix();
      },
      onComplete: () => { glideTween = null; },
    });
  }

  return {
    frameGrid,
    frameDefault: (opts) => frameGrid(34, 24, opts),
    onResize: () => frameGrid(grid.spanW, grid.spanH, { instant: true }),
    setMouse: (x, y) => { mouse.x = x; mouse.y = y; },
    setReducedMotion: (v) => { reduced = v; },
    /** Decaying impact shake (match thunk). */
    shake: (amp) => { if (!reduced) shakeAmp = Math.max(shakeAmp, amp); },
    /** Slow dolly-out for the win sequence. */
    pullback: (mul = 1.16, dur = 1.4) => {
      if (reduced) return;
      const from = dollyMul;
      tween({
        dur,
        ease: Easings.inOutCubic,
        onUpdate: (e) => { dollyMul = from + (mul - from) * e; },
      });
    },
    update(dt, t) {
      par.x = damp(par.x, reduced ? 0 : mouse.x, 5, dt);
      par.y = damp(par.y, reduced ? 0 : mouse.y, 5, dt);
      const breatheY = reduced ? 0 : Math.sin(t * 0.42) * 0.35;

      camera.position.copy(base.target)
        .addScaledVector(new THREE.Vector3().subVectors(base.pos, base.target), dollyMul);
      camera.position.x += par.x * 2.4;
      camera.position.y += breatheY - par.y * 1.1;

      if (shakeAmp > 0.002) {
        camera.position.x += Math.sin(t * 47.3) * shakeAmp;
        camera.position.y += Math.sin(t * 39.1 + 1.3) * shakeAmp * 0.7;
        shakeAmp *= Math.exp(-6.5 * dt);
      }

      lookTarget.copy(base.target);
      lookTarget.x += par.x * 1.2;
      camera.lookAt(lookTarget);
    },
  };
}
