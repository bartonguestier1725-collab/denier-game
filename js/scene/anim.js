// Minimal tween/easing engine for the 3D view. No external deps.
// All animations in the scene are driven through tickTweens(dt) from the engine loop.

const active = new Set();

export const Easings = {
  linear: (t) => t,
  outQuad: (t) => t * (2 - t),
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  inCubic: (t) => t * t * t,
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  // Overshoot ease — used for card flips (spring-like snap past the target and settle)
  outBack: (s = 1.35) => (t) => {
    const c = s + 1;
    const x = t - 1;
    return 1 + c * x * x * x + s * x * x;
  },
};

/**
 * tween({ dur, delay, ease, onUpdate(eased, linear), onComplete }) -> { cancel }
 * Durations in seconds.
 */
export function tween({ dur, delay = 0, ease = Easings.outCubic, onUpdate, onComplete }) {
  const tw = { t: -delay, dur, ease, onUpdate, onComplete };
  active.add(tw);
  return {
    cancel() { active.delete(tw); },
  };
}

export function tickTweens(dt) {
  for (const tw of [...active]) {
    tw.t += dt;
    if (tw.t < 0) continue;
    const k = Math.min(1, tw.t / tw.dur);
    if (tw.onUpdate) tw.onUpdate(tw.ease(k), k);
    if (k >= 1) {
      active.delete(tw);
      if (tw.onComplete) tw.onComplete();
    }
  }
}

export function clearAllTweens() {
  active.clear();
}

/** Frame-rate independent exponential smoothing toward a target. */
export function damp(current, target, lambda, dt) {
  return target + (current - target) * Math.exp(-lambda * dt);
}

/** Await the next animation frame (used to chunk texture baking). */
export function nextFrame() {
  return new Promise((r) => requestAnimationFrame(r));
}
