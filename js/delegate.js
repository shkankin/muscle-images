// ════════════════════════════════════════════════════════════════════
// M.U.S.C.L.E. Collector — delegate.js  (v0.1)
// ────────────────────────────────────────────────────────────────────
// One document-level dispatcher for click / input / change events, keyed
// on data-action. Replaces inline on* handlers so the app can ship a
// strict CSP (script-src 'self'). handlers.js registers the actions.
// ════════════════════════════════════════════════════════════════════

const CLICK = new Map();
const INPUT = new Map();
const CHANGE = new Map();

export function onClick(name, fn) { CLICK.set(name, fn); }
export function onInput(name, fn) { INPUT.set(name, fn); }
export function onChange(name, fn) { CHANGE.set(name, fn); }

function dispatch(map, e) {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const fn = map.get(el.dataset.action);
  if (!fn) return;
  fn(el, e);
}

export function bootDelegation() {
  document.addEventListener('click', e => dispatch(CLICK, e));
  document.addEventListener('input', e => dispatch(INPUT, e));
  document.addEventListener('change', e => dispatch(CHANGE, e));

  // Hide figure images that 404 so the salmon keshi placeholder shows
  // through — a missing image is expected while the set is being collected.
  document.addEventListener('error', e => {
    const t = e.target;
    if (t && t.tagName === 'IMG' && t.hasAttribute('data-imgfallback')) t.style.display = 'none';
  }, true);
}
