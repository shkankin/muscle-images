# M.U.S.C.L.E. Collector

A collection tracker for the **236 M.U.S.C.L.E. figures** — the 1985–88 US Mattel
release of Kinnikuman's *Kinkeshi* erasers. Track what you own, which **colour
variants** you have, and what's left to find. Works offline, installs as a PWA,
no account needed.

Live at **https://musclemen.app**

Built as a free, non-commercial fan project. Same vanilla-JS PWA architecture as
the sibling MOTU Collector app.

---

## The theme

M.U.S.C.L.E. comes from Kinnikuman's *intergalactic wrestling* premise, so the
visual identity — "The Arena" — fuses the Japanese Kinkeshi heritage (sumi ink,
washi paper, hinomaru red, 筋肉 kanji) with the wrestling world (a championship
**title-belt completion meter**, ring-rope motifs, belt gold). Two themes:
**Arena** (dark, default) and **Poster** (light, washi). Display type is Anton;
UI type is Barlow Semi Condensed; both are self-hosted (no external font calls).

---

## Deployment (GitHub Pages)

This folder **is** the site — deploy its contents to the root of the Pages repo
(`shkankin/muscle-images`, the same repo that holds the figure images).

**Easiest: use the built-in deploy tool.** Open `deploy.html` (locally for the
first push, or later at `musclemen.app/deploy.html`), paste a fine-grained GitHub
token scoped to this repo with **Contents: read and write**, drop the
`muscle-collector-v*.zip`, and hit commit. It writes one atomic commit via the
Git Data API. Because it merges onto the existing tree, **deploying the app never
deletes your `images/` figures.** It also handles the very first commit to an
empty repo, and polls the Pages build so it can tell you when the site is live.
There's a "Backup repo" button that downloads the whole repo as a zip.

Manual alternative:

1. Push everything here to the repo root.
2. `CNAME` sets the custom domain to `musclemen.app`. Point the domain's DNS at
   GitHub Pages (A/AAAA or a `CNAME` record to the `github.io` host) and enable
   **Enforce HTTPS** in the repo's Pages settings.
3. `.nojekyll` is included so Pages serves the `fonts/` directory and every file
   as-is (no Jekyll processing).

Bump `APP_VERSION` in `js/state.js` **and** `VERSION` in `sw.js` together on each
release — the service-worker cache name is keyed off it, which is what triggers
the update-and-refresh flow on clients.

### Figure images (separate repo)

Images are **not** bundled — they load from the companion repo
`github.com/shkankin/muscle-images` via raw.githubusercontent, so the growing
image set is decoupled from app deploys. Name each file by its zero-padded
catalog number:

```
muscle-images/images/001.jpg
muscle-images/images/002.jpg
…
muscle-images/images/236.jpg
```

Until an image exists, the figure shows the salmon **keshi silhouette**
placeholder — a missing image is expected, not a broken state. (The image path
is built in `js/state.js`; `IMG` is the base URL.)

### The catalog

`figures.json` ships with the app (so the set loads instantly and offline). To
edit catalog data without redeploying the app, you can later host `figures.json`
in the images repo and point `FIGS_URL` in `js/state.js` at it. The in-app editor
(the pencil on any figure) already lets you fill in names, identities, and colours;
those edits are saved locally per device for now.

---

## What it tracks

- **236 figures**, numbered #001–#236 (the collector/poster numbers). 233 appear
  on the mail-away poster; #234 Muscleman, #235 Terri-Bull (both Wrestling Ring)
  and #236 Satan Cross do not — the app flags these.
- **11 colours**: Flesh, Dark Blue, Red, Purple, Magenta, Light Blue, Green,
  Orange, Neon Orange, Salmon, and the rare **Grape** (Mega-Match board-game
  exclusive). Ownership is tracked per figure *per colour* — the collecting axis
  unique to this line.
- **Rarity** where documented (e.g. the rare Purple #153 "Claw", uncommon Satan
  Cross). Most figures are common.
- Per-copy notes: condition, which pack it came in.
- A **want list**, plus completion stats and colour-variant breakdowns.

### About the catalog data

Names are filled **only where verifiable** from documented community sources.
The rest of the 236 slots exist (so every image has a home) but are left blank
for you to fill via the editor — the app doesn't invent names. Roughly three
dozen are pre-filled to start.

---

## Project layout

```
index.html          app shell (CSP-hardened; no inline scripts)
deploy.html         in-repo deploy tool (push a build zip → GitHub Pages)
manifest.json       PWA manifest
sw.js               service worker (offline cache + update signal)
figures.json        the 236-figure catalog
CNAME / .nojekyll   GitHub Pages domain + config
css/
  app.css           the full visual system ("The Arena") + both themes
  fonts.css         @font-face for the self-hosted fonts
fonts/              Anton + Barlow Semi Condensed (woff2)
images/             app icons + social card (figure images live in the other repo)
js/
  state.js          constants, palette, themes, storage wrapper, S state
  data.js           catalog load/cache, collection persistence, filtering, stats
  idb-store.js      IndexedDB KV store (localStorage fallback)
  render.js         state → DOM (all views)
  handlers.js       data-action handlers
  delegate.js       one document-level event dispatcher (CSP-safe)
  app.js            boot / entry point
scripts/            build + test tooling (not deployed)
```

### Dev / build scripts (require Node + Python; not part of the site)

- `python3 scripts/build_catalog.py` — regenerate `figures.json`
- `python3 scripts/make_icons.py` — regenerate the app icons
- `node scripts/tests.js` — functional assertion suite (24 checks)
- `node scripts/shoot.js` — screenshot the app across all views/themes
- `node scripts/make_og.js` — rebuild the social card (`images/og-image.png`)

---

## Credits

M.U.S.C.L.E. and Kinnikuman are trademarks of their respective owners (Mattel;
Yudetamago / Shueisha). This is an unofficial, non-commercial fan tool. Catalog
data is compiled from community references including musclefigures.com, Nathan's
M.U.S.C.L.E. Blog, the University of M.U.S.C.L.E., and the Kinnikuman Wiki.
