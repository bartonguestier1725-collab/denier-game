import { gameState } from './game-state.js';
import { DIFFICULTIES, NIGHTMARE_OPACITY } from './constants.js';

let initialized = false;
let cardMap = new Map();
let gameBoard;

function requireEl(id) {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element: #${id}`);
  return el;
}

function buildGrid() {
  const { difficulty, deck } = gameState.getState();
  const config = DIFFICULTIES[difficulty];
  if (!config) return;

  const isNightmare = difficulty === 'nightmare';

  cardMap.clear();
  gameBoard.style.setProperty('--grid-cols', config.cols);

  const fragment = document.createDocumentFragment();

  for (const card of deck) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'card';
    btn.dataset.cardId = card.id;

    // Random slight rotation for "hand-dealt" naturalness
    const jitter = (Math.random() - 0.5) * 3; // -1.5 to +1.5 degrees
    btn.style.setProperty('--jitter', `${jitter}deg`);

    const inner = document.createElement('div');
    inner.className = 'card-inner';

    const front = document.createElement('div');
    front.className = 'card-front';

    if (isNightmare) {
      front.classList.add('nightmare');
      const opacity = NIGHTMARE_OPACITY[card.denier] ?? 0.5;
      front.style.backgroundColor = `rgba(0, 0, 0, ${opacity})`;
    } else {
      const label = document.createElement('span');
      label.textContent = card.denier;
      front.appendChild(label);
    }

    const back = document.createElement('div');
    back.className = 'card-back';

    inner.appendChild(front);
    inner.appendChild(back);
    btn.appendChild(inner);
    fragment.appendChild(btn);
    cardMap.set(card.id, btn);
  }

  gameBoard.replaceChildren(fragment);
}

export function initClassicRenderer() {
  if (initialized) return;
  initialized = true;

  gameBoard = requireEl('game-board');

  gameState.on('SCREEN_CHANGE', ({ phase }) => {
    if (phase === 'playing') buildGrid();
  });

  gameState.on('CARD_FLIP', ({ cardId }) => {
    const el = cardMap.get(cardId);
    if (el) el.classList.add('flipped');
  });

  gameState.on('CARD_MATCH', ({ cardIds }) => {
    for (const id of cardIds) {
      const el = cardMap.get(id);
      if (!el) continue;
      el.classList.add('matched');
      el.disabled = true;
      el.tabIndex = -1;

      // Match celebration animation
      el.classList.add('match-anim');
      el.addEventListener('animationend', () => {
        el.classList.remove('match-anim');
      }, { once: true });
    }
  });

  gameState.on('CARD_UNFLIP', ({ cardIds }) => {
    for (const id of cardIds) {
      const el = cardMap.get(id);
      if (!el) continue;

      // Mismatch shake animation before unflipping
      el.classList.add('mismatch-anim');
      el.addEventListener('animationend', () => {
        el.classList.remove('mismatch-anim');
      }, { once: true });

      el.classList.remove('flipped');
    }
  });

  // Card click handling (classic DOM board only — 3D view handles its own picking)
  requireEl('game-screen').addEventListener('click', (e) => {
    // If a mismatch is on screen waiting to be dismissed, this click only
    // dismisses it — it must NOT also flip whatever card was clicked
    // (previously this double-fired: dismiss + flip in the same click).
    if (gameState.getState().subState === 'waitingDismiss') {
      gameState.dismissMismatch();
      return;
    }

    const card = e.target.closest('.card');
    if (!card || card.disabled || card.classList.contains('matched')) return;
    const cardId = parseInt(card.dataset.cardId, 10);
    if (!Number.isNaN(cardId)) gameState.flipCard(cardId);
  });
}
