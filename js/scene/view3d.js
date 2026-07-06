// 3D view orchestrator. Subscribes to the game-state event bus and drives the
// scene modules. This module is the ONLY bridge between game logic and WebGL —
// game-state.js knows nothing about rendering.
import { gameState } from '../game-state.js';
import { DIFFICULTIES } from '../constants.js';
import { detectTier, createEngine } from './engine.js';
import { createTable } from './table.js';
import { createLights } from './lights.js';
import { createCameraRig } from './camera-rig.js';
import { createCardsManager } from './cards.js';
import { createInput } from './input.js';
import {
  setTextureDefaults, ensureFonts, loadDamask,
  bakeBackTexture, bakeBlobTexture, bakeFocusTexture,
  getFrontMaterial, refreshAllTextures,
} from './materials.js';
import { nextFrame, clearAllTweens } from './anim.js';

export async function initView3D() {
  const canvas = document.getElementById('scene-canvas');
  if (!canvas) throw new Error('#scene-canvas missing');
  const gameScreen = document.getElementById('game-screen');

  const params = new URLSearchParams(location.search);
  const debug = params.has('debug');

  const tier = detectTier();
  setTextureDefaults(tier);

  const reducedMq = window.matchMedia('(prefers-reduced-motion: reduce)');
  const reduced = () => reducedMq.matches;

  const engine = createEngine(canvas, tier, { debug });
  const { scene, camera } = engine;

  // --- Assets that must exist before first paint ---
  await Promise.all([ensureFonts(), loadDamask()]);
  bakeBackTexture();
  bakeBlobTexture();
  bakeFocusTexture();

  const table = createTable({ scene, texScale: tier.texScale, anisotropy: tier.anisotropy });
  await table.setDifficulty(null); // default baroque table behind the title

  const lights = createLights({ scene });
  lights.setReducedMotion(reduced());

  const rig = createCameraRig(camera);
  rig.setReducedMotion(reduced());
  rig.frameDefault();

  const cards = createCardsManager({ scene });

  reducedMq.addEventListener?.('change', () => {
    lights.setReducedMotion(reduced());
    rig.setReducedMotion(reduced());
  });

  // --- Input ---
  let inputLocked = false;
  let deckIds = [];
  let focusIndex = null;

  function tapCard(cardId) {
    const st = gameState.getState();
    if (st.phase !== 'playing') return;
    if (st.subState === 'waitingDismiss') {
      gameState.dismissMismatch();
      return;
    }
    if (inputLocked || cardId == null) return;
    gameState.flipCard(cardId);
  }

  createInput({
    element: gameScreen,
    camera,
    getTargets: () => cards.raycastTargets(),
    onTap: (hit) => tapCard(hit ? hit.cardId : null),
    onHover: (hit) => {
      const st = gameState.getState();
      const usable = st.phase === 'playing' && st.subState !== 'waitingDismiss' && !inputLocked;
      const hovering = cards.setHover(usable && hit ? hit.cardId : null);
      gameScreen.style.cursor = hovering ? 'pointer' : '';
    },
    onMouse: (x, y) => rig.setMouse(x, y),
    onKey: (e) => {
      const st = gameState.getState();
      if (st.phase !== 'playing') return;
      const layout = cards.getLayout();
      if (!layout) return;
      const arrows = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
      const isArrow = arrows.includes(e.key);
      if (!isArrow && e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Escape') return;
      e.preventDefault();

      if (e.key === 'Escape') {
        focusIndex = null;
        cards.focusSlot(null);
        return;
      }
      if (isArrow) {
        if (focusIndex == null) {
          focusIndex = 0;
        } else {
          const { cols, rows } = layout;
          let c = focusIndex % cols;
          let r = Math.floor(focusIndex / cols);
          if (e.key === 'ArrowLeft') c = Math.max(0, c - 1);
          if (e.key === 'ArrowRight') c = Math.min(cols - 1, c + 1);
          if (e.key === 'ArrowUp') r = Math.max(0, r - 1);
          if (e.key === 'ArrowDown') r = Math.min(rows - 1, r + 1);
          focusIndex = Math.min(deckIds.length - 1, r * cols + c);
        }
        cards.focusSlot(focusIndex);
      } else if (focusIndex != null) {
        tapCard(deckIds[focusIndex]);
      }
    },
  });

  // --- Game events -> scene ---
  async function startBoard() {
    const { deck, difficulty } = gameState.getState();
    const cfg = DIFFICULTIES[difficulty];
    if (!cfg) return;

    inputLocked = true;
    focusIndex = null;
    cards.focusSlot(null);

    // Bake this difficulty's front textures in chunks (avoids a first-flip hitch)
    const nightmare = difficulty === 'nightmare';
    const deniers = [...new Set(deck.map((c) => c.denier))];
    for (let i = 0; i < deniers.length; i++) {
      getFrontMaterial(deniers[i], { nightmare });
      if (i % 4 === 3) await nextFrame();
    }

    table.setDifficulty(difficulty);
    const moodParams = lights.setDifficulty(difficulty);
    engine.setExposure(moodParams.exposure);
    engine.setFogDensity(moodParams.fogDensity);

    const layout = cards.buildBoard(
      deck, difficulty, cfg, window.innerWidth / window.innerHeight,
    );
    deckIds = deck.map((c) => c.id);
    lights.setLayout(layout.spanW, layout.spanH);
    table.setLayout(layout.spanW, layout.spanH);
    rig.frameGrid(layout.spanW, layout.spanH);
    engine.compile(); // new materials -> warm shaders before the deal

    cards.dealAll(reduced(), () => {
      setTimeout(() => { inputLocked = false; }, 120);
    });
  }

  gameState.on('SCREEN_CHANGE', ({ phase }) => {
    if (phase === 'playing') {
      startBoard();
    } else if (phase === 'title') {
      clearAllTweens();
      cards.clearBoard();
      const moodParams = lights.setDifficulty(null);
      engine.setExposure(moodParams.exposure);
      engine.setFogDensity(moodParams.fogDensity);
      table.setDifficulty(null);
      table.setLayout(34, 24);
      rig.frameDefault();
    }
    // select / result: keep the current tableau visible behind the DOM screen
  });

  gameState.on('CARD_FLIP', ({ cardId }) => {
    const ent = cards.entity(cardId);
    if (ent) ent.flipUp(reduced());
  });

  gameState.on('CARD_UNFLIP', ({ cardIds }) => {
    for (const id of cardIds) {
      const ent = cards.entity(id);
      if (ent) ent.flipDown(reduced());
    }
  });

  gameState.on('CARD_MISMATCH', ({ cardIds }) => {
    for (const id of cardIds) {
      const ent = cards.entity(id);
      if (ent) ent.shake(reduced());
    }
  });

  gameState.on('CARD_MATCH', ({ cardIds }) => {
    for (const id of cardIds) {
      const ent = cards.entity(id);
      if (ent) ent.setMatched(reduced());
    }
  });

  // --- Frame loop wiring ---
  engine.onFrame((dt, t) => {
    cards.update(dt, t);
    lights.update(t);
    rig.update(dt, t);
  });
  engine.onResize(() => rig.onResize());
  engine.setContextRestore(() => {
    refreshAllTextures();
    table.refresh();
  });

  // Warm up shader programs with a throwaway card before revealing the page
  cards.buildBoard(
    [{ id: -1, denier: 30 }],
    'easy',
    { cols: 1, rows: 1 },
    window.innerWidth / window.innerHeight,
  );
  engine.compile();
  cards.clearBoard();

  engine.start();

  if (debug) {
    window.__denier3d = { engine, gameState, cards, rig, lights };
  }
}
