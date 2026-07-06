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
let moveCounter;
let timerDisplay;
let resultDifficulty;
let resultMoves;
let resultTime;
let sections;

// Reference chart state
let referenceChart;
let btnToggleChart;
let chartWasShown = false;

// Last game result for share
let lastResult = null;

// ARIA live announcer
let srAnnouncer;

function requireEl(id) {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element: #${id}`);
  return el;
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

function announce(text) {
  if (srAnnouncer) srAnnouncer.textContent = text;
}

export function initDomUi() {
  if (initialized) return;
  initialized = true;

  moveCounter = requireEl('move-counter');
  timerDisplay = requireEl('timer');
  resultDifficulty = requireEl('result-difficulty');
  resultMoves = requireEl('result-moves');
  resultTime = requireEl('result-time');
  referenceChart = requireEl('reference-chart');
  btnToggleChart = requireEl('btn-toggle-chart');
  srAnnouncer = requireEl('sr-announcer');
  const tableMonocle = document.getElementById('table-monocle');

  sections = {};
  for (const [p, id] of Object.entries(PHASE_SECTIONS)) {
    sections[p] = requireEl(id);
  }

  // --- Screen navigation buttons ---
  requireEl('btn-start').addEventListener('click', () => {
    gameState.showSelect();
  });

  document.querySelector('.difficulty-grid').addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-difficulty');
    if (!btn) return;
    const difficulty = btn.dataset.difficulty;
    if (difficulty) gameState.startGame(difficulty);
  });

  requireEl('btn-retry').addEventListener('click', () => {
    gameState.retry();
  });

  requireEl('btn-title').addEventListener('click', () => {
    gameState.backToTitle();
  });

  // --- Toggle reference chart + monocle prop ---
  btnToggleChart.addEventListener('click', () => {
    referenceChart.classList.toggle('hidden');
    if (!referenceChart.classList.contains('hidden')) {
      chartWasShown = true;
      if (tableMonocle) tableMonocle.classList.remove('hidden');
      // The 3D view drops a monocle prop on the table (diegetic indicator)
      window.dispatchEvent(new CustomEvent('denier:chart-shown'));
    }
  });

  // --- Share button ---
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

  // --- Screen / HUD / reference chart wiring ---
  gameState.on('SCREEN_CHANGE', ({ phase }) => {
    switchScreen(phase);
    if (phase === 'playing') {
      moveCounter.textContent = '手数: 0';
      timerDisplay.textContent = '時間: 00:00.0';

      // Build reference chart and show toggle button
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

    // Store result for share button
    lastResult = { moves, time, difficulty, chartWasShown };
  });

  // --- ARIA live announcer (screen-reader status updates) ---
  gameState.on('CARD_FLIP', ({ denier }) => {
    const { difficulty } = gameState.getState();
    if (difficulty === 'nightmare') {
      announce('カードをめくった');
    } else {
      announce(`${denier}デニール`);
    }
  });

  gameState.on('CARD_MATCH', () => {
    announce('マッチ！');
  });

  gameState.on('CARD_UNFLIP', () => {
    announce('はずれ');
  });

  gameState.on('GAME_COMPLETE', ({ moves, time }) => {
    announce(`クリア！手数${moves}、時間${time}`);
  });
}
