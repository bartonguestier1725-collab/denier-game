import { TIMER_INTERVAL } from './constants.js';

/**
 * Create a performance.now()-based timer.
 * The onTick callback receives a formatted time string on each interval tick.
 *
 * @param {(formatted: string) => void} onTick - Called every TIMER_INTERVAL ms with "MM:SS.s"
 * @returns {{ start: () => void, stop: () => void, reset: () => void, getElapsedMs: () => number, getFormatted: () => string }}
 */
export function createTimer(onTick) {
  let startTime = 0;
  let pausedElapsed = 0;
  let running = false;
  let intervalId = null;

  function getElapsedMs() {
    if (running) {
      return performance.now() - startTime;
    }
    return pausedElapsed;
  }

  function getFormatted() {
    const totalMs = getElapsedMs();
    const totalSeconds = totalMs / 1000;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
    const tenths = Math.floor((totalMs % 1000) / 100);

    const mm = String(minutes).padStart(2, '0');
    const ss = String(seconds).padStart(2, '0');
    return `${mm}:${ss}.${tenths}`;
  }

  function tick() {
    if (typeof onTick === 'function') onTick(getFormatted());
  }

  function start() {
    if (running) return;
    running = true;
    startTime = performance.now() - pausedElapsed;
    tick();
    intervalId = setInterval(tick, TIMER_INTERVAL);
  }

  function stop() {
    if (!running) return;
    pausedElapsed = performance.now() - startTime;
    running = false;
    if (intervalId !== null) {
      clearInterval(intervalId);
      intervalId = null;
    }
    tick();
  }

  function reset() {
    stop();
    pausedElapsed = 0;
    startTime = 0;
    tick();
  }

  return { start, stop, reset, getElapsedMs, getFormatted };
}
