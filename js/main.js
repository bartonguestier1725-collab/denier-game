import { initDomUi } from './dom-ui.js';

const params = new URLSearchParams(location.search);

function webgl2Available() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGL2RenderingContext && c.getContext('webgl2'));
  } catch { return false; }
}

const useClassic = params.has('classic') || !webgl2Available();
document.body.dataset.view = useClassic ? 'classic' : '3d';

initDomUi();

const overlay = document.getElementById('loading-overlay');
function hideOverlay() {
  if (!overlay) return;
  overlay.classList.add('done');
  setTimeout(() => overlay.remove(), 600);
}

if (useClassic) {
  const { initClassicRenderer } = await import('./renderer.js');
  initClassicRenderer();
  hideOverlay();
} else {
  try {
    const { initView3D } = await import('./scene/view3d.js');
    await initView3D();
  } catch (err) {
    console.error('[main] 3D init failed, falling back to classic:', err);
    document.body.dataset.view = 'classic';
    const { initClassicRenderer } = await import('./renderer.js');
    initClassicRenderer();
  }
  hideOverlay();
}
