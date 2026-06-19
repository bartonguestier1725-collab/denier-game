import { DIFFICULTIES } from './constants.js';

/**
 * Fisher-Yates shuffle (unbiased).
 * Mutates and returns the array.
 */
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Create a shuffled deck of card objects for the given difficulty.
 *
 * @param {'easy'|'normal'|'hard'|'nightmare'} difficulty
 * @returns {{ id: number, denier: number, pairIndex: number, matched: boolean }[]}
 */
export function createDeck(difficulty) {
  const config = DIFFICULTIES[difficulty];
  if (!config) {
    throw new Error(`Unknown difficulty: "${difficulty}"`);
  }

  let nextId = 0;
  const cards = [];

  for (const denier of config.deniers) {
    for (let pairIndex = 0; pairIndex < 2; pairIndex++) {
      cards.push({ id: nextId++, denier, pairIndex, matched: false });
    }
  }

  return shuffle(cards);
}

/**
 * Check whether two cards form a valid match.
 * Same denier value AND different card ids (prevents same-card-double-click).
 *
 * @param {{ id: number, denier: number }} cardA
 * @param {{ id: number, denier: number }} cardB
 * @returns {boolean}
 */
export function checkMatch(cardA, cardB) {
  if (!cardA || !cardB) return false;
  return cardA.denier === cardB.denier && cardA.id !== cardB.id;
}
