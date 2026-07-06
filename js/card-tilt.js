/**
 * card-tilt.js — Mouse-driven parallax tilt on face-down cards
 *
 * Applies tilt to the OUTER .card element (not .card-inner) so it
 * never conflicts with the flip transform on .card-inner.
 * Respects prefers-reduced-motion.
 */

export function initCardTilt() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

  const board = document.getElementById('game-board');
  if (!board) return;

  board.addEventListener('mousemove', (e) => {
    const card = e.target.closest('.card');
    if (!card || card.classList.contains('flipped') || card.classList.contains('matched')) return;
    const rect = card.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    card.style.transform =
      `perspective(600px) rotateY(${x * 8}deg) rotateX(${-y * 8}deg)`;
  });

  board.addEventListener('mouseout', (e) => {
    const card = e.target.closest('.card');
    if (card && !card.contains(e.relatedTarget)) {
      card.style.transform = '';
    }
  });

  // Clear tilt when card gets flipped (click)
  board.addEventListener('click', (e) => {
    const card = e.target.closest('.card');
    if (card) {
      card.style.transform = '';
    }
  }, true);
}
