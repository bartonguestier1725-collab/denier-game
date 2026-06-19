const NORMAL_DENIERS = [0, 10, 15, 20, 30, 40, 50, 60, 80, 110];

export const DIFFICULTIES = Object.freeze({
  easy:      Object.freeze({ deniers: Object.freeze([0, 15, 30, 60, 80, 110]), cols: 3, rows: 4 }),
  normal:    Object.freeze({ deniers: Object.freeze(NORMAL_DENIERS), cols: 4, rows: 5 }),
  hard:      Object.freeze({ deniers: Object.freeze([0, 3, 5, 10, 15, 20, 25, 30, 40, 50, 60, 70, 80, 110]), cols: 4, rows: 7 }),
  nightmare: Object.freeze({ deniers: Object.freeze(NORMAL_DENIERS), cols: 4, rows: 5 }),
});

export const MISMATCH_DELAY = 1000; // ms
export const TIMER_INTERVAL = 100; // ms
export const RESULT_TRANSITION_DELAY = 500; // ms

const NIGHTMARE_OPACITY = Object.fromEntries(
  NORMAL_DENIERS.map((d, i) => [d, 0.05 + (0.87 * i) / (NORMAL_DENIERS.length - 1)])
);
Object.freeze(NIGHTMARE_OPACITY);
export { NIGHTMARE_OPACITY };
