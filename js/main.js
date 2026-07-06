import { gameState } from './game-state.js';
import { initRenderer } from './renderer.js';
import { initAtmosphere } from './atmosphere.js';

initRenderer();
initAtmosphere();

document.getElementById('btn-start').addEventListener('click', () => {
  gameState.showSelect();
});

document.querySelector('.difficulty-grid').addEventListener('click', (e) => {
  const btn = e.target.closest('.btn-difficulty');
  if (!btn) return;
  const difficulty = btn.dataset.difficulty;
  if (difficulty) gameState.startGame(difficulty);
});

document.getElementById('game-screen').addEventListener('click', (e) => {
  // First try to dismiss a mismatch (clicking anywhere closes the pair)
  gameState.dismissMismatch();

  const card = e.target.closest('.card');
  if (!card || card.disabled || card.classList.contains('matched')) return;
  const cardId = parseInt(card.dataset.cardId, 10);
  if (!Number.isNaN(cardId)) gameState.flipCard(cardId);
});

document.getElementById('btn-retry').addEventListener('click', () => {
  gameState.retry();
});

document.getElementById('btn-title').addEventListener('click', () => {
  gameState.backToTitle();
});
