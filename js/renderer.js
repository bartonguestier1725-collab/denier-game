import { gameState } from './game-state.js';
import { DIFFICULTIES, NIGHTMARE_OPACITY } from './constants.js';

const PHASE_SECTIONS = {
  title: 'title-screen',
  select: 'select-screen',
  playing: 'game-screen',
  result: 'result-screen',
};

const DIFFICULTY_LABELS = {
  easy: 'Easy',
  normal: 'Normal',
  hard: 'Hard',
  nightmare: 'Nightmare',
};

let initialized = false;
let cardMap = new Map();
let gameBoard;
let moveCounter;
let timerDisplay;
let resultDifficulty;
let resultMoves;
let resultTime;
let sections;

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

function switchScreen(phase) {
  if (!(phase in PHASE_SECTIONS)) return;
  for (const p of Object.keys(PHASE_SECTIONS)) {
    const el = sections[p];
    if (p === phase) {
      el.classList.add('active');
    } else {
      el.classList.remove('active');
    }
  }
}

export function initRenderer() {
  if (initialized) return;
  initialized = true;

  gameBoard = requireEl('game-board');
  moveCounter = requireEl('move-counter');
  timerDisplay = requireEl('timer');
  resultDifficulty = requireEl('result-difficulty');
  resultMoves = requireEl('result-moves');
  resultTime = requireEl('result-time');

  sections = {};
  for (const [p, id] of Object.entries(PHASE_SECTIONS)) {
    sections[p] = requireEl(id);
  }

  gameState.on('SCREEN_CHANGE', ({ phase }) => {
    switchScreen(phase);
    if (phase === 'playing') {
      buildGrid();
      moveCounter.textContent = '手数: 0';
      timerDisplay.textContent = '時間: 00:00.0';
    }
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
    }
  });

  gameState.on('CARD_UNFLIP', ({ cardIds }) => {
    for (const id of cardIds) {
      const el = cardMap.get(id);
      if (el) el.classList.remove('flipped');
    }
  });

  gameState.on('TIMER_TICK', ({ formatted }) => {
    timerDisplay.textContent = `時間: ${formatted}`;
  });

  gameState.on('MOVE_INCREMENT', ({ moves }) => {
    moveCounter.textContent = `手数: ${moves}`;
  });

  gameState.on('GAME_COMPLETE', ({ moves, time, difficulty }) => {
    resultDifficulty.textContent = `難易度: ${DIFFICULTY_LABELS[difficulty] || difficulty}`;
    resultMoves.textContent = `手数: ${moves}`;
    resultTime.textContent = `時間: ${time}`;
  });
}
