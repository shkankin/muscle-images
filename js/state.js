// ════════════════════════════════════════════════════════════════════
// M.U.S.C.L.E. Collector — state.js  (v0.1)
// ────────────────────────────────────────────────────────────────────
// Leaf module. Imports nothing; imported by everything. Holds the app
// constants, the M.U.S.C.L.E. taxonomy (colors / packs / conditions),
// the CSS-variable-driven theme table, the localStorage `store` wrapper,
// and the shared `S` state object.
//
// Architecture mirrors the sibling MOTU Collector app so this can grow
// the same way: state.js (leaf) → data.js → render.js, with a document-
// level data-action delegate for all events (CSP-safe, no inline JS).
// ════════════════════════════════════════════════════════════════════

export const APP_VERSION = '1.3';

// § REPO / NETWORK ─────────────────────────────────────────────────
// The catalog (figures.json) and figure images live in the same GitHub
// Pages repo that serves this app, but we fetch them from raw.github so
// fresh commits land without waiting on the Pages CDN (the SW caches the
// app shell separately). Image convention: images/{slug}.jpg.
export const REPO = 'shkankin/muscle-images';
export const ROOT = `https://raw.githubusercontent.com/${REPO}/main`;
export const IMG = `${ROOT}/images`;
// The catalog lives in the repo (maintained via figures-editor.html) and is
// fetched from raw so editor edits appear without redeploying the app; the
// service worker serves raw stale-while-revalidate. The bundled figures.json
// (loadSeedFigs) is the offline / first-run seed fallback.
export const FIGS_URL = `${ROOT}/figures.json`;

// ── Image naming ────────────────────────────────────────────────────
// Files in the images repo follow:  MUSCLEFigure###<suffix>.jpg
//   ''   group shot — the figure in all its color variants
//   'f'  front, flesh          'fb' back, flesh
//   'db' dark blue   'lb' light blue   'r' red    'g' green
//   'o'  orange      's'  salmon       'p' purple 'm' magenta
// Every one also has a thumbnail: the same name with 't' appended
//   (MUSCLEFigure001t.jpg, MUSCLEFigure001ft.jpg).
// A few files use an uppercase .JPG. Rather than depend on catalog
// metadata (which goes stale the moment a new image is uploaded), the app
// is OPTIMISTIC: it always builds the .jpg URL, and delegate.js retries
// once with .JPG on error before falling back to the keshi silhouette.
// That means any image dropped in the repo shows up with no catalog edit.
export const IMG_SUFFIX = {
  'Dark Blue': 'db', 'Light Blue': 'lb', 'Red': 'r', 'Green': 'g',
  'Neon Orange': 'o', 'Salmon': 's', 'Purple': 'p', 'Magenta': 'm',
  'Flesh': 'f',
};
// Build a URL. kind: 'group' | a color name | 'back'. thumb → the 't' variant.
// Always returns a URL (we don't know ahead of time what's uploaded); the
// <img> hides itself if the file 404s, revealing the keshi behind it.
export function imgFor(fig, kind = 'group', thumb = false) {
  if (!fig) return '';
  const suffix = kind === 'group' ? '' : kind === 'back' ? 'fb' : (IMG_SUFFIX[kind] || '');
  if (kind !== 'group' && kind !== 'back' && !suffix) return '';
  return `${IMG}/MUSCLEFigure${fig.id}${suffix}${thumb ? 't' : ''}.jpg`;
}
// Shots to offer on the detail view. `img` in the catalog is used when
// present (it lists what's known to exist), but we always offer the group
// and flesh-front shots so newly uploaded files appear without a catalog
// update — each one hides itself if it isn't there yet.
// Reverse of IMG_SUFFIX: which color a shot suffix represents.
export const SHOT_TO_COLOR = {
  db: 'Dark Blue', lb: 'Light Blue', r: 'Red', g: 'Green',
  o: 'Neon Orange', s: 'Salmon', p: 'Purple', m: 'Magenta',
};

export const shotsFor = fig => {
  const img = (fig && fig.img) || {};
  const order = ['group', 'f', 'fb', 'db', 'lb', 'r', 'g', 'o', 's', 'p', 'm'];
  // Shots we KNOW exist (recorded in the catalog) always show.
  const known = order.filter(k => img[k]);
  if (known.length) return known;
  // Nothing recorded yet: offer the group + flesh shots, plus a slot only
  // for colors this sculpt is actually documented in. Never offer a color
  // the figure was not made in — that was showing e.g. Green on a sculpt
  // that only came in 7 other colors.
  const made = new Set(fig && fig.colors ? fig.colors : []);
  const colorShots = order.filter(k => {
    const color = SHOT_TO_COLOR[k];
    return color ? made.has(color) : false;
  });
  return ['group', 'f', 'fb', ...colorShots];
};


export const CACHE_KEY = 'muscle-figs-cache';
export const COLL_KEY = 'muscle-coll';
export const CACHE_TTL = 24 * 60 * 60 * 1000; // 24h

// § DOMAIN TAXONOMY ────────────────────────────────────────────────
// The full set is 236 sculpts, numbered #1–#236 (the poster numbers).
export const SET_TOTAL = 236;
export const BASE_COLOR = 'Flesh';

// Colors commonly cited for the US Mattel line (1985–88). "Flesh" is the
// original salmon; the rest are the "class color" runs. Editable — this is
// the seed offer, not a closed list. Hex values are approximations for the
// swatch chips, tuned to read on both themes.
export const COLORS = [
  { key: 'Flesh',       hex: '#E5A594' },
  { key: 'Dark Blue',   hex: '#31508C' },
  { key: 'Red',         hex: '#C6413A' },
  { key: 'Purple',      hex: '#7C5AA6' },
  { key: 'Magenta',     hex: '#B54A83' },
  { key: 'Light Blue',  hex: '#6FA9C9' },
  { key: 'Green',       hex: '#5E9E62' },
  { key: 'Neon Orange', hex: '#F2571E' },
  { key: 'Salmon',      hex: '#DD8A78' },
];
export const COLOR_HEX = Object.fromEntries(COLORS.map(c => [c.key, c.hex]));

// How a copy entered the collection (per-owned attribute, not per-sculpt).
// 4-pack, 10-pack, and the 28-figure "Collector's Can" were the retail packs.
export const PACKS = ['4-Pack', '10-Pack', '28-Can', 'Ring Playset', 'Loose / Bulk', 'Other'];
export const CONDITIONS = ['Loose', 'Sealed', 'Damaged'];

// Rarity tiers. Most of the 236 are common; the app surfaces the documented
// exceptions (e.g. the rare Purple #153 "Claw", Satan Cross) rather than
// guessing — the catalog carries a per-figure `rarity` field.
// ── Color class (per sculpt, per color) ───────────────────────────
// Distinct from a figure's overall `rarity`: the SAME sculpt can be Class C
// in one color and Class A in another, because it describes how many of
// that specific sculpt-and-color combination were produced.
//   C — the most frequently produced color for that sculpt. A random lot
//       find is almost certainly Class C.
//   B — produced in noticeably lower numbers; harder to find, higher price.
//   A — the absolute rarest color for that sculpt; extremely limited, and
//       sells for significantly more than the same sculpt in a Class C color.
export const CLASSES = {
  C: { key: 'C', label: 'Class C', name: 'Common',   hex: '#8A9BA8', rank: 0,
       blurb: 'Most frequently produced color for this sculpt.' },
  B: { key: 'B', label: 'Class B', name: 'Uncommon', hex: '#6FA9C9', rank: 1,
       blurb: 'Produced in noticeably lower numbers — harder to find.' },
  A: { key: 'A', label: 'Class A', name: 'Rare',     hex: '#E3A93C', rank: 2,
       blurb: 'The rarest color for this sculpt — extremely limited.' },
};
export const CLASS_ORDER = ['A', 'B', 'C'];
// A figure's class map lives in figures.json as { "Purple": "A", ... }.
// Unclassified colors return null rather than a guess.
export const classOf = (fig, color) => {
  const c = fig && fig.cls && fig.cls[color];
  return CLASSES[c] ? c : null;
};

export const RARITY = {
  common:   { label: 'Common',   hex: '#8A7869', rank: 0 },
  uncommon: { label: 'Uncommon', hex: '#6FA9C9', rank: 1 },
  rare:     { label: 'Rare',     hex: '#E3A93C', rank: 2 },
  grail:    { label: 'Grail',    hex: '#D62828', rank: 3 },
};

// § THEMES ─────────────────────────────────────────────────────────
// Keys are stable (saved values never migrate). Each entry mirrors the
// CSS custom properties in css/app.css so the theme picker can preview
// swatches and the browser chrome <meta theme-color> stays accurate.
//   arena  — sumi ink + hinomaru red + belt gold + keshi salmon (default)
//   poster — washi paper + ink + salmon (light)
export const THEMES = {
  arena:  { name: 'Arena',   bg: '#14100D', acc: '#D62828', gold: '#E3A93C', flesh: '#E5A594', fg: '#F7EEE6', fg2: '#C6B3A6' },
  poster: { name: 'Poster',  bg: '#F1E9DA', acc: '#C0281F', gold: '#B8862B', flesh: '#E0997F', fg: '#241A12', fg2: '#52422F' },
};

// § ICONS ──────────────────────────────────────────────────────────
export const ICO = {
  grid:   'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
  search: 'M11 3a8 8 0 100 16 8 8 0 000-16zM21 21l-4.35-4.35',
  owned:  'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14l-5-4.87 6.91-1.01L12 2z',
  check:  'M20 6L9 17l-5-5',
  plus:   'M12 5v14M5 12h14',
  x:      'M18 6L6 18M6 6l12 12',
  back:   'M19 12H5M12 19l-7-7 7-7',
  edit:   'M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4 9.5-9.5z',
  heart:  'M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z',
  cog:    'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z',
  export: 'M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3',
  import: 'M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12',
  trophy: 'M6 9a6 6 0 0012 0V3H6zM6 5H3v2a3 3 0 003 3M18 5h3v2a3 3 0 01-3 3M9 21h6M12 15v6',
};
export function icon(d, size = 20, sw = 2) {
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`;
}

// § HELPERS ────────────────────────────────────────────────────────
export const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export const clone = (typeof structuredClone === 'function')
  ? (v => structuredClone(v))
  : (v => JSON.parse(JSON.stringify(v)));

// § STORAGE ────────────────────────────────────────────────────────
// localStorage wrapper. Surfaces a persistent "storage broken" signal
// (Safari private mode returns 0 quota and rejects writes) so the UI can
// warn instead of silently dropping the collection. Adapted from MOTU.
let _storageBroken = false;
const _listeners = new Set();
function _notify() { for (const fn of _listeners) { try { fn(_storageBroken); } catch {} } }

export const store = {
  get: k => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch { return null; } },
  set: (k, v) => {
    try {
      localStorage.setItem(k, JSON.stringify(v));
      if (_storageBroken) { _storageBroken = false; _notify(); }
      return true;
    } catch {
      if (!_storageBroken) { _storageBroken = true; _notify(); }
      return false;
    }
  },
  remove: k => { try { localStorage.removeItem(k); } catch {} },
  isBroken: () => _storageBroken,
  onChange: fn => { _listeners.add(fn); return () => _listeners.delete(fn); },
};

// § STATE ──────────────────────────────────────────────────────────
export const S = {
  figs: [],            // catalog rows (from figures.json)
  figIndex: {},        // id -> fig, built by data.rebuildIndex
  coll: {},            // id -> owned entry ({owned, colors[], want, condition, pack, notes, ts})
  loaded: false,
  syncStatus: 'idle',  // idle | syncing | ok | err
  syncTs: null,

  tab: 'set',          // set | search | collection | stats
  setView: (v => v === 'poster' ? 'poster' : 'grid')(store.get('muscle-setview')),  // grid | poster
  screen: 'main',      // main | figure
  activeFig: null,     // id when screen === 'figure'
  detailTab: 'own',        // detail: 'own' | 'want' — which variant list is showing
  showOtherColors: false,  // detail: reveal colors not documented for the sculpt
  detailShot: null,    // which shot the detail hero shows ('group','f','fb','r',… ; null = first)

  search: '',
  filterColor: '',
  filterClass: '',     // '' | 'A' | 'B' | 'C' — color-class filter
  filterOwn: '',       // '' = all | 'owned' | 'missing' | 'want'

  theme: (t => THEMES[t] ? t : 'arena')(store.get('muscle-theme')),
  sheet: null,         // open bottom-sheet id
  toast: null,

  _collVersion: 0,     // bumped on every save; invalidates derived caches
  _justNavigated: false,
};

export const DEFAULT_TITLE = 'M.U.S.C.L.E.';
