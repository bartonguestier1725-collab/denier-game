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
import { createParticles } from './particles.js';
import { createInput } from './input.js';
import {
  setTextureDefaults, ensureFonts, loadDamask,
  bakeBackTexture, bakeBlobTexture, bakeFocusTexture,
  getFrontMaterial, refreshAllTextures,
} from './materials.js';
import { nextFrame, clearAllTweens, tween, Easings } from './anim.js';
import * as THREE from 'three';

export async function initView3D() {
  const canvas = document.getElementById('scene-canvas');
  if (!canvas) throw new Error('#scene-canvas missing');
  const gameScreen = document.getElementById('game-screen');

  const params = new URLSearchParams(location.search);
  const debug = params.has('debug');

  const tier = detectTier();
  setTextureDefaults({ ...tier, physical: tier.name === 'desktop' });

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
  const particles = createParticles({ scene });

  // --- Monocle prop: dropped on the table the first time the player peeks
  // at the reference chart (diegetic "used a hint" indicator) ---
  const monocle = (() => {
    const gold = new THREE.MeshStandardMaterial({
      color: 0xb9964a, metalness: 0.9, roughness: 0.3, envMapIntensity: 1.2,
    });
    const g = new THREE.Group();
    const rim = new THREE.Mesh(new THREE.TorusGeometry(2.0, 0.2, 12, 42), gold);
    rim.rotation.x = -Math.PI / 2;
    rim.position.y = 0.22;
    const glass = new THREE.Mesh(
      new THREE.CircleGeometry(1.85, 36),
      new THREE.MeshBasicMaterial({
        color: 0xbcd6e8, transparent: true, opacity: 0.14, depthWrite: false,
      }),
    );
    glass.rotation.x = -Math.PI / 2;
    glass.position.y = 0.2;
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.17, 3.2, 10), gold);
    handle.rotation.set(0, -0.55, Math.PI / 2);
    handle.position.set(2.9, 0.16, 1.8);
    g.add(rim, glass, handle);
    g.visible = false;
    scene.add(g);
    return g;
  })();
  let monocleShown = false;

  window.addEventListener('denier:chart-shown', () => {
    if (gameState.getState().phase !== 'playing' || monocleShown) return;
    monocleShown = true;
    monocle.visible = true;
    if (reduced()) {
      monocle.position.y = 0;
      return;
    }
    tween({
      dur: 0.55,
      ease: Easings.outCubic,
      onUpdate: (e) => { monocle.position.y = 9 * (1 - e); },
      onComplete: () => { monocle.position.y = 0; },
    });
  });

  const GRADES = {
    standard: { saturation: 1.02, tint: [1.0, 0.985, 0.955], vignette: 1.12, grain: 0.045, ca: 1.15 },
    nightmare: { saturation: 0.7, tint: [0.9, 0.94, 1.0], vignette: 1.55, grain: 0.06, ca: 1.6 },
  };

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
    engine.setGrade(nightmare ? GRADES.nightmare : GRADES.standard);

    const layout = cards.buildBoard(
      deck, difficulty, cfg, window.innerWidth / window.innerHeight,
    );
    deckIds = deck.map((c) => c.id);
    lights.setLayout(layout.spanW, layout.spanH);
    table.setLayout(layout.spanW, layout.spanH);
    rig.frameGrid(layout.spanW, layout.spanH);
    monocleShown = false;
    monocle.visible = false;
    monocle.position.set(layout.spanW / 2 + 10, 0, layout.spanH / 2 + 4);
    engine.compile(); // new materials -> warm shaders before the deal

    cards.dealAll(reduced(), () => {
      setTimeout(() => { inputLocked = false; }, 120);
    });
    // Failsafe: a stalled tween must never hold the table hostage
    const dealBudgetMs = (deck.length * 45 + 500 + 1500);
    setTimeout(() => { inputLocked = false; }, dealBudgetMs);
  }

  gameState.on('SCREEN_CHANGE', ({ phase }) => {
    if (phase === 'playing') {
      startBoard();
    } else if (phase === 'title') {
      clearAllTweens();
      cards.clearBoard();
      monocle.visible = false;
      const moodParams = lights.setDifficulty(null);
      engine.setExposure(moodParams.exposure);
      engine.setFogDensity(moodParams.fogDensity);
      engine.setGrade(GRADES.standard);
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
    const red = reduced();
    for (const id of cardIds) {
      const ent = cards.entity(id);
      if (ent) ent.shake(red);
    }
    cards.flashMismatch(cardIds, red);
  });

  gameState.on('CARD_MATCH', ({ cardIds }) => {
    const red = reduced();
    for (const id of cardIds) {
      const ent = cards.entity(id);
      if (!ent) continue;
      ent.setMatched(red);
      if (!red) particles.burst(ent.slotX, 1.2, ent.slotZ, 26);
    }
    const mid = cards.flyMatchedToPile(cardIds, red);
    if (mid && !red) {
      cards.shockwave(mid.x, mid.z, red);
      rig.shake(0.35);
    }
  });

  gameState.on('GAME_COMPLETE', () => {
    const red = reduced();
    rig.pullback(1.16, 1.5);
    if (red) return;
    const pile = cards.getPileAnchor();
    for (let i = 0; i < 6; i++) {
      tween({
        dur: 0.01,
        delay: 0.15 + i * 0.16,
        onUpdate: () => {},
        onComplete: () => {
          particles.burst(
            pile.x + (Math.random() - 0.5) * 16,
            2 + Math.random() * 5,
            pile.z + (Math.random() - 0.5) * 10,
            30,
          );
        },
      });
    }
    cards.celebratePile(red);
  });

  // --- Frame loop wiring ---
  let cssThrottle = 0;
  engine.onFrame((dt, t) => {
    cards.update(dt, t, !reduced());
    particles.update(dt, t);
    lights.update(t);
    rig.update(dt, t);
    const flicker = lights.getFlicker();
    table.setFlicker(flicker);
    // HUD warmth breathes with the candles (throttled DOM write)
    cssThrottle += dt;
    if (cssThrottle > 0.12) {
      cssThrottle = 0;
      document.documentElement.style.setProperty('--flicker', flicker.toFixed(3));
    }
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
    window.__denier3d = {
      engine, gameState, cards, rig, lights,
      get inputLocked() { return inputLocked; },
    };
  }
}
