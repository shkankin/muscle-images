// ════════════════════════════════════════════════════════════════════
// M.U.S.C.L.E. Collector — handlers.js  (v0.1)
// ────────────────────────────────────────────────────────────────────
// Registers every data-action against the delegate dispatcher. Imported
// for side effects by app.js.
// ════════════════════════════════════════════════════════════════════

import { S, store } from './state.js';
import { render, toast, haptic } from './render.js';
import { onClick, onInput, onChange } from './delegate.js';
import {
  toggleOwned, toggleWant, toggleColor, setField, setFigField, toggleFigColor,
  fetchFigs, exportData, importData,
} from './data.js';

// ── Navigation ─────────────────────────────────────────────────────
onClick('nav-tab', el => {
  const tab = el.dataset.tab;
  if (tab === S.tab && S.screen === 'main') return;
  S.tab = tab; S.screen = 'main'; S.activeFig = null; S._justNavigated = true;
  render();
});

onClick('open-fig', el => {
  S.activeFig = el.dataset.id; S.screen = 'figure'; S.detailShot = null; S._justNavigated = true;
  render();
});

// Filmstrip: switch which shot the detail hero shows.
onClick('view-shot', el => { S.detailShot = el.dataset.shot; render(); });

onClick('back-main', () => { S.screen = 'main'; S.activeFig = null; S._justNavigated = true; render(); });
onClick('recover', () => location.reload());

// ── Filters / search ───────────────────────────────────────────────
onClick('filter-own', el => { S.filterOwn = el.dataset.val; render(); });
onClick('set-view', el => { S.setView = el.dataset.view; store.set('muscle-setview', S.setView); render(); });
onClick('filter-color', el => { S.filterColor = el.dataset.val; render(); });
onClick('search-clear', () => { S.search = ''; render(); focusSearch(); });

onInput('search-input', el => {
  S.search = el.value;
  const caret = el.selectionStart;
  render();
  focusSearch(caret);
});
function focusSearch(caret) {
  const inp = document.querySelector('.search-input');
  if (!inp) return;
  inp.focus();
  if (caret != null) { try { inp.setSelectionRange(caret, caret); } catch {} }
  else { const v = inp.value; inp.value = ''; inp.value = v; }
}

// ── Collection toggles ─────────────────────────────────────────────
onClick('toggle-owned', el => { toggleOwned(el.dataset.id); haptic(); render(); });
onClick('toggle-want', el => { toggleWant(el.dataset.id); render(); });
onClick('toggle-color', el => { toggleColor(el.dataset.id, el.dataset.color); haptic(); render(); });
onClick('quick-own', el => {
  toggleOwned(el.dataset.id); haptic();
  toast(S.coll[el.dataset.id]?.owned ? '✓ Added to collection' : 'Removed from collection');
  render();
});

// ── Sheets ─────────────────────────────────────────────────────────
onClick('open-sheet', el => { S.sheet = el.dataset.sheet; render(); });
onClick('close-sheet', () => { S.sheet = null; render(); });

// ── Theme ──────────────────────────────────────────────────────────
onClick('set-theme', el => {
  S.theme = el.dataset.theme;
  store.set('muscle-theme', S.theme);
  syncThemeColor();
  render();
});
function syncThemeColor() {
  const meta = document.querySelector('meta[name="theme-color"]');
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  if (meta && bg) meta.setAttribute('content', bg);
}

// ── Catalog sync ───────────────────────────────────────────────────
onClick('sync-now', async () => {
  toast('Refreshing catalog…');
  await fetchFigs(true);
  toast(S.syncStatus === 'ok' ? '✓ Catalog up to date' : '✕ Could not reach the repo');
});

// ── Figure (catalog) edits ─────────────────────────────────────────
onInput('edit-name', el => setFigField(S.activeFig, 'name', el.value));
onInput('edit-origin', el => setFigField(S.activeFig, 'origin', el.value));
onChange('edit-inline-color', el => {
  toggleFigColor(S.activeFig, el.dataset.color);
  el.closest('.check')?.classList.toggle('on', el.checked);
});
// ── Owned-copy edits ───────────────────────────────────────────────
onChange('edit-condition', el => setField(S.activeFig, 'condition', el.value));
onChange('edit-pack', el => setField(S.activeFig, 'pack', el.value));
onInput('edit-notes', el => setField(S.activeFig, 'notes', el.value));

// ── Backup / restore ───────────────────────────────────────────────
let _importReplace = false;
onChange('import-replace', el => { _importReplace = el.checked; });

onClick('download-backup', () => {
  const blob = new Blob([exportData()], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = url; a.download = `muscle-collection-${stamp}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('✓ Backup downloaded');
});

onClick('pick-import', () => {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = 'application/json,.json';
  inp.addEventListener('change', () => {
    const file = inp.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const res = importData(String(reader.result), _importReplace ? 'replace' : 'merge');
      if (res.ok) { toast(`✓ Restored ${res.count} figure${res.count === 1 ? '' : 's'}`); S.sheet = null; render(); }
      else toast('✕ ' + res.error, 3000);
    };
    reader.readAsText(file);
  });
  inp.click();
});
