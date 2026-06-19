import { MISMATCH_DELAY, RESULT_TRANSITION_DELAY } from './constants.js';
import { createDeck, checkMatch } from './card-model.js';
import { createTimer } from './timer.js';

export function createGameState() {
  const listeners = Object.create(null);

  let phase = 'title';
  let subState = 'idle';
  let difficulty = null;
  let deck = [];
  let cardById = new Map();
  let moves = 0;
  let matchedCount = 0;
  let totalPairs = 0;
  let firstFlipped = null;
  let pendingTimeout = null;
  let timerStarted = false;

  const timer = createTimer((formatted) => {
    emit('TIMER_TICK', { formatted });
  });

  function on(type, callback) {
    if (!listeners[type]) listeners[type] = [];
    listeners[type].push(callback);
    return () => {
      const list = listeners[type];
      if (!list) return;
      const idx = list.indexOf(callback);
      if (idx !== -1) list.splice(idx, 1);
    };
  }

  function emit(type, payload) {
    const list = listeners[type];
    if (!list) return;
    for (const cb of [...list]) {
      try { cb(payload); } catch (e) { console.error(`[gameState] ${type} listener error:`, e); }
    }
  }

  function clearPending() {
    if (pendingTimeout !== null) {
      clearTimeout(pendingTimeout);
      pendingTimeout = null;
    }
    firstFlipped = null;
    subState = 'idle';
  }

  function resetPlayState(diff) {
    clearPending();
    timer.reset();
    timerStarted = false;
    difficulty = diff;
    deck = createDeck(diff);
    cardById = new Map(deck.map(c => [c.id, c]));
    moves = 0;
    matchedCount = 0;
    totalPairs = deck.length / 2;
  }

  function showSelect() {
    clearPending();
    timer.reset();
    phase = 'select';
    emit('SCREEN_CHANGE', { phase });
  }

  function startGame(diff) {
    resetPlayState(diff);
    phase = 'playing';
    emit('SCREEN_CHANGE', { phase });
  }

  function flipCard(cardId) {
    if (phase !== 'playing') return;
    if (subState === 'resolving' || subState === 'completing') return;

    const card = cardById.get(cardId);
    if (!card || card.matched) return;

    if (subState === 'idle') {
      subState = 'oneFlipped';
      firstFlipped = card;

      if (!timerStarted) {
        timer.start();
        timerStarted = true;
      }

      emit('CARD_FLIP', { cardId, denier: card.denier });
      return;
    }

    if (subState === 'oneFlipped') {
      if (firstFlipped.id === cardId) return;

      subState = 'resolving';
      const second = card;

      emit('CARD_FLIP', { cardId, denier: second.denier });

      moves++;
      emit('MOVE_INCREMENT', { moves });

      if (checkMatch(firstFlipped, second)) {
        firstFlipped.matched = true;
        second.matched = true;
        matchedCount++;

        emit('CARD_MATCH', {
          cardIds: [firstFlipped.id, second.id],
          denier: firstFlipped.denier,
        });

        firstFlipped = null;

        if (matchedCount === totalPairs) {
          subState = 'completing';
          timer.stop();
          pendingTimeout = setTimeout(() => {
            pendingTimeout = null;
            phase = 'result';
            emit('GAME_COMPLETE', {
              moves,
              time: timer.getFormatted(),
              timeMs: timer.getElapsedMs(),
              difficulty,
            });
            emit('SCREEN_CHANGE', { phase });
          }, RESULT_TRANSITION_DELAY);
        } else {
          subState = 'idle';
        }
      } else {
        emit('CARD_MISMATCH', {
          cardIds: [firstFlipped.id, second.id],
        });

        const flippedFirst = firstFlipped;
        pendingTimeout = setTimeout(() => {
          pendingTimeout = null;
          emit('CARD_UNFLIP', { cardIds: [flippedFirst.id, second.id] });
          firstFlipped = null;
          subState = 'idle';
        }, MISMATCH_DELAY);
      }
    }
  }

  function retry() {
    if (!difficulty) return;
    resetPlayState(difficulty);
    phase = 'playing';
    emit('SCREEN_CHANGE', { phase });
  }

  function backToTitle() {
    clearPending();
    timer.reset();
    timerStarted = false;
    difficulty = null;
    deck = [];
    cardById = new Map();
    moves = 0;
    matchedCount = 0;
    totalPairs = 0;
    phase = 'title';
    emit('SCREEN_CHANGE', { phase });
  }

  function getState() {
    return {
      phase,
      subState,
      difficulty,
      moves,
      deck: deck.map(c => ({ ...c })),
      matchedCount,
      totalPairs,
    };
  }

  return {
    on,
    showSelect,
    startGame,
    flipCard,
    retry,
    backToTitle,
    getState,
  };
}

export const gameState = createGameState();
