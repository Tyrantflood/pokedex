# Pokédex: working notes

A single-page Next.js app (App Router, TypeScript, Tailwind v4, Framer Motion) that browses every
Pokémon and alternate form from PokéAPI, styled as a retro "DEX-LINK field scanner".

**Read `AGENTS.md` first and follow it:** this is a newer Next.js (16.x) than most training data. The
docs for the installed version are in `node_modules/next/dist/docs/`. Cache Components is on
(`cacheComponents: true`), so caching uses `"use cache"` + `cacheLife`, and `params`/`id` props are
promises.

## Commands

- `npm run dev` / `npm run build` / `npm run start` (`npx next start -H 0.0.0.0 -p 3000` to reach it from a phone).
- `npm run build` runs `scripts/check-built-css.mjs` afterwards (see "Build check").
- Lint: `npx eslint app lib scripts`; types: `npx tsc --noEmit`. Both are clean; keep them so.
- Judge performance on the **production** build. Dev mode (React dev instrumentation) is several times slower and misleading.

## Map

- `lib/pokeapi.ts`: fetches all ~1,351 `/pokemon/{id}` entries (16 at a time, retried), cached with `"use cache"` + a 7-day disk copy in `.cache/pokedex.json` (gitignored; versioned by `DISK_VERSION`, bump it when the stored shape changes).
- `lib/summary.ts`: the slim `PokemonSummary` sent to the browser (full data stays on the server).
- `lib/species.ts`, `lib/evolution.ts`, `app/actions.ts`: flavour text and evolution chains, fetched on demand through cached server actions (not up front: that would be ~1,500 extra requests per build).
- `app/pokedex/pokedex-browser.tsx`: the card grid, search/filters, drag-to-compare, comparison state.
- `app/pokedex/detail-view.tsx` (+ `scan` art, readouts, evolution), `cry-panel.tsx`, `type-fx.tsx`, `flavor-text.tsx`.
- `app/pokedex/compare-view.tsx`, `scale-stage.tsx`, `stat-radar.tsx`, `matchups.tsx`, `use-card-drag.ts`, `use-modal.ts`.
- `lib/cry-audio.ts`, `lib/type-chart.ts`, `lib/compare-scale.ts`, `lib/radar.ts`, `lib/verdict.ts`, `lib/sprite-bounds.ts`, `lib/preload-image.ts`.
- `app/boot-intro.tsx`, `app/night-mode.tsx`, `app/layout.tsx` (inline scripts), `app/icon.tsx` / `apple-icon.tsx` / `opengraph-image.tsx` / `twitter-image.tsx`, `lib/brand.tsx`, `lib/og-image.tsx`.
- `scripts/`: `check-built-css.mjs`, `build-favicon.mjs`, `generate-caustic.mjs`.

## Decisions, and why (don't reverse these without re-checking the reason)

### Grid: custom windowing, not a virtualizer library
`pokedex-browser.tsx` computes the visible row range straight from `scrollY` (rows are a fixed
`ROW_HEIGHT`) and only sets state when the *range* changes (about once per row scrolled).
`@tanstack/react-virtual` was tried first and removed: it re-rendered the whole grid on every scroll
event, costing frames. Cards are absolutely positioned (`x`/`y` springs) and keyed by id, so filtering
animates cards to new positions. Cards that merely scroll into view mount with `initial={false}`
(no entrance animation); animating those made fast flicks drop frames.
`AnimatePresence custom={animateExit}` makes removal animate only after a filter change, never on scroll.

### Detail view: a measured flight, not `layoutId`
Opening a card grows a panel from the card's real on-screen rectangle, and the sprite flies from the card
sprite to its slot; closing re-measures the card *then* and flies back (so it still works after
scrolling or filtering). All of it lives in the overlay layer using Framer's imperative `useAnimate`.
`layoutId` was rejected for structural reasons: cards sit inside `overflow:hidden`, 3D-tilted,
transformed, virtualized parents under a sticky header, so a `layoutId` card would expand clipped and
beneath the header. Only the sprite/panel opening is measured; keep that pipeline (`card-rects.ts`,
`measureCard`) intact. The overlay locks scroll by swapping the scrollbar gutter for equal padding.

### Cries: CORS `fetch` + `decodeAudioData` (a plain `<audio>` reads silence)
The cry files (raw.githubusercontent.com, Ogg Vorbis) send `Access-Control-Allow-Origin: *`, but an
`<audio>` element without `crossorigin` loads in no-CORS mode, and an analyser fed by it reads **pure
silence**. That is exactly the trap that tempts people to fake a waveform; the oscilloscope draws only
real analyser samples (verified: peak equals the file's peak, and every frame correlates 0.97-0.99 with a
real slice of the decoded file). Decoding uses an `OfflineAudioContext` (no user gesture, so cries are warmed
when the detail view opens); playback creates the `AudioContext` on click. Safari likely can't decode Ogg
Vorbis; the UI shows an error and draws nothing rather than faking it.

### Effects: transform/opacity only, never SVG filters
Heat shimmer (`feDisplacementMap`) and caustics (`feTurbulence`) were profiled on a 390x844@3x viewport:
~3,300 and ~1,300 ms/s of **raster time** (frames dropped), and rendering them at half resolution barely
helped. Everything in `type-fx.tsx` + the `.fx-*` CSS animates `transform`/`opacity` only (~0 raster).
Caustics are a pre-rendered seamless tile (`public/fx/caustic.png`, from `scripts/generate-caustic.mjs`)
drifting in two layers. Effects sit on their own layer *under* content, start after the open animation, fade
out on close, are static under reduced motion, and `useFrameGuard` drops them if frames stay slower than ~30fps.
Keep per-theme element counts small (<= ~20 animated elements).

### Tailwind: `@tailwindcss/postcss`, not `@tailwindcss/turbopack`
`create-next-app` wired Tailwind through the `@tailwindcss/turbopack` loader (a `turbopack.rules` entry).
Version 4.3.3 decides whether `globals.css` changed by comparing the file's **mtime only**. Turbopack
sometimes runs it once with the *old* content after the mtime already moved (logged on every dev edit),
poisoning that bookkeeping; the next call, with the new content, reuses a compiler built from the old
content and serves stale CSS until the file is touched again (reproduced 17/17 on dev). `@tailwindcss/postcss`
also compares the CSS text itself, so it can't go stale that way. Do not switch back. Built CSS is
byte-identical between the two. If a style ever seems missing, `rm -rf .next` and rebuild, then investigate.

### Base forms: use `is_default`, never the name
A species' default form is *not* always named like the species: `deoxys-normal`, `giratina-altered`,
`meowstic-male`, `darmanitan-standard`, `mimikyu-disguised`, etc. Matching on name left 37 species with no
base entry. `normalize` uses PokéAPI's `is_default` flag, and `assertOneDefaultPerSpecies` throws (so nothing
bad gets cached) unless every species has exactly one default (1,025 species, 1,351 entries).
Generation comes from National Dex number ranges (`lib/generations.ts`), not extra API calls.

### Boot intro: `sessionStorage` (once per browser session), set before paint
`app/layout.tsx` has an inline script that sets `<html data-boot="play">` before first paint when
`sessionStorage["pokedex:booted"]` is unset (and the user hasn't asked for reduced motion), so returning
visitors never see a flash. `BootIntro` reads it with `useSyncExternalStore`. It was `localStorage` ("once
ever") first and was deliberately changed to once per session. The grid waits for the intro to end
(`data-boot` removed) before staggering in. Storage failures skip the intro rather than replay it every time.

### Build check: Vercel behaviour (`scripts/check-built-css.mjs`)
Runs as `postbuild`; fails the build if a class defined in `app/globals.css` is missing from the built CSS
(a stale build used to ship silently). It searches `.next/static` and `.vercel/output/static`
recursively, because on Vercel the output is moved before `postbuild` runs. If it finds **no CSS at all**:
**local build fails** (the build didn't run), **Vercel (`VERCEL` set) only warns and skips**, since it can't
tell "moved somewhere unknown" from "broken" and mustn't block a deploy. If it finds CSS, a missing class
fails everywhere. If Vercel warns "no built CSS found", add the real directory to `BUILT_CSS_DIRS`.
The Vercel layout is assumed from the Build Output API, not observed.

### Comparison mode (`app/pokedex/compare-*.tsx`, `lib/compare-*.ts`)
- **Sprite visible-bounds measuring:** official artwork has varying transparent padding, so sizing by image
  size makes small Pokémon look tall. `lib/sprite-bounds.ts` scans the alpha channel (threshold 24; images
  loaded with `crossOrigin="anonymous"` so the canvas isn't tainted) and the stage sizes the *visible* box:
  drawn height = `height_dm * pxPerDm` exactly, one `pxPerDm` for both Pokémon and the 1.7 m human.
  `computeScale` also counts each label column's minimum width (a tiny Pokémon's wide label must not push
  the row past the stage); if even the labels can't fit it falls back to the height-limited scale and scrolls.
  Zoom keeps the human centred. Pose still matters (a coiled Onix is only approximately to scale).
- **Type chart verified against PokéAPI:** `lib/type-chart.ts` is a static chart (stellar/unknown are
  neutral). The unit test compared it to all 18 `type/{name}` endpoints: 324/324 pairs match. Re-run that check
  if the chart is edited.
- **Verdict:** generated from a few base numbers, deterministic and order-independent (seeded by the sorted
  ids), always one line (<= 130 chars). It must stay labelled "Just for fun" and not read as a battle prediction.
- **Triggers:** pointer-event drag (mouse/pen only, with edge auto-scroll; touch uses the Compare button because
  dragging on touch is scrolling), plus a Compare button on every card. Cards are found by `data-card-id`
  delegation, nothing per card. A drop must not also fire the card's click (`suppressClick`).

### Other settled choices
- **Night mode:** a static tinted `.night-veil` layer faded by opacity (midnight to 6:00 local). A CSS `filter`
  on the page would break `position:fixed` overlays and cost frames. `data-night` is set pre-paint by an inline
  script and kept current by `NightMode` (timer to the next boundary + `visibilitychange`).
- **Preload cache:** artwork preloading is an LRU capped at 50 (`lib/preload-image.ts`).
- **Metadata:** `metadataBase` comes from `NEXT_PUBLIC_SITE_URL` (or Vercel's production URL), else localhost.
  Set it for real deploys or share previews point at localhost. `app/favicon.ico` is generated by
  `scripts/build-favicon.mjs` from the same renders as `app/icon.tsx`; rerun it after changing the icon design.
- **Cards use pixel sprites** (`image-rendering: pixelated`); official artwork is only for the detail/compare views.

## How things were verified (reuse these methods)

- Browser checks use **Playwright installed outside the project** (a scratch directory), not a dependency.
  Launch Chromium with `--enable-gpu --use-angle=d3d11 --ignore-gpu-blocklist` for realistic GPU behaviour; the
  default (software raster) is a useful pessimistic stand-in for a weak phone GPU.
- **`requestAnimationFrame` timing cannot see raster/compositor cost in headless Chrome** (it read a flat 60fps
  for a deliberately heavy filter). Measure with browser tracing instead: sum `RasterTask` duration and count
  `Display::DrawAndSwap` per second, with `Emulation.setCPUThrottlingRate` for the main thread.
- Always sanity-check a measuring harness with a control that *must* fail before trusting a green result.
- Time-based features (night mode) are tested with Playwright's `page.clock`, crossing the boundary with the page open.
- Pure logic (type chart, scale math, radar, verdict, misspell) was unit-tested with Node's built-in TypeScript
  stripping plus a tiny resolver hook for extensionless imports.

## Environment gotchas (Windows, Git Bash tool)

- The Bash tool often rejects heredocs containing apostrophes or large blocks ("unexpected EOF"). Write files with the
  file-writing tool, or write a small `.cjs` patch script and run it with `node`.
- After `git stash pop` / checkout the working copy can have CRLF line endings; normalise (`\r\n` -> `\n`) before
  matching multi-line strings in patch scripts. Patch scripts should be idempotent.
- `next build` and `next dev` write to different dirs (`.next` and `.next/dev`), but stop any server on port 3000
  before rebuilding so you test the build you think you're testing.
