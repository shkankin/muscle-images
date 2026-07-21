// ════════════════════════════════════════════════════════════════════
// M.U.S.C.L.E. Collector — app.js  (entry point, v0.1)
// ────────────────────────────────────────────────────────────────────
// Boot order: hydrate IDB → load overrides + collection → draw from
// cache/seed → render → refresh catalog from the network. Registers the
// service worker and the tab-hide flush. Imports handlers for side
// effects (they self-register with the delegate dispatcher).
// ════════════════════════════════════════════════════════════════════

import { S, APP_VERSION, CACHE_KEY, COLL_KEY } from './state.js';
import { hydrate } from './idb-store.js';
import {
  loadFigEdits, loadColl, loadCachedFigs, loadSeedFigs, fetchFigs,
  flushColl, clearJournalOnResume,
} from './data.js';
import { render } from './render.js';
import { bootDelegation } from './delegate.js';
import './handlers.js';

// Expose render so data.js can call it without importing (breaks the cycle).
window.render = render;

async function init() {
  // Hydrate the large stores (collection + catalog cache) into the sync mirror.
  await hydrate([COLL_KEY, CACHE_KEY]);

  loadFigEdits();
  loadColl();

  // Draw immediately from cache; fall back to the bundled seed so the
  // poster wall always paints even offline on first run.
  let drew = loadCachedFigs();
  if (!drew) drew = await loadSeedFigs();

  bootDelegation();
  render();

  // Refresh the catalog from the repo in the background (best-effort).
  fetchFigs(false);

  // Crash-safety: flush the collection synchronously when the tab hides,
  // and clear the journal when it comes back (see data.saveColl / loadColl).
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushColl();
    else clearJournalOnResume();
  });
  window.addEventListener('pagehide', flushColl);

  console.log(`M.U.S.C.L.E. Collector v${APP_VERSION}`);
}

// ── Service worker ─────────────────────────────────────────────────
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(() => {});
  if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
  navigator.serviceWorker.addEventListener('message', e => {
    if (e.data?.type === 'UPDATE_AVAILABLE') {
      let reloaded = false;
      const reload = () => { if (!reloaded) { reloaded = true; location.reload(); } };
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') reload();
      }, { once: true });
    }
  });
}

// ── Last-ditch error surface ───────────────────────────────────────
window.addEventListener('error', e => {
  if (e?.target && e.target !== window && e.target.tagName) return; // ignore resource errors
  console.error('[uncaught]', e?.error || e?.message);
});
window.addEventListener('unhandledrejection', e => console.error('[unhandled]', e?.reason));

init();
