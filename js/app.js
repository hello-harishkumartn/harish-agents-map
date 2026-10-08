// Entry point: wires data polling, the 3D world and the UI together.
import { World } from './world.js';
import { UI } from './ui.js';
import { loadStatus, POLL_MS } from './data.js';
import { THEMES, savedTheme, saveTheme, applyCssTheme } from './themes.js';

const host = document.getElementById('scene');
const mobile = window.matchMedia('(max-width: 760px), (pointer: coarse)').matches;
const reducedQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

let data = null;
let world = null;

function select(id) {
  if (!data?.agents.some(a => a.id === id)) return;
  world?.focusAgent(id);
  ui.openDetail(id);
}

function closePanel() {
  ui.closeDetail();
  world?.clearSelection();
}

const ui = new UI({
  onAgent: select,
  onDesk: id => { closePanel(); world?.focusDesk(id); },
  onClose: closePanel,
  onHome: () => { closePanel(); world?.resetView(); },
  onTheme: id => setTheme(id),
});

function setTheme(id) {
  applyCssTheme(id);
  world?.setTheme(THEMES[id]);
  ui.setTheme(id);
  saveTheme(id);
}

try {
  world = new World(host, { mobile, reduced: reducedQuery.matches, onPick: select });
  world.onDesk = id => world.focusDesk(id);
} catch (err) {
  console.error(err);
  host.classList.add('no-webgl');
  host.textContent = '3D view unavailable on this device — the activity feed still works.';
}
setTheme(savedTheme());
reducedQuery.addEventListener?.('change', e => { if (world) world.motion = e.matches ? 0.2 : 1; });

function apply(next) {
  data = next;
  const now = Date.now();
  world?.sync(data, now);
  ui.render(data, now);
}

async function refresh(first = false) {
  try {
    apply(await loadStatus());
  } catch (err) {
    console.warn('status.json load failed', err);
    ui.toast(data ? `Couldn't refresh status (${err.message}). Showing last data.` : `Couldn't load status.json (${err.message}).`);
    if (data) ui.render(data); // still re-evaluate relative times / stale badge
  }
  if (first) {
    document.body.classList.add('ready');
    const m = location.hash.match(/^#agent=([\w-]+)$/);
    if (m) select(m[1]);
  }
}

refresh(true);
setInterval(() => { if (!document.hidden) refresh(); }, POLL_MS);

// Render loop, paused while the tab is hidden.
let raf = 0, last = 0, elapsed = 0;
function loop(ms) {
  raf = requestAnimationFrame(loop);
  const dt = Math.min(0.1, last ? (ms - last) / 1000 : 0);
  last = ms;
  elapsed += dt;
  world.frame(dt, elapsed);
}
function start() { if (world && !raf) { last = 0; raf = requestAnimationFrame(loop); } }
function stop() { cancelAnimationFrame(raf); raf = 0; }

document.addEventListener('visibilitychange', () => {
  if (document.hidden) stop();
  else { start(); refresh(); }
});
start();

window.addEventListener('resize', () => world?.resize(host.clientWidth, host.clientHeight));
window.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    const menu = document.getElementById('themeMenu');
    if (!menu.hidden) menu.hidden = true;
    else closePanel();
  }
});
