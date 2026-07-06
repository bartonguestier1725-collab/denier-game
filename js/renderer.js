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

// Feature 3: Reference chart state
let referenceChart;
let btnToggleChart;
let chartWasShown = false;

// Feature 2: Last game result for share
let lastResult = null;

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

function buildReferenceChart(difficulty) {
  const config = DIFFICULTIES[difficulty];
  if (!config || !referenceChart) return;

  const isNightmare = difficulty === 'nightmare';
  referenceChart.replaceChildren();

  for (const denier of config.deniers) {
    const card = document.createElement('div');
    card.className = 'ref-card';

    // Scatter cards randomly in the left panel area
    const jitter = (Math.random() - 0.5) * 30; // -15 to +15 degrees
    const x = 10 + Math.random() * 55; // 10-65% of container width
    const ySlot = config.deniers.indexOf(denier);
    const yBase = 8 + (ySlot / config.deniers.length) * 75; // distribute vertically
    const yOffset = (Math.random() - 0.5) * 6; // +-3% random offset
    card.style.setProperty('--ref-jitter', `${jitter}deg`);
    card.style.setProperty('--ref-x', `${x}%`);
    card.style.setProperty('--ref-y', `${yBase + yOffset}%`);

    if (isNightmare) {
      card.classList.add('nightmare-ref');
      const opacity = NIGHTMARE_OPACITY[denier] ?? 0.5;
      card.style.backgroundColor = `rgba(0, 0, 0, ${opacity})`;
    } else {
      card.textContent = denier;
    }

    referenceChart.appendChild(card);
  }
}

function hideChart() {
  if (referenceChart) referenceChart.classList.add('hidden');
  if (btnToggleChart) btnToggleChart.classList.remove('active');
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
  referenceChart = requireEl('reference-chart');
  btnToggleChart = requireEl('btn-toggle-chart');
  const tableMonocle = document.getElementById('table-monocle');

  sections = {};
  for (const [p, id] of Object.entries(PHASE_SECTIONS)) {
    sections[p] = requireEl(id);
  }

  // Toggle reference chart + monocle prop
  btnToggleChart.addEventListener('click', () => {
    referenceChart.classList.toggle('hidden');
    if (!referenceChart.classList.contains('hidden')) {
      chartWasShown = true;
      if (tableMonocle) tableMonocle.classList.remove('hidden');
    }
  });

  // Feature 2: Share button
  const btnShare = requireEl('btn-share');
  btnShare.addEventListener('click', () => {
    if (!lastResult) return;
    const chartLabel = lastResult.chartWasShown ? 'あり' : 'なし';
    const text = [
      '\u{1F0CF} デニール神経衰弱',
      '━━━━━━━━━━',
      `難易度: ${DIFFICULTY_LABELS[lastResult.difficulty] || lastResult.difficulty}`,
      `一覧表: ${chartLabel}`,
      `手数: ${lastResult.moves}手 / ${lastResult.time}`,
      '━━━━━━━━━━',
      '#デニール神経衰弱',
    ].join('\n');
    const url = 'https://twitter.com/intent/tweet?text=' + encodeURIComponent(text);
    window.open(url, '_blank', 'noopener,noreferrer');
  });

  gameState.on('SCREEN_CHANGE', ({ phase }) => {
    switchScreen(phase);
    if (phase === 'playing') {
      buildGrid();
      moveCounter.textContent = '手数: 0';
      timerDisplay.textContent = '時間: 00:00.0';

      // Feature 3: Build reference chart and show toggle button
      const { difficulty } = gameState.getState();
      chartWasShown = false;
      buildReferenceChart(difficulty);
      referenceChart.classList.add('hidden');
      btnToggleChart.classList.add('active');
      if (tableMonocle) tableMonocle.classList.add('hidden');
    } else {
      // Hide chart and toggle button on non-game screens
      hideChart();
      if (tableMonocle) tableMonocle.classList.add('hidden');
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

    // Feature 2: Store result for share button
    lastResult = { moves, time, difficulty, chartWasShown };
  });
}
