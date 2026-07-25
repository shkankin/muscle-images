# Test suites

Playwright + a tiny static server. Each file spins up its own server on its own
port, stubs `raw.githubusercontent.com`, and asserts against the real
`figures.json` in the repo root.

    npm i playwright        # once
    node scripts/tests/shell.js

| file | covers |
|---|---|
| `shell.js` | boots from index.html, external css/js, CSP clean, manifest, fonts, SW registers |
| `poster-layout.js` | wordmark bleed, grid overlapping the logo, solid field, across widths |
| `list-and-detail.js` | list logo, color-dot grid, kana placement, filmstrip incl. flesh back, swipe, coffee link |
| `theme-and-icons.js` | icons, no pinned theme-color, WCAG contrast on the blue field |
| `scroll-and-highlight.js` | default view, detail contrast, body scroll lock, return highlight |
| `ownership-modes.js` | OWN/WANT never flips on its own, instant scroll restore |

Run them all before shipping. Two habits that have caught real bugs:

- **Assert contrast numerically** (WCAG relative luminance), not by eye. Twice
  now text has shipped at ~1.05:1 — invisible — and looked fine in a screenshot
  taken on a different view.
- **Don't hit-test with `elementFromPoint` without clamping to the viewport.**
  A probe below the fold returns `null`, which reads identically to "the wrong
  element is on top" and sends you chasing a layering bug that isn't there.
