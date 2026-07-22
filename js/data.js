// ════════════════════════════════════════════════════════════════════
// M.U.S.C.L.E. Collector — data.js  (v0.1)
// ────────────────────────────────────────────────────────────────────
// The data layer: fetch + cache the catalog (figures.json), persist the
// collection (IndexedDB with a synchronous localStorage journal for
// crash-safety), the catalog index, collection mutations, filtering, and
// derived stats. render.js reads from here; nothing here imports render
// (it calls the global window.render to break the cycle).
// ════════════════════════════════════════════════════════════════════

import {
  S, store, FIGS_URL, CACHE_KEY, COLL_KEY, CACHE_TTL, IMG,
  SET_TOTAL, BASE_COLOR, COLORS, clone,
} from './state.js';
import { bigGet, bigSet, bigFlush } from './idb-store.js';

const JOURNAL_KEY = COLL_KEY + '-journal';
const FIG_EDITS_KEY = 'muscle-fig-edits';

// § CATALOG OVERRIDES ──────────────────────────────────────────────
// Info on these figures is scarce, so the app is where it gets recorded.
// Until a fact is committed to the shared catalog it lives here, keyed by
// figure id, and is merged over the fetched rows on every load. Fields:
// name, origin, colors[].
let _figEdits = {};
export function loadFigEdits() { _figEdits = store.get(FIG_EDITS_KEY) || {}; }
function applyFigEdits(rows) {
  return rows.map(f => _figEdits[f.id] ? { ...f, ..._figEdits[f.id] } : f);
}
export function setFigField(id, key, val) {
  const cur = _figEdits[id] || {};
  cur[key] = val;
  _figEdits[id] = cur;
  store.set(FIG_EDITS_KEY, _figEdits);
  const f = S.figIndex[id];
  if (f) f[key] = val;
}
export function toggleFigColor(id, color) {
  const f = S.figIndex[id];
  if (!f) return;
  const set = new Set(f.colors || []);
  set.has(color) ? set.delete(color) : set.add(color);
  const arr = [...set];
  if (!arr.length) arr.push(BASE_COLOR); // a sculpt always exists in at least the base color
  setFigField(id, 'colors', arr);
  f.colors = arr;
}

// § INDEX ──────────────────────────────────────────────────────────
export function rebuildIndex() {
  const idx = {};
  for (const f of S.figs) idx[f.id] = f;
  S.figIndex = idx;
}

// Every catalog row gets a resolved image URL (images/{slug}.jpg) and any
// local overrides merged in. A missing image is expected during collecting
// and renders as the salmon keshi placeholder — not a broken state.
// Color list retired 'Orange' (only Neon Orange exists in the line) and
// 'Grape' (a board-game exclusive we don't track). Catalog rows saved before
// that still carry them, so map rather than drop: an Orange tick the user
// made in the editor becomes Neon Orange instead of vanishing.
const RETIRED_COLORS = { 'Orange': 'Neon Orange', 'Grape': null };
function migrateColors(list) {
  if (!Array.isArray(list) || !list.length) return [BASE_COLOR];
  const out = [];
  for (const c of list) {
    const mapped = (c in RETIRED_COLORS) ? RETIRED_COLORS[c] : c;
    if (mapped && !out.includes(mapped)) out.push(mapped);
  }
  return out.length ? out : [BASE_COLOR];
}

function migrateClsKeys(cls) {
  if (!cls || typeof cls !== 'object') return {};
  const out = {};
  for (const [k, v] of Object.entries(cls)) {
    const mapped = (k in RETIRED_COLORS) ? RETIRED_COLORS[k] : k;
    if (mapped) out[mapped] = v;
  }
  return out;
}

function normalizeRows(rows) {
  const merged = applyFigEdits(rows);
  return merged.map(f => ({
    ...f,
    num: f.num != null ? Number(f.num) : Number(f.id),
    colors: migrateColors(f.colors),
    img: f.img && typeof f.img === 'object' ? f.img : {},  // which shots exist + their extension case
    cls: migrateClsKeys(f.cls),   // { color: 'A'|'B'|'C' } per-sculpt class
    image: f.image || (f.slug ? `${IMG}/${f.slug}.jpg` : ''),
  }));
}

// § CATALOG FETCH / CACHE ──────────────────────────────────────────
export async function fetchFigs(force = false) {
  if (S.syncStatus === 'syncing') return;
  S.syncStatus = 'syncing';
  window.render?.();
  try {
    const res = await fetch(FIGS_URL + (force ? `?t=${Date.now()}` : ''), { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const rows = await res.json();
    if (!Array.isArray(rows)) throw new Error('catalog is not an array');
    S.figs = normalizeRows(rows);
    rebuildIndex();
    S.loaded = true;
    S.syncStatus = 'ok';
    S.syncTs = Date.now();
    bigSet(CACHE_KEY, { rows, ts: S.syncTs });
  } catch (e) {
    console.warn('[fetchFigs] failed:', e.message);
    S.syncStatus = 'err';
    // Keep whatever cache/seed already populated the view.
  }
  window.render?.();
}

// Load the cached catalog synchronously (already hydrated into the IDB
// mirror at boot). Returns true if cache populated the view.
export function loadCachedFigs() {
  const cached = bigGet(CACHE_KEY);
  if (cached?.rows?.length) {
    S.figs = normalizeRows(cached.rows);
    rebuildIndex();
    S.syncTs = cached.ts;
    S.loaded = true;
    return true;
  }
  return false;
}

// Bundled seed (figures.json shipped with the app) as a last resort when
// there's no cache and no network yet — so the poster wall always draws.
export async function loadSeedFigs() {
  try {
    const res = await fetch('figures.json', { cache: 'force-cache' });
    if (!res.ok) return false;
    const rows = await res.json();
    if (!Array.isArray(rows) || !rows.length) return false;
    S.figs = normalizeRows(rows);
    rebuildIndex();
    S.loaded = true;
    return true;
  } catch { return false; }
}

// § COLLECTION LOAD / SAVE ─────────────────────────────────────────
export function loadColl() {
  // Prefer a non-empty crash journal (written synchronously on tab-hide;
  // cleared on resume — so a survivor at cold boot is the freshest state).
  let c = bigGet(COLL_KEY);
  try {
    const j = store.get(JOURNAL_KEY);
    if (j && typeof j === 'object' && Object.keys(j).length) { c = j; bigSet(COLL_KEY, c); }
  } catch {}
  store.remove(JOURNAL_KEY);
  S.coll = (c && typeof c === 'object') ? c : {};
  S._collLoaded = true;
}

let _saveTimer = null;
export function saveColl() {
  S._collVersion++;
  // Debounced background persist to IDB; the mirror is updated immediately.
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => bigSet(COLL_KEY, S.coll), 120);
}

// Synchronous flush + journal on tab-hide. bigFlush starts the IDB write;
// the localStorage journal is the guaranteed-synchronous backstop.
export function flushColl() {
  if (!S._collLoaded) return;
  bigFlush(COLL_KEY, S.coll);
  store.set(JOURNAL_KEY, S.coll);
}
export function clearJournalOnResume() { store.remove(JOURNAL_KEY); }

// § COLLECTION MUTATIONS ───────────────────────────────────────────
// An owned entry: { owned, colors:[], want, condition, pack, notes, ts }.
// "Owned" is true when you have at least one color; toggling the last
// color off clears owned but keeps the entry if it still has want/notes.
function ensureEntry(id) {
  if (!S.coll[id]) S.coll[id] = { owned: false, colors: [], want: false, condition: '', pack: '', notes: '' };
  return S.coll[id];
}
function pruneEntry(id) {
  const e = S.coll[id];
  if (!e) return;
  if (!e.owned && !e.want && !e.notes && (!e.colors || !e.colors.length)) delete S.coll[id];
}

export function isOwned(id) { return !!S.coll[id]?.owned; }
export function isWanted(id) { return !!S.coll[id]?.want; }
export function ownedColors(id) { return S.coll[id]?.colors || []; }

// Toggle overall owned. Turning on adds the base color if none set; turning
// off clears colors but preserves a want flag.
export function toggleOwned(id) {
  const e = ensureEntry(id);
  if (e.owned) {
    e.owned = false;
    e.colors = [];
  } else {
    e.owned = true;
    if (!e.colors.length) e.colors = [BASE_COLOR];
    e.want = false; // owning it clears the want
  }
  e.ts = Date.now();
  pruneEntry(id);
  saveColl();
}

// Toggle a specific color you own. Any color present ⇒ owned.
export function toggleColor(id, color) {
  const e = ensureEntry(id);
  const i = e.colors.indexOf(color);
  if (i >= 0) e.colors.splice(i, 1);
  else { e.colors.push(color); e.want = false; }
  e.owned = e.colors.length > 0;
  e.ts = Date.now();
  pruneEntry(id);
  saveColl();
}

export function toggleWant(id) {
  const e = ensureEntry(id);
  e.want = !e.want;
  if (e.want) { e.owned = false; e.colors = []; }
  e.ts = Date.now();
  pruneEntry(id);
  saveColl();
}

export function setField(id, key, val) {
  const e = ensureEntry(id);
  e[key] = val;
  e.ts = Date.now();
  pruneEntry(id);
  saveColl();
}

// § FILTER / SEARCH ────────────────────────────────────────────────
export function visibleFigs() {
  const q = S.search.trim().toLowerCase();
  return S.figs.filter(f => {
    if (S.filterOwn === 'owned' && !isOwned(f.id)) return false;
    if (S.filterOwn === 'missing' && isOwned(f.id)) return false;
    if (S.filterOwn === 'want' && !isWanted(f.id)) return false;
    if (S.filterColor) {
      // color filter matches sculpts that come in that color OR that you
      // own in that color — the union is what a collector wants to see.
      // A recorded class for a color is itself evidence the sculpt exists
      // in it, so it counts as being in the line even if `colors` is stale.
      const inLine = (f.colors || []).includes(S.filterColor) || !!(f.cls || {})[S.filterColor];
      const owned = ownedColors(f.id).includes(S.filterColor);
      if (!inLine && !owned) return false;
    }
    if (S.filterClass) {
      // Class filter: does this sculpt have ANY color of that class?
      // When a color filter is also active, the two combine — that exact
      // sculpt-and-color must carry the class.
      const cls = f.cls || {};
      const ok = S.filterColor ? cls[S.filterColor] === S.filterClass
                               : Object.values(cls).includes(S.filterClass);
      if (!ok) return false;
    }
    if (q) {
      const hay = `${f.num} ${f.name} ${f.aka || ''} ${f.origin}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

// § STATS ──────────────────────────────────────────────────────────
let _statsCache = null, _statsVer = -1;
export function stats() {
  if (_statsCache && _statsVer === S._collVersion) return _statsCache;
  let ownedSculpts = 0, wanted = 0, colorVariants = 0;
  const byColor = Object.fromEntries(COLORS.map(c => [c.key, 0]));
  for (const id in S.coll) {
    const e = S.coll[id];
    if (e.owned) ownedSculpts++;
    if (e.want) wanted++;
    for (const c of (e.colors || [])) {
      colorVariants++;
      if (c in byColor) byColor[c]++;
    }
  }
  const total = S.figs.length || SET_TOTAL;
  const out = {
    ownedSculpts,
    total,
    pct: total ? Math.round((ownedSculpts / total) * 100) : 0,
    wanted,
    colorVariants,
    byColor,
  };
  _statsCache = out; _statsVer = S._collVersion;
  return out;
}

// § IMPORT / EXPORT ────────────────────────────────────────────────
export function exportData() {
  return JSON.stringify({
    app: 'muscle-collector',
    version: 1,
    exported: new Date().toISOString(),
    collection: S.coll,
  }, null, 2);
}

// Returns { ok, count } or { ok:false, error }.
export function importData(text, mode = 'merge') {
  let parsed;
  try { parsed = JSON.parse(text); } catch { return { ok: false, error: 'Not valid JSON' }; }
  const coll = parsed?.collection && typeof parsed.collection === 'object'
    ? parsed.collection
    : (parsed && typeof parsed === 'object' && !parsed.version ? parsed : null);
  if (!coll) return { ok: false, error: 'No collection found in file' };
  if (mode === 'replace') S.coll = clone(coll);
  else S.coll = { ...S.coll, ...clone(coll) };
  saveColl();
  return { ok: true, count: Object.keys(coll).length };
}
