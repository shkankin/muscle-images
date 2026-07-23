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

  // Figure images: some files in the repo use an uppercase .JPG, so retry
  // once with that extension before giving up. If it still 404s, hide the
  // <img> so the keshi placeholder shows through — a missing image is
  // expected while the archive is being filled in, not an error.
  // If a full-size version of a hero image exists, quietly swap it in once
  // it has loaded. Until then the 't' file (the only size uploaded today)
  // is what shows, so the detail screen is never blank.
  document.addEventListener('load', e => {
    const t = e.target;
    if (!t || t.tagName !== 'IMG') return;
    const full = t.getAttribute('data-imgupgrade');
    if (!full || t.dataset.upgraded) return;
    t.dataset.upgraded = '1';
    const probe = new Image();
    probe.onload = () => { if (probe.naturalWidth > t.naturalWidth) t.src = full; };
    probe.src = full;
  }, true);

  document.addEventListener('error', e => {
    const t = e.target;
    if (!t || t.tagName !== 'IMG' || !t.hasAttribute('data-imgfallback')) return;
    // 1. Same name with an uppercase .JPG (a few files in the repo use it).
    if (!t.dataset.retried && /\.jpg(\?|$)/.test(t.src)) {
      t.dataset.retried = '1';
      t.src = t.src.replace(/\.jpg(\?|$)/, '.JPG$1');
      return;
    }
    // 2. Walk the alternate-shot chain. data-imgalt is a '|'-separated list,
    //    tried in order: poster cells ask for the full-size cutout first,
    //    then the 't' thumbnail, then the group shot. Each step also gets
    //    the uppercase-.JPG retry above.
    const alt = t.getAttribute('data-imgalt');
    if (alt) {
      const chain = alt.split('|').filter(Boolean);
      const i = Number(t.dataset.altIndex || 0);
      if (i < chain.length) {
        t.dataset.altIndex = String(i + 1);
        t.dataset.retried = '';
        t.src = chain[i];
        return;
      }
    }
    // 3. Nothing available — hide so the keshi silhouette shows through.
    t.style.display = 'none';
  }, true);
}
