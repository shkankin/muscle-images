// ════════════════════════════════════════════════════════════════════
// M.U.S.C.L.E. Collector — render.js  (v0.1)
// ────────────────────────────────────────────────────────────────────
// State → DOM. A single render() dispatch redraws #app from S. View
// functions return HTML strings; all interactivity is data-action
// attributes resolved by delegate.js (no inline handlers — CSP-safe).
// ════════════════════════════════════════════════════════════════════

import {
  S, ICO, icon, esc, APP_VERSION, THEMES, COLORS, COLOR_HEX,
  PACKS, CONDITIONS, RARITY, SET_TOTAL, BASE_COLOR, imgFor, shotsFor,
  CLASSES, CLASS_ORDER, classOf,
} from './state.js';
import {
  visibleFigs, stats, isOwned, isWanted, ownedColors, exportData,
} from './data.js';

const app = () => document.getElementById('app');

// § TOAST ──────────────────────────────────────────────────────────
let _toastTimer = null;
export function toast(msg, ms = 2200) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast'; el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

// Light haptic where supported (owning a figure should feel like a stamp).
export function haptic(ms = 10) { try { navigator.vibrate?.(ms); } catch {} }

// § DISPATCH ───────────────────────────────────────────────────────
export function render() {
  try {
    document.documentElement.setAttribute('data-theme', S.theme);
    if (!S.loaded) { app().innerHTML = viewLoading(); return; }
    app().innerHTML = (S.screen === 'figure' && S.activeFig)
      ? viewDetail(S.figIndex[S.activeFig])
      : viewMain();
    if (S._justNavigated) { app().scrollTo?.(0, 0); window.scrollTo?.(0, 0); S._justNavigated = false; }
  } catch (e) {
    console.error('render error', e);
    app().innerHTML = `<div class="pad center"><div class="err-glyph">✕</div>
      <div class="err-title">Something went wrong</div>
      <div class="dim sm">${esc(e.message)}</div>
      <button class="btn" data-action="recover">Reload</button></div>`;
  }
  renderSheet();
  if (_afterRender) { try { _afterRender(); } catch (e) { console.error('afterRender', e); } }
}

// handlers.js registers a hook here (history sync) — a callback rather than
// an import so render.js stays free of a circular dependency.
let _afterRender = null;
export function onAfterRender(fn) { _afterRender = fn; }

function viewLoading() {
  return `<div class="boot">
    <div class="boot-mark">M.U.S.C.L.E.</div>
    <div class="boot-sub">筋肉 · loading the set</div>
    <div class="boot-bar"><span></span></div>
  </div>`;
}

// § MAIN ───────────────────────────────────────────────────────────
function viewMain() {
  return topbar() + `<main class="scroll">${tabBody()}</main>` + tabbar();
}

function topbar() {
  return `<header class="topbar">
    <div class="brand">
      <span class="hinomaru"></span>
      <span class="wordmark">M.U.S.C.L.E.</span>
      <span class="kanji" aria-hidden="true">筋肉</span>
    </div>
    <button class="icon-btn" data-action="open-sheet" data-sheet="settings" aria-label="Settings">${icon(ICO.cog)}</button>
  </header>`;
}

function tabbar() {
  const tab = (key, ico, label) => `
    <button class="tab ${S.tab === key ? 'on' : ''}" data-action="nav-tab" data-tab="${key}">
      ${icon(ico, 22)}<span>${label}</span>
    </button>`;
  return `<nav class="tabbar">
    ${tab('set', ICO.grid, 'The Set')}
    ${tab('search', ICO.search, 'Browse')}
    ${tab('collection', ICO.owned, 'Mine')}
    ${tab('stats', ICO.trophy, 'Stats')}
  </nav>`;
}

function tabBody() {
  switch (S.tab) {
    case 'set':        return viewSet();
    case 'search':     return viewSearch();
    case 'collection': return viewCollection();
    case 'stats':      return viewStats();
    default:           return viewSet();
  }
}

// The rarest class recorded for a sculpt across all its colours — used to
// flag Class A/B figures on the wall without opening them.
function topClass(f) {
  const cls = f && f.cls; if (!cls) return null;
  let best = null;
  for (const c of Object.values(cls)) {
    if (!CLASSES[c]) continue;
    if (!best || CLASSES[c].rank > CLASSES[best].rank) best = c;
  }
  return best;
}

// § BELT (the hero completeness meter) ──────────────────────────────
function belt() {
  const st = stats();
  return `<section class="belt">
    <div class="belt-plate">
      <div class="belt-eyebrow">The Set · 筋肉マン</div>
      <div class="belt-count"><span class="have">${st.ownedSculpts}</span><span class="slash">/</span><span class="total">${st.total}</span></div>
      <div class="belt-track"><div class="belt-fill" style="width:${st.pct}%"></div></div>
      <div class="belt-meta">
        <span>${st.pct}% complete</span>
        <span>${st.total - st.ownedSculpts} to find</span>
        ${st.wanted ? `<span>${st.wanted} on want list</span>` : ''}
      </div>
    </div>
  </section>`;
}

// Own-filter + color-swatch facet strip (shared by Set & Browse).
function facets() {
  const own = (val, label) => `<button class="chip ${S.filterOwn === val ? 'on' : ''}" data-action="filter-own" data-val="${val}">${label}</button>`;
  const swatch = c => `<button class="sw ${S.filterColor === c.key ? 'on' : ''}" data-action="filter-color" data-val="${c.key}" title="${c.key}" style="--sw:${c.hex}"><span></span></button>`;
  return `<div class="facets">
    <div class="chips">
      ${own('', 'All')}
      ${own('owned', 'Owned')}
      ${own('missing', 'Missing')}
      ${own('want', 'Want')}
    </div>
    <div class="chips">
      ${CLASS_ORDER.map(k => `<button class="chip chip-cls cls-${k} ${S.filterClass === k ? 'on' : ''}" data-action="filter-class" data-val="${k}" title="${esc(CLASSES[k].label)} — ${esc(CLASSES[k].name)}">${k}</button>`).join('')}
      ${S.filterClass ? `<button class="chip" data-action="filter-class" data-val="">Clear class</button>` : ''}
    </div>
    <div class="swatches" role="group" aria-label="Filter by color">
      <button class="sw sw-any ${!S.filterColor ? 'on' : ''}" data-action="filter-color" data-val="" title="Any color">Any</button>
      ${COLORS.map(swatch).join('')}
    </div>
  </div>`;
}

// § SET (poster wall — the signature) ───────────────────────────────
function viewSet() {
  const figs = visibleFigs();
  const modes = `<div class="viewtog" role="group" aria-label="View mode">
    <button class="vt ${S.setView !== 'poster' ? 'on' : ''}" data-action="set-view" data-view="grid">Grid</button>
    <button class="vt ${S.setView === 'poster' ? 'on' : ''}" data-action="set-view" data-view="poster">Poster</button>
  </div>`;
  if (S.setView === 'poster') return belt() + facets() + modes + posterSheet(figs);
  return belt() + facets() + modes + posterWall(figs, 'The set poster');
}

// ── The collection poster ───────────────────────────────────────────
// A CSS recreation of the mail-away poster: black numbered cells in an
// 11-across grid, each with the outlined star that fills in when you own
// the figure. The original art only covers #1–154 and is a fixed raster,
// so the grid is rebuilt here to cover all 236 and reflow on any screen.
function posterSheet(figs) {
  if (!figs.length) return emptyState('the poster');
  return `<div class="sheet-poster">
    <div class="sp-head">
      <span class="sp-title">M.U.S.C.L.E.</span>
      <span class="sp-tag">Millions of Unusual Small Creatures Lurking Everywhere</span>
      <span class="sp-sub">Fill The Star As You Catch Each One</span>
    </div>
    <div class="sp-grid">${figs.map(posterCell).join('')}</div>
  </div>`;
}

function posterCell(f) {
  const owned = isOwned(f.id);
  const want = isWanted(f.id);
  const thumb = imgFor(f, 'group', true);
  const ptc = topClass(f);
  return `<button class="pcell ${owned ? 'owned' : ''} ${want ? 'want' : ''}" data-action="open-fig" data-id="${esc(f.id)}"
      aria-label="Figure ${f.num}${(f.aka || f.name) ? ' ' + displayName(f) : ''}${owned ? ', owned' : ', not owned'}">
    <span class="pc-num">${f.num}</span>
    <span class="pc-art">${thumb ? `<img src="${thumb}" alt="" loading="lazy" data-imgfallback>` : `<span class="pc-keshi">${keshiSVG()}</span>`}</span>
    ${ptc && ptc !== 'C' ? `<span class="pc-cls cls-${ptc}">${ptc}</span>` : ''}
    <span class="pc-star" aria-hidden="true">${starSVG()}</span>
  </button>`;
}

// The poster's five-point star: outline by default, filled gold when owned.
function starSVG() {
  return `<svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden="true">
    <path d="M12 2.6l2.9 6.05 6.6.88-4.82 4.6 1.22 6.55L12 17.5l-5.9 3.18 1.22-6.55L2.5 9.53l6.6-.88z"
      fill="currentColor" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>
  </svg>`;
}

function posterWall(figs, emptyLabel) {
  if (!figs.length) return emptyState(emptyLabel);
  return `<div class="poster">${figs.map(tile).join('')}</div>`;
}

function tile(f) {
  const owned = isOwned(f.id);
  const want = isWanted(f.id);
  const cls = ['tile', owned ? 'owned' : 'ghost', want ? 'want' : ''].filter(Boolean).join(' ');
  // Primary owned color tints the tile fill so a color-completist can read
  // the wall at a glance.
  const primary = owned ? (ownedColors(f.id)[0] || BASE_COLOR) : BASE_COLOR;
  const tint = COLOR_HEX[primary] || COLOR_HEX[BASE_COLOR];
  // Thumbnail of the group shot when it exists; otherwise the keshi silhouette.
  const thumb = imgFor(f, 'group', true);
  const tc = topClass(f);
  return `<button class="${cls}" data-action="open-fig" data-id="${esc(f.id)}" style="--tint:${tint}" aria-label="Figure ${f.num}${owned ? ', owned' : ', missing'}">
    <span class="tile-fig" aria-hidden="true">${keshiSVG()}</span>
    ${thumb ? `<img class="tile-img" alt="" src="${thumb}" data-imgfallback loading="lazy">` : ''}
    <span class="tile-num">${f.num}</span>
    ${tc && tc !== 'C' ? `<span class="tile-cls cls-${tc}" title="${esc(CLASSES[tc].label)} — ${esc(CLASSES[tc].name)}">${tc}</span>` : ''}
    ${want ? `<span class="tile-flag">${icon(ICO.heart, 11)}</span>` : ''}
  </button>`;
}

// A compact "keshi" figure silhouette — the eraser-figure stance. Used as
// the tile fill and the detail placeholder so missing images look intended.
function keshiSVG() {
  return `<svg viewBox="0 0 40 56" preserveAspectRatio="xMidYMid meet" fill="currentColor">
    <circle cx="20" cy="10" r="7.4"/>
    <path d="M12.6 20h14.8c1.5 0 2.7 1.1 2.9 2.6l1.4 10.2c.2 1.7-1 3-2.6 3-1.3 0-2.4-.9-2.7-2.2l-.9-4.3v20.9c0 1.6-1.3 2.8-2.9 2.8s-2.8-1.2-2.8-2.8v-9.7h-1.6v9.7c0 1.6-1.2 2.8-2.8 2.8s-2.9-1.2-2.9-2.8V29.1l-.9 4.3c-.3 1.3-1.4 2.2-2.7 2.2-1.6 0-2.8-1.3-2.6-3l1.4-10.2c.2-1.5 1.4-2.6 2.9-2.6z"/>
  </svg>`;
}

// § BROWSE (search + filtered list) ─────────────────────────────────
function viewSearch() {
  const figs = visibleFigs();
  return `<div class="searchbar">
      <span class="search-ico">${icon(ICO.search, 18)}</span>
      <input class="search-input" type="search" inputmode="search" placeholder="Search # or name…"
             value="${esc(S.search)}" data-action="search-input" aria-label="Search figures">
      ${S.search ? `<button class="search-clear" data-action="search-clear" aria-label="Clear">${icon(ICO.x, 16)}</button>` : ''}
    </div>
    ${facets()}
    <div class="result-count">${figs.length} figure${figs.length === 1 ? '' : 's'}</div>
    ${figs.length ? `<div class="rows">${figs.map(row).join('')}</div>` : emptyState('No matches')}`;
}

function row(f) {
  const owned = isOwned(f.id);
  const cols = ownedColors(f.id);
  const dots = cols.length
    ? `<span class="row-dots">${cols.map(c => `<i style="background:${COLOR_HEX[c] || '#888'}"></i>`).join('')}</span>`
    : '';
  return `<div class="row" data-action="open-fig" data-id="${esc(f.id)}">
    <span class="row-num">${f.num}</span>
    <span class="row-fig ${owned ? 'owned' : 'ghost'}" aria-hidden="true">${keshiSVG()}</span>
    <span class="row-main">
      <span class="row-name">${(f.aka || f.name) ? displayName(f) : `<span class="dim">Figure ${f.num}</span>`}</span>
      ${f.origin ? `<span class="row-origin">${esc(f.origin)}</span>` : ''}
      ${dots}
    </span>
    <button class="row-star ${owned ? 'on' : ''}" data-action="quick-own" data-id="${esc(f.id)}" aria-label="${owned ? 'Owned' : 'Mark owned'}">${icon(ICO.owned, 20)}</button>
  </div>`;
}

// § COLLECTION ─────────────────────────────────────────────────────
function viewCollection() {
  const owned = S.figs.filter(f => isOwned(f.id));
  const want = S.figs.filter(f => isWanted(f.id));
  const st = stats();
  let out = `<section class="mine-head">
      <div class="mine-stat"><b>${st.ownedSculpts}</b><span>owned</span></div>
      <div class="mine-stat"><b>${st.colorVariants}</b><span>color variants</span></div>
      <div class="mine-stat"><b>${st.wanted}</b><span>wanted</span></div>
    </section>`;
  if (!owned.length && !want.length) {
    return out + emptyState('Nothing tracked yet — tap a figure in The Set to mark it owned.');
  }
  if (owned.length) {
    out += `<h2 class="sec-h">Owned <span>${owned.length}</span></h2>`;
    out += `<div class="poster">${owned.map(tile).join('')}</div>`;
  }
  if (want.length) {
    out += `<h2 class="sec-h">Want list <span>${want.length}</span></h2>`;
    out += `<div class="rows">${want.map(row).join('')}</div>`;
  }
  return out;
}

// § STATS ──────────────────────────────────────────────────────────
// How many of the classed colours you actually own, per class. Only counts
// sculpt+colour combinations that have a class recorded.
function classStats() {
  const tally = { A: [0, 0], B: [0, 0], C: [0, 0] };   // [owned, total]
  for (const f of S.figs) {
    const cls = f.cls || {};
    const mine = ownedColors(f.id);
    for (const [color, k] of Object.entries(cls)) {
      if (!tally[k]) continue;
      tally[k][1]++;
      if (mine.includes(color)) tally[k][0]++;
    }
  }
  const any = CLASS_ORDER.some(k => tally[k][1] > 0);
  if (!any) return `<div class="stat-note dim sm">No classes recorded yet. Class is set per sculpt and colour in the figure editor.</div>`;
  return `<div class="cls-legend">${CLASS_ORDER.map(k => {
    const [own, tot] = tally[k];
    const c = CLASSES[k];
    return `<div class="cls-key cls-${k}"><b>${k}</b>${c.name} — ${own}/${tot}</div>`;
  }).join('')}</div>`;
}

function viewStats() {
  const st = stats();
  const maxColor = Math.max(1, ...Object.values(st.byColor));
  const bars = COLORS.map(c => {
    const v = st.byColor[c.key] || 0;
    const w = Math.round((v / maxColor) * 100);
    return `<div class="cbar">
      <span class="cbar-label"><i style="background:${c.hex}"></i>${c.key}</span>
      <span class="cbar-track"><span class="cbar-fill" style="width:${w}%;background:${c.hex}"></span></span>
      <span class="cbar-val">${v}</span>
    </div>`;
  }).join('');
  return belt() + `
    <section class="stat-grid">
      <div class="stat-card"><b>${st.ownedSculpts}</b><span>of ${st.total} sculpts</span></div>
      <div class="stat-card"><b>${st.pct}%</b><span>set complete</span></div>
      <div class="stat-card"><b>${st.colorVariants}</b><span>color variants held</span></div>
      <div class="stat-card"><b>${st.wanted}</b><span>on want list</span></div>
    </section>
    <h2 class="sec-h">Class</h2>
    ${classStats()}
    <h2 class="sec-h">Variants by color</h2>
    <div class="cbars">${bars}</div>
    <div class="stat-note dim sm">A “sculpt” is one of the ${SET_TOTAL} numbered figures. Each color you own of a sculpt counts as a separate variant.</div>`;
}

// § EMPTY STATE ────────────────────────────────────────────────────
function emptyState(msg) {
  return `<div class="empty">
    <span class="empty-fig">${keshiSVG()}</span>
    <p>${esc(msg)}</p>
  </div>`;
}

// Verifiable catalog facts shown as chips on the detail screen. Kept off
// the browsing tiles to avoid clutter; this is the "scarce info" payoff.
// The US release name is what collectors use, so it leads. The Kinnikuman
// name is shown underneath, and only becomes the headline when there is no
// US name recorded.
export function displayName(f) {
  if (!f) return '';
  const n = f.aka || f.name;
  return n ? esc(n) : `Figure ${f.num}`;
}

function detailBadges(f) {
  const b = [];
  const r = RARITY[f.rarity];
  if (r && f.rarity !== 'common') b.push(`<span class="badge rare-badge" style="--bc:${r.hex}">${icon(ICO.trophy, 12)}${r.label}</span>`);
  if (f.poster === false) b.push(`<span class="badge">Not on the poster</span>`);
  return b.length ? `<div class="detail-badges">${b.join('')}</div>` : '';
}

// § FIGURE DETAIL ──────────────────────────────────────────────────
function viewDetail(f) {
  if (!f) { S.screen = 'main'; return viewMain(); }
  const owned = isOwned(f.id);
  const want = isWanted(f.id);
  const cols = ownedColors(f.id);
  const e = S.coll[f.id] || {};
  const idx = S.figs.findIndex(x => x.id === f.id);
  const prev = S.figs[idx - 1], next = S.figs[idx + 1];

  // Color belt: ONLY the colours this sculpt is documented to come in (set
  // per figure in the editor), plus any colour already owned or classed —
  // so ownership recorded earlier never becomes unreachable if the catalog
  // changes later. Undocumented colours are hidden rather than greyed out.
  const inLine = new Set(f.colors || [BASE_COLOR]);
  const beltColors = COLORS.filter(c =>
    inLine.has(c.key) || cols.includes(c.key) || !!classOf(f, c.key));
  const colorBelt = beltColors.map(c => {
    const have = cols.includes(c.key);
    const known = inLine.has(c.key);
    // Class (A/B/C) for THIS sculpt in THIS colour, when recorded.
    const k = classOf(f, c.key);
    const cl = k ? CLASSES[k] : null;
    const clTitle = cl ? ` — ${cl.label} (${cl.name}): ${cl.blurb}` : '';
    return `<button class="vchip ${have ? 'have' : ''} ${known ? 'known' : ''} ${k ? 'cls-' + k : ''}" data-action="toggle-color" data-id="${esc(f.id)}" data-color="${esc(c.key)}" style="--sw:${c.hex}${cl ? `;--cls:${cl.hex}` : ''}" title="${esc(c.key)}${known ? '' : ' (not documented for this sculpt)'}${esc(clTitle)}">
      <span class="vsw"></span><span class="vname">${c.key}</span>
      ${cl ? `<span class="vcls" aria-label="${esc(cl.label)} — ${esc(cl.name)}">${k}</span>` : ''}
      ${have ? `<span class="vtick">${icon(ICO.check, 13)}</span>` : ''}
    </button>`;
  }).join('') || `<div class="dim sm belt-empty">No colours documented for this sculpt yet.</div>`;

  // Colours NOT documented for this sculpt and not owned. Hidden behind a
  // toggle so the belt stays clean, but still reachable — the catalog is
  // mostly unfilled, so you can always record what you actually own.
  const otherColors = COLORS.filter(c => !beltColors.includes(c));
  const otherBelt = otherColors.length ? `
    <button class="belt-more" data-action="toggle-other-colors" aria-expanded="${S.showOtherColors ? 'true' : 'false'}">
      ${S.showOtherColors ? '− Hide other colours' : '+ Other colour'}
    </button>
    ${S.showOtherColors ? `<div class="vbelt vbelt-other">
      <div class="dim sm belt-note">Not documented for this sculpt. Marking one records what you own; tell the editor to add it to the catalog.</div>
      ${otherColors.map(c => `<button class="vchip undoc" data-action="toggle-color" data-id="${esc(f.id)}" data-color="${esc(c.key)}" style="--sw:${c.hex}" title="${esc(c.key)} (not documented for this sculpt)">
        <span class="vsw"></span><span class="vname">${c.key}</span>
      </button>`).join('')}
    </div>` : ''}` : '';

  // Available shots for this figure (group / front / back / per-colour).
  const shots = shotsFor(f);
  const SHOT_LABEL = { group: 'All colours', f: 'Front', fb: 'Back', db: 'Dark Blue',
    lb: 'Light Blue', r: 'Red', g: 'Green', o: 'Neon Orange', s: 'Salmon', p: 'Purple', m: 'Magenta' };
  const SHOT_COLOR = { db: 'Dark Blue', lb: 'Light Blue', r: 'Red', g: 'Green',
    o: 'Neon Orange', s: 'Salmon', p: 'Purple', m: 'Magenta', f: 'Flesh', fb: 'Flesh' };
  const activeShot = shots.includes(S.detailShot) ? S.detailShot : (shots[0] || null);
  // Use the 't' file as the hero source: right now that is the only size
  // uploaded (the full-size files 404). data-imgupgrade swaps in the
  // full-size version if and when one exists, so the hero sharpens
  // automatically as the archive fills out — no code change needed.
  const heroKind = activeShot === 'group' ? 'group'
    : activeShot === 'fb' ? 'back'
    : activeShot ? SHOT_COLOR[activeShot] : null;
  const heroSrc = heroKind ? imgFor(f, heroKind, true) : '';
  const heroFull = heroKind ? imgFor(f, heroKind, false) : '';
  const filmstrip = shots.length > 1 ? `<div class="filmstrip">
      ${shots.map(k => `<button class="film-sw ${k === activeShot ? 'on' : ''}" data-action="view-shot" data-id="${esc(f.id)}" data-shot="${esc(k)}" style="--sw:${k === 'group' ? 'linear-gradient(135deg,#E5A594,#C6413A,#31508C)' : (COLOR_HEX[SHOT_COLOR[k]] || '#888')}" aria-label="Show ${esc(SHOT_LABEL[k] || k)}"><span></span></button>`).join('')}
      <span class="film-label">${esc(SHOT_LABEL[activeShot] || '')}</span>
    </div>` : '';

  return `<div class="detail">
    <header class="detail-bar">
      <button class="icon-btn" data-action="back-main" aria-label="Back">${icon(ICO.back)}</button>
      <span class="detail-num">No. ${f.num}</span>
      <button class="icon-btn" data-action="open-sheet" data-sheet="edit" aria-label="Edit">${icon(ICO.edit)}</button>
    </header>

    <div class="hero ${owned ? 'owned' : ''} ${heroSrc ? 'has-photo' : ''}">
      <span class="hero-num" aria-hidden="true">${f.num}</span>
      <div class="hero-fig">
        <span class="hero-keshi" style="--tint:${COLOR_HEX[cols[0] || BASE_COLOR]}">${keshiSVG()}</span>
        ${heroSrc ? `<img class="hero-img" alt="${displayName(f)} — ${esc(SHOT_LABEL[activeShot] || '')}" src="${heroSrc}" data-imgfallback data-imgupgrade="${esc(heroFull)}">` : ''}
      </div>
    </div>
    ${filmstrip}

    <div class="detail-body">
      <h1 class="detail-name">${displayName(f)}</h1>
      ${f.aka && f.name ? `<p class="detail-jp">${esc(f.name)}</p>` : ''}
      <p class="detail-origin">${f.origin ? esc(f.origin) : `<span class="dim">Kinnikuman identity not recorded — tap edit to add it.</span>`}</p>
      ${detailBadges(f)}

      <div class="own-actions">
        <button class="btn ${owned ? 'btn-owned' : 'btn-primary'}" data-action="toggle-owned" data-id="${esc(f.id)}">
          ${icon(ICO.owned, 18)}${owned ? 'Owned' : 'Mark owned'}
        </button>
        <button class="btn btn-ghost ${want ? 'on' : ''}" data-action="toggle-want" data-id="${esc(f.id)}">
          ${icon(ICO.heart, 18)}${want ? 'On want list' : 'Want'}
        </button>
      </div>

      <h2 class="detail-h">Colors ${cols.length ? `<span>${cols.length} owned</span>` : ''}</h2>
      <div class="vbelt">${colorBelt}</div>
      ${otherBelt}

      ${(e.condition || e.pack || e.notes) ? `<div class="detail-meta">
        ${e.condition ? `<div><span>Condition</span>${esc(e.condition)}</div>` : ''}
        ${e.pack ? `<div><span>Came in</span>${esc(e.pack)}</div>` : ''}
        ${e.notes ? `<div class="notes"><span>Notes</span>${esc(e.notes)}</div>` : ''}
      </div>` : ''}
    </div>

    <nav class="detail-nav">
      <button class="btn btn-ghost" ${prev ? `data-action="open-fig" data-id="${esc(prev.id)}"` : 'disabled'}>← ${prev ? prev.num : ''}</button>
      <button class="btn btn-ghost" ${next ? `data-action="open-fig" data-id="${esc(next.id)}"` : 'disabled'}>${next ? next.num : ''} →</button>
    </nav>
  </div>`;
}

// § SHEETS ─────────────────────────────────────────────────────────
function renderSheet() {
  let host = document.getElementById('sheet-host');
  if (!host) {
    host = document.createElement('div');
    host.id = 'sheet-host';
    document.body.appendChild(host);
  }
  if (!S.sheet) { host.innerHTML = ''; return; }
  host.innerHTML = `<div class="scrim" data-action="close-sheet"></div>
    <div class="sheet" role="dialog" aria-modal="true">${sheetBody(S.sheet)}</div>`;
}

function sheetBody(id) {
  if (id === 'settings') return sheetSettings();
  if (id === 'edit') return sheetEdit();
  if (id === 'data') return sheetData();
  return '';
}

function sheetHead(title) {
  return `<div class="sheet-head"><h3>${esc(title)}</h3>
    <button class="icon-btn" data-action="close-sheet" aria-label="Close">${icon(ICO.x)}</button></div>`;
}

function sheetSettings() {
  const themeBtn = (key, t) => `<button class="theme-opt ${S.theme === key ? 'on' : ''}" data-action="set-theme" data-theme="${key}" style="--tbg:${t.bg};--tacc:${t.acc};--tgold:${t.gold};--tflesh:${t.flesh}">
      <span class="theme-swatches"><i style="background:${t.flesh}"></i><i style="background:${t.acc}"></i><i style="background:${t.gold}"></i></span>
      <span class="theme-name">${t.name}</span>
    </button>`;
  return sheetHead('Settings') + `<div class="sheet-scroll">
    <div class="field-label">Theme</div>
    <div class="theme-row">${Object.entries(THEMES).map(([k, t]) => themeBtn(k, t)).join('')}</div>

    <div class="field-label">Data</div>
    <button class="list-btn" data-action="open-sheet" data-sheet="data">${icon(ICO.export, 18)} Back up or restore collection</button>
    <button class="list-btn" data-action="sync-now">${icon(ICO.grid, 18)} Refresh catalog from repo</button>

    <div class="about">
      <div class="about-mark">M.U.S.C.L.E. <span class="kanji">筋肉</span></div>
      <p class="dim sm">A collection tracker for the 236 M.U.S.C.L.E. figures — the US release of Kinnikuman’s Kinkeshi. Catalog and images live in the project repo; the poster fills in as figures are documented.</p>
      <p class="dim sm">Version ${APP_VERSION} · fan project, non-commercial.</p>
      ${S.syncTs ? `<p class="dim sm">Catalog synced ${new Date(S.syncTs).toLocaleString()}.</p>` : ''}
    </div>
  </div>`;
}

function sheetEdit() {
  const f = S.figIndex[S.activeFig];
  if (!f) return sheetHead('Edit') + '<div class="sheet-scroll dim">No figure selected.</div>';
  const e = S.coll[f.id] || {};
  const inLine = new Set(f.colors || [BASE_COLOR]);
  const knownColors = COLORS.map(c => `<label class="check ${inLine.has(c.key) ? 'on' : ''}">
      <input type="checkbox" data-action="edit-inline-color" data-color="${esc(c.key)}" ${inLine.has(c.key) ? 'checked' : ''}>
      <i style="background:${c.hex}"></i>${c.key}</label>`).join('');
  const opt = (v, cur) => `<option value="${esc(v)}" ${cur === v ? 'selected' : ''}>${esc(v)}</option>`;
  return sheetHead(`Edit No. ${f.num}`) + `<div class="sheet-scroll">
    <label class="field"><span>Name</span>
      <input type="text" value="${esc(f.name)}" placeholder="Collector / common name" data-action="edit-name"></label>
    <label class="field"><span>Kinnikuman identity</span>
      <input type="text" value="${esc(f.origin)}" placeholder="e.g. character name, if known" data-action="edit-origin"></label>

    <div class="field-label">Colors this sculpt exists in</div>
    <div class="check-grid">${knownColors}</div>

    <label class="field"><span>Condition (your copy)</span>
      <select data-action="edit-condition"><option value="">—</option>${CONDITIONS.map(c => opt(c, e.condition)).join('')}</select></label>
    <label class="field"><span>Came in</span>
      <select data-action="edit-pack"><option value="">—</option>${PACKS.map(p => opt(p, e.pack)).join('')}</select></label>
    <label class="field"><span>Notes</span>
      <textarea rows="3" placeholder="Anything worth remembering…" data-action="edit-notes">${esc(e.notes || '')}</textarea></label>

    <p class="dim sm">Name, identity and colors are catalog facts saved locally for now. Confirmed details can later be committed to the shared catalog.</p>
  </div>`;
}

function sheetData() {
  return sheetHead('Back up & restore') + `<div class="sheet-scroll">
    <p class="dim sm">Your collection lives on this device. Back it up to a file you can keep or move to another device.</p>
    <button class="btn btn-primary full" data-action="download-backup">${icon(ICO.export, 18)} Download backup (.json)</button>
    <div class="field-label">Restore from a backup</div>
    <button class="btn btn-ghost full" data-action="pick-import">${icon(ICO.import, 18)} Choose backup file…</button>
    <label class="check" style="margin-top:10px">
      <input type="checkbox" data-action="import-replace"> Replace instead of merge
    </label>
    <textarea id="export-box" class="export-box" readonly>${esc(exportData())}</textarea>
    <p class="dim sm">The box above is your current data — copy it anywhere as a manual backup.</p>
  </div>`;
}
