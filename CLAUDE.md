# Pokédex: working notes

A single-page Next.js app (App Router, TypeScript, Tailwind v4, Framer Motion) that browses every
Pokémon and alternate form from PokéAPI, styled as a retro "DEX-LINK field scanner".

**Read `AGENTS.md` first and follow it:** this is a newer Next.js (16.x) than most training data. The
docs for the installed version are in `node_modules/next/dist/docs/`. Cache Components is on
(`cacheComponents: true`), so caching uses `"use cache"` + `cacheLife`, and `params`/`id` props are
promises.

## Git workflow

Commit and push straight to the default branch unless the owner asks for a branch. In this repo that branch is named `master` (there is no `main`).

## Commands

- `npm run dev` / `npm run build` / `npm run start` (`npx next start -H 0.0.0.0 -p 3000` to reach it from a phone).
- `npm run build` runs `prebuild` first (`scripts/build-location-names.mjs`, see "Where to find": a no-op unless the name table is over 30 days old) and
  `scripts/check-built-css.mjs` afterwards (see "Build check").
- `npm test`: Node's built-in runner over `tests/**/*.test.ts` (TypeScript stripped by Node; `tests/resolver.mjs` handles extensionless and `@/` imports).
  No network, about 10 s, 157 tests (battle protocol/CPU/teams/music/animations/sprites, type chart, team builder, cry decoder, type calculator, scale maths, radar, verdict, misspell, preload cache, encounters, location names and table, the name-table build script).
  To add a test, put a `*.test.ts` in `tests/` and import from `../lib/...` (only modules without `next/*` imports are importable).
- `npm run test:strength` (`tests-slow/strength.test.ts`, about 35 s): the Normal CPU against the Easy CPU, 24 battles in National Dex and 12 each in Gens 1, 3 and 5, sides swapped. Kept out of `npm test` to keep that fast; run it after changing the CPU. Last run: National Dex 21 of 24, Gen 1 11 of 12, Gen 3 12 of 12, Gen 5 12 of 12.
- `npm run snapshot` (`scripts/snapshot-pokeapi.mjs`, ~10 s) re-saves `tests/fixtures/pokeapi-types.json` (all 18 types' damage relations) and `pokemon-slim.json`
  (id, name, types, stats, height of all 1,351 Pokémon and forms). Tests read these instead of the live API; refresh only on purpose and review the diff.
- Lint: `npx eslint app lib scripts`; types: `npx tsc --noEmit`. Both are clean; keep them so.
- Judge performance on the **production** build. Dev mode (React dev instrumentation) is several times slower and misleading.

## Map

- `lib/pokeapi.ts`: fetches all ~1,351 `/pokemon/{id}` entries (16 at a time, retried), cached with `"use cache"` + a 7-day disk copy in `.cache/pokedex.json` (gitignored; versioned by `DISK_VERSION`, bump it when the stored shape changes).
- `lib/summary.ts`: the slim `PokemonSummary` sent to the browser (full data stays on the server).
- `lib/species.ts`, `lib/evolution.ts`, `app/actions.ts`: flavour text and evolution chains, fetched on demand through cached server actions (not up front: that would be ~1,500 extra requests per build).
- `app/pokedex/pokedex-browser.tsx`: the card grid, search/filters, drag-to-compare, comparison state.
- `app/pokedex/detail-view.tsx` (+ `scan` art, readouts, evolution), `cry-panel.tsx`, `type-fx.tsx`, `flavor-text.tsx`.
- `app/pokedex/compare-view.tsx`, `scale-stage.tsx`, `stat-radar.tsx`, `matchups.tsx`, `use-card-drag.ts`, `use-modal.ts`.
- `lib/cry-audio.ts`, `lib/cry-decode.ts`, `lib/type-chart.ts`, `lib/compare-scale.ts`, `lib/radar.ts`, `lib/verdict.ts`, `lib/sprite-bounds.ts`, `lib/preload-image.ts`.
- `app/boot-intro.tsx`, `app/night-mode.tsx`, `app/layout.tsx` (inline scripts), `app/icon.tsx` / `apple-icon.tsx` / `opengraph-image.tsx` / `twitter-image.tsx`, `lib/brand.tsx`, `lib/og-image.tsx`.
- `scripts/`: `check-built-css.mjs`, `build-favicon.mjs`, `generate-caustic.mjs`, `build-location-names.mjs`.
- `lib/encounters.ts`, `encounter-data.ts`, `encounter-format.ts`, `location-names.ts`, `location-table.ts`, `location-names.generated.json` (committed), `games.ts`; `app/pokedex/where-to-find.tsx`.
- `tests/`: the project's test suite (see Commands); `tests/fixtures/` holds the saved PokéAPI data (`load.ts` reads it).
- `app/pokedex/type-calculator.tsx` (+ `defenseProfile` in `lib/type-chart.ts`): the detail view's type matchups.

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
**Safari fallback:** decoding tries the browser first and only when it refuses falls back to a WebAssembly Vorbis decoder (`lib/cry-decode.ts`, package
`@wasm-audio-decoders/ogg-vorbis`, MIT, a separate lazy chunk that Chrome/Firefox never download; `?cry-decoder=wasm` forces it). Apple's notes say Safari decodes Ogg Vorbis from
macOS 15.4 / iOS 18.4; whether `decodeAudioData` accepts it there was **not verified on a device** (no Safari available), so the fallback covers any refusal. The wasm output equals
Chromium's own decode (same length, peak, loudness, 16 sample points; `tests/cry-decode.test.ts`). `next.config.ts` lists the decoder packages in `serverExternalPackages`:
without that Turbopack fails the build on the package's Node-only worker import.

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

### Shiny toggle and evolution sequence (`detail-view.tsx`, `evolve-fx.tsx`)
- Shiny: sparkle burst, then the shiny image (a second layer inside the scan-clipped wrapper) crossfades in ~0.22 s later.
  It stays on along the chain when the next form has shiny art, and the image is preloaded once the view is ready.
- Evolution: only for a **forward** click (`lib/evolution-path.ts` `evolvesInto`: any later stage, Charmander to Charizard counts).
  Earlier stages and siblings (Eevee branches) use the quick switch, as does reduced motion. The white silhouette is a *static*
  `brightness(0) invert(1)` image whose opacity pulses (7 pulses, each shorter), never an animated filter. The swap happens under
  the flash; the scan then starts `EVOLVE_REVEAL_S` after the swap. Measured on a phone viewport at 4x CPU: about 62 fps, about 3 ms/s raster.

- **Drag hint** (`use-drag-hint.ts`): after 0.5 s resting a mouse/pen on a card, one DOM label says how to drag-compare. Never for touch, during a drag/comparison/detail view, or once a *drag* compare completed (`sessionStorage` `pokedex:drag-compared`; the Compare button does not count).

### Artwork / Animated toggle (`app/pokedex/art.ts`, `lib/first-frame.ts`)
- Animated = PokéAPI Showdown GIFs (`sprites.other.showdown`; all 2,566 listed URLs resolve), pixelated and scaled to the slot. 68 forms have none
  (Megas etc.): they get the static pixel sprite with a CSS idle bob (`.art-bob`, phase-aligned to the wall clock so layers stay in sync). A GIF that
  fails to decode is added to `broken` and falls back the same way. `DISK_VERSION` is 4 because the cached shape gained `animated`.
- Animated is the default; Artwork is the thing you switch to. The choice is remembered in `sessionStorage` `pokedex:detail-mode`. Changing it replays only the scan, not the readouts (separate art clock).
- Reduced motion pauses on the first frame of the GIF (`lib/first-frame.ts`: canvas to blob URL, cached). Comparison mode always uses static artwork.
- The scan silhouette exists only until the reveal finishes: it is unmounted (not just faded) and the scan waits for it to exist. Once it stayed behind the moving GIF, because its first frame arrives asynchronously and the fade-out had already run on nothing. The shiny crossfade likewise hides the normal layer once fully shiny.

- **The scan never waits for the GIF.** Card hover/focus (`preloadDetailArt` in `art.ts`) warms the GIF, its first frame and the static sprite.
  If the GIF still isn't decoded at click time, the scan starts on schedule using the static pixel sprite (scaled by its visible bounds,
  `useFitTransform`, so it matches the tight-cropped GIF's size) for both the silhouette and the revealed image, and the GIF replaces it on
  arrival. Measured on a throttled network (cold click, slow 3G): the bar starts about 50 ms after its scheduled landing time (about 700 ms after the
  click; before the change 2.3-2.7 s). Artwork <-> Animated is a plain 0.25 s crossfade: no silhouette, scan or readout replay; the button updates
  at once and the picture follows once decoded (700 ms at most).

- **Live silhouettes (Animated mode).** The dark scan silhouette and the white evolution silhouette are *filtered copies of the live GIF*
  (`brightness(0)`, and `brightness(0) invert(1)` for white), never frozen frames: a frozen silhouette stopped matching the moving sprite on
  flyers. Scan: the filtered copy sits **on top** and is clipped away top to bottom (`clip-path: inset(top% 0 0 0)`) revealing the unfiltered one
  underneath; it is unmounted when the reveal ends. Evolution: the white copy of the old GIF pulses over the live sprite; at the flash it switches to the
  new form's GIF (decoded beforehand). Static images (Artwork mode, bobbing stand-ins) keep the older arrangement (silhouette below, real image revealed over it).
  - Sync: copies of one GIF URL stay in the same frame in Chromium, checked by pixel-differencing (`mix-blend-mode: difference` on a black backdrop) on
    the real layers for Charizard, Pidgeot, Zubat, Gengar and four evolutions: no pose differences, only 1 px edge noise where the sprite lands on a
    fractional pixel. Firefox and Safari were not tested. **Do not "verify" this with canvas `drawImage`**: it only ever returns a GIF's first frame.
    Per-frame canvas drawing was therefore not used (it would need WebCodecs `ImageDecoder`).
  - Cost (phone viewport, 4x CPU): scan 66 frames/s, 8 ms/s raster; idle with a GIF playing 60 frames/s, 2 ms/s; evolution 61 frames/s, 3 ms/s.

### Type calculator (`app/pokedex/type-calculator.tsx`, `defenseProfile` in `lib/type-chart.ts`)
- Reuses comparison mode's chart (`multiplier`/`effectiveness`), so there is one source of truth for type maths. `defenseProfile(types)` takes the *current Pokémon's own types*
  (a regional form has its own: Alolan Vulpix is ice, Vulpix is fire), multiplies the two halves (so x4 and x0.25 exist, a weakness and a resistance **cancel to neutral and
  appear nowhere**, and an immunity beats any weakness: Gligar takes x0 from electric, never x2) and returns non-empty groups in the order x4, x2, x0.5, x0.25, x0.
- UI: "Weak to / Resists / Immune to" rows, chips in type colours with a red (weakness) / green (resistance) / black (immunity) multiplier badge. The chips pop in with a stagger
  (`delayChildren` 0.75 s on first open, 0.45 s after a switch; reduced motion: no delay, no stagger). It re-pops for each Pokémon (keyed).
- **Where it lives matters:** it sits *outside* the swapping `AnimatePresence initial={false}` block, because that prop makes *everything inside it* skip its entrance
  animation on the first open (the chips were simply there, found by sampling opacity per frame). **Sibling keys must differ:** `TypeCalculator` and `WhereToFind` are
  siblings and both used `key={current.id}`; React then keeps both (duplicate-key warning in dev only; in production the old one just stayed on screen after an
  evolution). They are now `types-${id}` and `where-${id}`. Check a dev run's console after adding keyed siblings.
- Tested (`tests/type-chart.test.ts`): a 4x weakness (Dragonite/ice, Charizard/rock), a dual-type cancel-out (Volcanion vs water and grass), an immunity overriding a weakness
  (Gligar, Skarmory), a regional form with different types (Vulpix and Sandshrew vs their Alolan forms), every one of the 171 single/dual typings against the chart, and all
  1,351 snapshot Pokémon. The 324-pair chart check now runs against the saved PokéAPI snapshot. Browser: the chips matched the chart for 14 Pokémon.

### Team builder (`lib/team.ts`, `app/pokedex/team-dock.tsx`, `use-team.ts`, `use-card-drag.ts`)
- **Storage shape** (localStorage `pokedex:team`): `{ "version": 1, "slots": [ { "pokemonId": 6 } | null, ... six ... ] }`. Members are *objects*, not bare ids, and every
  operation (`addMember`, `removeMember`, parse/serialise) moves whole members, so the battle team builder's moves, item, ability, nature, EVs and IVs can be added to
  `TeamMember` later without touching how a team is stored, dropped, or analysed; `parseTeam` is where an older `version` gets migrated. Those fields are deliberately **not** built.
  The id is the PokéAPI form id, so a regional form is its own member. The same Pokémon can't be on the team twice (species clause); a full team refuses a seventh with a message.
- `parseTeam` never throws: garbage, another version, bad/unknown/duplicate ids and extra slots are dropped or padded, so a damaged save cannot stop the app. The team starts empty
  on the server and first client render and loads right after mount (no hydration mismatch); a load does not animate; storage that is blocked just means the team isn't remembered;
  a second tab follows through the `storage` event.
- **Adding:** mouse/pen drag a card onto a slot (that slot, replacing its occupant) or onto the bar (first free slot); `use-card-drag.ts` resolves the topmost of slot / bar / card
  under the pointer and reports a `DropTarget` plus where the dragged sprite was let go. Touch and keyboard: the card's own +/✓ button (always visible when `hover: none`).
  The sprite then **flies from where it was let go (or from the card's sprite) into its slot** with a spring, and the slot pulses; reduced motion: it just appears.
  Clicking a filled slot opens its detail view.
- **Analysis** (`analyseTeam`, pure): each member's multiplier against each of the 18 types with the same chart as everywhere (`effectiveness`, so dual types and immunities are right).
  Per type it counts members weak / resisting / immune. **Flagged** = every member weak, and only with two or more members (one Pokémon is not "the whole team").
  **Gaps** = somebody weak and *nobody* resists or is immune (an immunity is an answer); flagged types are gaps too.
- **Suggestions** (`suggestCoverage`, pure): over one default form per species, not already on the team (or the same species). Score: each gap counts once per member weak to it (double
  when the whole team is); +1 for a resistance, +1.25 for a double resistance, +1.5 for an immunity; −0.75 per gap the candidate is itself weak to; a small penalty for piling a second
  weakness onto a type the team is already weak to; base-stat total/1000 only as a tie-break. Nothing is suggested that covers no gap. With a full team the panel says so instead.
- Layout: the bar is fixed at the bottom (z 35, below detail/comparison at 40); the compare tray moves up (`bottom-28`) and the page keeps 7 rem of room under the last row.
- Verified: the browser panel's chips equal `analyseTeam`'s output for a rock-weak team, and adding the top suggestion cleared the flag. Tests are in `tests/team.test.ts`;
  11 deliberate breakages (flag rule, gap rule, immunity as answer, duplicates, full team, load validation, version check, suggestion exclusion, cover requirement, weakness penalty) are all caught.

### Where to find (`where-to-find.tsx`, `lib/encounter-*.ts`, `lib/games.ts`)
- Loaded on demand per Pokémon (server action `loadEncounters(id)`, cached for days; one request per Pokémon per page load, failures not kept so Retry works).
  PokéAPI `/pokemon/{id}/encounters` is per *form id*, so Megas and other forms honestly have none.
- `buildGameEncounters` (pure, unit-tested): slots in one area with the same method and conditions are **summed** (capped at 100); areas that end up with the same
  *name* are merged by **best chance and widest levels**; locations are ranked by best chance. Games are in
  release order from the static list in `lib/games.ts` (add new versions there; unknown versions still show, last).
- Honesty rules: a game with no data is worded "No wild encounter data", never "not found". Those lines only cover main-series games from the Pokémon's own
  generation onwards, consecutive ones collapsed into one line; spin-offs, DLC and regional editions only appear when they have data. The Japanese Red/Green/Blue
  editions are hidden when the international games have data (they repeat it). A note always says starters, gifts, trades and newer games are often missing.
- **Location names come from PokéAPI** (`/location-area/{slug}` and its `/location/{slug}`) and ship **in a table built at build time**:
  `scripts/build-location-names.mjs` (the `prebuild` step) writes `lib/location-names.generated.json` (1,539 areas, 1,104 locations, 150 KB: per area
  `[English name or null, location slug]`, per location its English name). The table is **committed** (a fresh clone or deploy needs no network for it) and is only refreshed
  when older than 30 days, missing, or with `--force`; ~10 s. **It never fails a build**: if PokéAPI is unreachable or the fetch is incomplete (over 2% failed) it keeps the
  old table, or writes an empty one with a warning. The runtime resolves everything the table knows from memory with **no request**; only an area (or a location) missing from
  the table is looked up, cached per slug with `"use cache"` + `cacheLife("max")` (404 cached as "no such entry", other failures retried next view, 40 in flight).
  The raw encounter list is cached for days and the combined result is *not* cached as a whole, for that reason. Measured: first view of Zubat 1.2 s with **0** name
  requests (was 3.3 s with 237 before the table); with 3 areas and 1 location removed from the table, exactly those 5 areas and 1 location were fetched and the names were identical.
  - **The two English names disagree, so the resolver combines them**: the *location's* name is the one the games use ("Route 120", "Mt. Moon", "Pokémon Tower");
    the *area's* is more specific but often spelled differently ("Road 120", "Mount Moon (1F)", "Pokemon Tower (7F)", and "Relic Tunnel" where the location says
    "Relic Passage"). Rule: location spelling for the place + what the area adds ("Mt. Moon (1F)", "Route 2 (South, ...)"). If the area name doesn't start with the
    location's (`Safari Zone Peak`, `Pokemon Center (Cianwood City)`) it is used as it is, unless its slug shows it is inside that location and the parenthesis is
    only a qualifier. "Road N" becomes "Route N" only when the area's slug contains `route-N` (so "Victory Road 1" is untouched).
  - Without an English *area* name (241 of 1,539 areas) it is the location's English name plus the part of the slug after the location's slug ("Route 1 (East)"); with
    no English name at all (7 areas, e.g. `hoenn-pokecenter-area`) the whole slug is formatted. Checked against all 1,539 areas: no empty names, no "()", and the
    only "Road N" left are real Victory Roads. Different regions' routes share names ("Route 12"), which is fine because a game is one region.
  - To refresh by hand: `node scripts/build-location-names.mjs --force`, then commit the JSON. The tests read the shipped table, so a bad refresh fails `npm test`.
- Top 3 locations per game and top 3 methods per location, then "Show N more"; the first 4 rows, then "Show N more game entries".
- **Why these choices (Where to find):**
  - *Normalised on the server*, not in the browser: raw encounter JSON is large (Zubat is 160 areas across 30+ games); the browser only gets the grouped, ranked result.
  - *Release order is a static list* (`lib/games.ts`) because PokéAPI's `/version` has no release dates. The list covers every version the API had at the time
    (checked against 7 Pokémon: none unknown) and each game carries a generation and a `main` flag, which is what decides who gets a "no data" line.
  - *Sum slots, then max across areas*: PokéAPI lists one row per slot/level, and slots add up to the chance of meeting the Pokémon in that area, so they are
    summed. Different areas of one location are alternatives, so they take the best chance. Different *conditions* (morning/night, swarm) stay separate entries, never summed.
  - *Location names come from PokéAPI's English names, not slugs* (`lib/location-names.ts`, `resolveLocationName` in `lib/encounter-format.ts`). The slug
    formatter (`locationName`: strips the region prefix and "-area", "mt" to "Mt.", floors to "1F") is only the fallback. Sub-areas with their own name
    ("Route 2 (South, towards Viridian City)") are deliberately **not** merged into the parent route: guessing which sub-areas belong together would invent data.
  - *"No data" is worded as a data gap, never an absence*, and the note under the list says why: the API misses starters, gifts, trades, special encounters
    and the newest games (Gen 9 Pokémon such as Gholdengo have none at all). Do not change the wording to "not found".
  - *Known limits:* the chance is the slot chance inside that area (not an overall odds figure), it does not know which games a Pokémon is actually in, and
    only wild/static/gift entries PokéAPI has are shown.
  - *Verified with:* `npm test` (names, resolver cases, merge, cap, ordering, row planning, Japan-edition hiding, the shipped table, and the build script against a
    fake PokéAPI incl. unreachable and half-failed fetches; six deliberate mutations of the code were each caught) plus real data for 7 Pokémon, and browser runs for
    loading (aria-busy skeleton), error plus Retry (request blocked, then allowed), empty (Mega, Gen 9), show-more, refetch when switching evolution stage,
    Esc, and a 390 px viewport with no sideways scroll.

### Other settled choices
- **Night mode:** a static tinted `.night-veil` layer faded by opacity (midnight to 6:00 local). A CSS `filter`
  on the page would break `position:fixed` overlays and cost frames. `data-night` is set pre-paint by an inline
  script and kept current by `NightMode` (timer to the next boundary + `visibilitychange`).
- **Preload cache:** artwork preloading is an LRU capped at 50 (`lib/preload-image.ts`).
- **Metadata:** `metadataBase` comes from `NEXT_PUBLIC_SITE_URL` (or Vercel's production URL), else localhost.
  Set it for real deploys or share previews point at localhost. `app/favicon.ico` is generated by
  `scripts/build-favicon.mjs` from the same renders as `app/icon.tsx`; rerun it after changing the icon design.
- **Cards use pixel sprites** (`image-rendering: pixelated`); official artwork is only for the detail/compare views.

## Battle section (`/battle`): plan and spike findings (2026-10-12)

Showdown-style battler: CPU battles open to everyone, friend battles private through their invite links. Guest sign-in by name only. Hard requirement: **costs nothing, no payment card**.
**There is no passcode** (the original plan to gate `/battle` was dropped on purpose): the Pokédex header has a "Battle" link (`app/scanner-link.tsx`, shared with the "Back to Pokédex" link on `/battle`), and `/battle` is public and indexable. A friend battle is private only because its room code is long and unguessable (generate it from a CSPRNG, 10+ base32 characters) and a room takes exactly two players; there is no shared secret or signed token to build.
Order of work: spike (done), CPU battles in the browser + battle UI (**done**, see "Battle UI and CPU" below), room server, invites (commit and push after each). v1 uses random teams only (custom sets are a later step; see Team builder).

- **PartyKit's hosted platform is shutting down** (deploys off 16 Oct 2026, platform deleted 23 Oct; `partykit deploy` to your own Cloudflare account also stops). Use **`partyserver` + `partysocket` deployed with `wrangler`** to our own Cloudflare account instead. Do not use `partykit`.
- **Cloudflare free plan fits.** Durable Objects are on the Workers Free plan (SQLite-backed only): 100,000 requests/day, 13,000 GB-s/day, 5 M rows read and 100 k rows written/day, 5 GB storage; incoming WebSocket messages count 20:1. A battle is a few hundred messages. The Workers limits page lists the Worker size as 64 MiB uncompressed; an older 3 MB figure may still be quoted, and the sim bundle fits either way (below). Whether sign-up needs a card was **not** confirmed from official docs; check at sign-up. If it does, the fallback is WebRTC peer-to-peer with the host's browser running the battle.
- **`@pkmn/sim` 0.10.11 + `@pkmn/randoms` bundle (esbuild, browser platform): 7.6 MB minified, 1.2 MB gzip.** A full random-vs-random battle runs in 40-90 ms. Needed tricks: import `RandomPlayerAI` from `@pkmn/sim/build/esm/sim/tools/random-player-ai.mjs` (the `@pkmn/sim/tools` entry pulls in Node `fs`/`assert`; alias it in the bundler), and `BattleStreams` is a namespace (`BattleStreams.BattleStream`, `BattleStreams.getPlayerStreams`). Random team generators live in `@pkmn/randoms` (`Teams.setGeneratorFactory(TeamGenerators)`), not in the sim.
- **Formats available:** `gen1randombattle` ... `gen9randombattle` all generate 6-Pokémon teams. **There is no National Dex random format** (`gen9nationaldexrandombattle` etc. do not exist; `gen9nationaldex` is a non-random format).
- **National Dex random teams, proven approach:** take the gen 9 generator (`Teams.getGenerator("gen9randombattle", seed)`), and merge older generations' `randomSets` into its `randomSets` for species gen 9 lacks (try gen 8, 7, 6, 5, 4 in that order; gen 1-3 data uses move ids and `hiddenpower*`, and all of those species exist in later gens anyway). Per merged set: keep moves that exist in the gen 9 dex and are not Z/Max/Hidden Power, drop empty sets, keep existing abilities, set `teraTypes` to the species' types. 508 gen 9 species + 275 added = 783. Battle format `gen9nationaldex` (sim does not validate teams). Measured: 300 seeded teams, 0 generator crashes, 642 distinct species seen; 150 CPU-vs-CPU battles, 150 completed (avg 32 turns), no `|error`. The team validator rejects many of these teams (ND tier bans, event-only sets), which is irrelevant here because the sim does not validate; some merged sets come out with no item.
- **Where it runs:** CPU battles run in the browser (lazy `/battle` chunk only, sim never in the Pokédex bundle). Friend battles run in one Durable Object per battle room (authoritative: it generates both teams, sends each player only their own side's stream, validates choices) and persists seed + input log so a reload or eviction replays the battle.

### Battle UI and CPU (`/battle`, `app/battle/`, `lib/battle/`)
- **Map.** `lib/battle/`: `protocol.ts` (pure reducer: simulator text protocol to a `BattleView`, plus request parsing; `applyLine` returns narration, an animation cue and a hold time), `cpu-logic.ts` (pure scoring over plain facts), `cpu-player.ts` (the two CPUs, `BattleStreams.BattlePlayer` subclass), `dex-facts.ts` (Dex to those plain facts), `teams.ts` (random teams incl. the National Dex merge), `formats.ts`, `ids.ts` (sprite/cry URLs), `species-ids.generated.json` (from `scripts/build-battle-species.mjs`, `--check` verifies it), `engine.ts` (the only module that starts the sim). `app/battle/`: `battle-app.tsx` (lobby/battle switch, settings via `use-stored.ts`, a `useSyncExternalStore` over localStorage), `use-battle-session.ts` (loads the engine with `import()`, plays the log line by line with holds, cries on switch-in), `battle-field.tsx`, `action-panel.tsx`, `battle-log.tsx`, `lobby.tsx`, `ui.tsx`.
- **The simulator is only downloaded when a battle starts.** `engine.ts` is reached by `import("@/lib/battle/engine")` from a click handler path; everything else in `app/battle` imports types only from it. Verified on the production build: neither `/` nor the `/battle` lobby requests the 7.6 MB chunk, starting a battle does. If the chunk fails to load the screen shows the error and "Try again" (tested by blocking the chunk, then allowing it). Do not import `@pkmn/sim` anywhere reachable from `app/layout.tsx` or the Pokédex.
- **Sprites/cries reuse the Pokédex sources**: PokéAPI's Showdown GIFs (`other/showdown/{id}.gif`, `back/` for your side), then the pixel PNG, then nothing; cries from `PokeAPI/cries` `latest/{id}.ogg` through `lib/cry-audio.ts` (so the Safari WebAssembly fallback applies too). Ids: base species = dex number; forms through the generated table (281 forms; 110 cosmetic formes such as Pikachu caps and Arceus plates use the base sprite). Sprites draw at native pixel size times a scale from the field width, so sizes stay relative.
- **Effects are transform/opacity only** (lunge, shake, a radial burst in the move's type colour, floating labels; HP bars are `scaleX`), no SVG filters. Reduced motion: no lunge/shake/burst, holds shortened (x6). "Fast" shortens holds x3. The CPU never waits on the animation: choices are made as soon as the log is read, the UI plays the log and only then shows the action panel.
- **Request without PP** (a locked-in move such as Outrage, a charge turn) has `pp: null`, not 0: an earlier version treated it as empty and the player had no legal button (found by a phone-viewport run that stalled on turn 1). The test harness' "first move" fallback had hidden it; `tests/battle.test.ts` now covers it.
- **Illusion and silent forme changes** (found by an intermittent test, about 30 % of runs): `|replace|` renames the disguised team member in place (a new member would never faint, so "all fainted" never held); `|detailschange|...|[silent]` carries a tag, not HP (it used to write NaN HP). Both have deterministic tests.
- **The merged National Dex sets' "missing held items" were not a bug**: the only item-less Pokémon in 2,400 generated were Gen 9's own Acrobatics sets (Jumpluff, Thundurus), which are meant to hold nothing; merged sets always have one. The test asserts that rule.
- **CPU, Easy**: a random legal move, an 8 % chance to switch; Mega Evolution/Z/Dynamax/Tera each 30 %. **Normal** (`cpu-logic.ts`): per move, base power x type effectiveness (the site's `lib/type-chart.ts`) x 1.5 STAB x accuracy, scaled by its better attacking stat, x0.5 for physical while burned, x0.55 for charge/recharge moves, priority bonus on a nearly-dead target; a move the target is immune to scores -1000 (never chosen unless nothing else); status moves are scored by situation (recovery under 50 % HP, status the target can't already have or be immune to, setup at high HP, hazards early). It picks the best, or the runner-up 20 % of the time when it is within 60 %. On a bad matchup (the foe's type hits it for x2 and it has no x2 reply) it switches 40 % of those turns, never twice within 3 turns and never when trapped, to the bench member with the best matchup if that is clearly better. It sees only what a player could (its own team, the foe's active species/HP %/status/boosts), never the foe's moves or bench. **Fixed-damage moves, checked against the simulator (a test replays them in every generation):** Night Shade, Seismic Toss, Sonic Boom and Super Fang **do** hit Normal, Ghost and Psychic types in Gen 1 (the simulator's Gen 1 data marks them `ignoreImmunity: true`; Night Shade took 100 HP off a Snorlax and an Alakazam), and in every later generation they are stopped by the type chart like any other move (Dragon Rage by Fairy from Gen 6, Psywave by Dark from Gen 2, Night Shade by Normal from Gen 2). An ordinary Ghost move (Lick) is still immune against Psychic in Gen 1. So the CPU reads `ignoreImmunity` from each move's own data (`ignoresTypeImmunity` in `dex-facts.ts`; status moves default to ignoring immunities unless the data says not, as Thunder Wave's does), and scores a fixed-damage move as 50 x accuracy with no effectiveness, no STAB and no stat factor (the damage is the same whatever the matchup), plus Super Fang and Psywave count as fixed-damage. The consistency test fails if the CPU and the simulator disagree about 50+ (generation, move, target) cases. **Type maths is the simulator's own data for the battle's generation** (`dexTypeMath` in `dex-facts.ts`, via `dex.getImmunity`/`getEffectiveness`), not the site's chart: Gen 1 has Ghost doing nothing to Psychic, Bug and Poison super effective on each other and Ice neutral on Fire, Gens 2-5 have Steel resisting Ghost and Dark; from Gen 6 the two agree (a test checks all 18 x 18 and every dual typing). (The site's `lib/type-chart.ts` is unchanged and still drives the Pokédex.) **Abilities the battle has shown count**: the reducer records an ability from `[from] ability: X`, `[of]`, `-activate/-start ability: X` and `-ability` lines; a revealed Levitate, Flash Fire, Water/Volt Absorb, Dry Skin, Storm Drain, Lightning Rod, Motor Drive, Sap Sipper, Earth Eater, Well-Baked Body (each from the generation that introduced it), Soundproof, Bulletproof or Wonder Guard makes the matching moves score as useless, status moves included (Thunder Wave into Volt Absorb); an unrevealed ability is never guessed, and a Mold Breaker / Teravolt / Turboblaze user ignores them. There are no effectiveness hints in the battle UI to correct (the move buttons show type, power, accuracy and PP only). Measured with `npm run test:strength`: Normal beat Easy in 21 of 24 National Dex battles (same teams, sides swapped), 11 of 12 in Gen 1, 12 of 12 in Gens 3 and 5.
- **Music** (`lib/battle/music-data.ts` notation + `music-engine.ts` player + `app/battle/use-battle-music.ts`): all original, chiptune through Web Audio, no recordings. Channels: two pulse voices (lead 25 % duty, arpeggio 12.5 %; pulse waves are built with `createPeriodicWave` from the Fourier series of the duty cycle), a triangle bass, noise drums (kick = pitch-dropping triangle). Theme in E minor at 150 bpm: 4-bar intro (ends on B7, resolves into the loop's first bar), then a 16-bar loop (8-bar A + 8-bar B) repeating forever; the intro plays once. **Intense** version (your last Pokémon is in, `isLastStand`): the same loop a whole tone up, 12 % faster, driving sixteenth bass, a doubled lead and busier drums; the switch waits for the next bar line and lands at the same place in the loop (same length), so it carries on rather than restarting. Jingles: victory (C major, about 4.5 s) and defeat (E minor, about 5 s), played once when `|win|` arrives, replacing the loop. Notation is text (`"E5:3 r:1 G5:2"`, steps of a sixteenth; each bar must be exactly 16 steps or building the song throws), drums are 16-character strings.
  - Scheduling: a 25 ms timer keeps notes queued 150 ms ahead on the audio clock; pausing = `ctx.suspend()` (freezes the clock, and the scheduler with it). The context is created only when a battle is under way (after the Start click) and resumed on the next pointer/key press if the browser still holds it suspended; with the music off in the saved setting no context is made. Music gets its own `AudioContext` (cry playback has another).
  - Ducking: `lib/cry-audio.ts` now has `onCryPlaying(listener)`; the music dips to 35 % within about 0.04 s when a cry starts and recovers over about a second after it ends. Volume is the slider squared (0-100, default 60) times 0.5. Controls: "Music" toggle and a volume slider (disabled while off), remembered in `localStorage` (`battle:music`, `battle:music-volume`); the former "Sound" toggle is now "Cries".
  - **Verified:** tests with a fake AudioContext (intro once then loop, exact loop period, mode switch on a bar line with the right transposed chord root, jingle then silence, ducking/recovery, volume curve, no-audio fallback; two deliberate breakages of the engine were caught), and in Chromium: a real context renders audible, unclipped output (peak about 0.4 at full volume), ducking lowers the level to about a third, volume 0 is silent, the jingle plays and then nothing, no context before the click, the toggle suspends/resumes, settings survive a reload. **Not verified: how it sounds.** The tunes were written from theory and checked structurally and by level, not listened to; adjust the notation strings in `music-data.ts` if a part sounds wrong.
- **Move animations** (`lib/battle/move-fx.ts` plans and orders; `app/battle/fx/` draws; written from scratch, nothing ported from another client). A move plays in beats: **banner** ("Charizard used Flamethrower!" with the move's type colour and category, over the top of the field, 520 ms) -> **attack** (by category) -> **impact** (the damage line: type particles and a ring at the target, a shake and blink on the target; the HP bar then drains, 700 ms CSS transition on `scaleX`) -> **effectiveness text** ("Super effective!", "Critical hit!") -> next. The simulator reports effectiveness *before* the damage, so `sequenceLines` moves each run of `-crit/-supereffective/-resisted` to just after the damage line it belongs to and hands its meaning to that damage line as flags (a crit also gives a white screen flash). The log hold for a `move` line is `moveHoldMs` = banner + the style's duration (480-1450 ms), so the damage lands as the animation ends.
  - Styles (`planMove`): physical = `lunge` (the user moves 80 % of the way to the target and back, in `Combatant`); special = `projectile` (an orb in the type's shape with a 3-copy trail) or `beam` (names with beam/ray/laser/cannon/lance/flash); status = `aura` (rings and rising particles on the user) when the move targets its own user or nobody, `pulse` (rings on the target) otherwise. Iconic, chosen by name whatever the category: Earthquake (the whole scene shakes for a second, dust and rubble jump off the ground, cracks open under both platforms), Hyper Beam (a charging orb, then a wide white-orange beam, a shockwave ring, a screen flash and a shake), Protect (a hexagon-patterned cyan dome; when a hit is blocked, `-activate` Protect plays a shield flash), Thunderbolt (three jagged bolts from above, flicker flashes, sparks), Surf (a wave sweeping across the field, splash at the target; mirrored when the user is on the right), Swords Dance (three swords orbiting the user inside red rings).
  - **18 type looks** (`TYPE_FX`, one shape + one motion each, a test keeps every pair different): normal streaks, fire flames rising, water drops splashing, electric bolts bursting, grass leaves swirling, ice shards, fighting stars, poison bubbles rising, ground dust rising, flying slashes sweeping, psychic rings pulsing, bug dots swarming, rock chunks falling, ghost wisps floating, dragon flames swirling (violet), dark claws, steel glints, fairy sparkles twinkling. `STATE_FX` adds heal sparkles and boost/unboost arrows; status effects reuse fire/electric/poison/ice/ghost looks.
  - **Big hit** (a crit, or 30 %+ of the target's HP): the scene (never the plates or text) shakes. Reduced motion: no particles, no movement, no shake; the banner and the floating text stay (the banner is held about 0.85 s, `moveHoldMs` 650 ms) and a hit is a brief white flash. Speeds (`lib/battle/speed.ts`, tested): every hold and animation length is divided by 1.5 at Normal (the base timings in `protocol.ts` `HOLD` and `move-fx.ts` were a third too slow), by 4.5 for Fast (always three times Normal) and 6 for reduced motion (banner kept readable, 650 ms). The HP bar's drain follows the speed (`--hp-ms` on the field, 700 ms at the base timings) so it finishes before the next line. Measured turns before Fast was sped up (a turn is two moves plus switches and faints, so it varies by battle): Normal 2.5-3.4 s (was 3.7-5.5 s).
  - **Cost.** Transform/opacity only; audited by watching every inline style rewritten under the field for 11 moves, 17 types and 8 other cues (17,721 rewrites: `transform` and `opacity` only; a control that rewrites `margin-left` was caught). The plates' `backdrop-blur` was removed because the scene moving under a backdrop filter would repaint it every frame. At 390x844@3x with the CPU 4x slower, main-thread frame p50 16.7 ms and p95 16.8 ms for Hyper Beam, Thunderbolt, Swords Dance, Protect, p95 33 ms for Flamethrower, Surf, Earthquake, Tackle (7-9 % of frames over 33 ms, against 0 idle; each effect mounts 10-25 framer elements and the JS-driven transforms are what costs). **Raster time could not be judged**: the `RasterTask` metric did not react to a deliberate SVG-filter control (the idle page's GIF sprites dominate it), so no raster claim is made; the style audit is the evidence for "no paint properties". To go further, animate with WAAPI instead of framer's JS transforms.
  - Not reachable by a real battle on demand, so checked with a throwaway harness page (deleted): contact sheets of all 18 types and each iconic move at four moments. Real battles confirm the banner and sequence and the three speed modes.
- **Sprites are never invisible** (`lib/battle/sprite-chain.ts`, `app/battle/use-sprite.ts`, `SpriteImage` in `ui.tsx`). The bug: a Pokémon stayed at opacity 0 until its animated GIF finished loading, and some GIFs are big (Tangrowth's back GIF is 193 KB, its front 374 KB), so on a slow connection only the shadow showed (reproduced with a delayed route: both sprites at 0x0, opacity 0 for the whole delay). Now the chain is: your Pokémon = animated back, static back, front view **flipped**, official artwork, placeholder; the opponent = animated front, static front, artwork, placeholder. It is *staged, not sequential*: the first pair (GIF and ~1 KB PNG) load at once, whatever has loaded is shown (the GIF replaces the PNG on arrival), the next tier starts when the newest tier has failed outright or produced nothing after 1.5 s, each probe gives up after 10 s, and until anything loads the placeholder (pulsing) stands in. Loaded sizes are cached for the session. `runChain` takes a probe, so it is pure and tested offline; `tests/fixtures/sprite-availability.json` (from `node scripts/snapshot-sprites.mjs`, ~45 s) says which of the five pictures PokéAPI has for all 673 Gen 1-5 species and formes (all five exist for every one today, so the "missing picture" cases are synthetic: every one of the 32 combinations is tested for 75 species, back and front). `Combatant` also guards against an interrupted switch-in: entry starts at opacity 0.3 (not 0), and 1.8 s after the last cue anything still see-through is put back to opacity 1. Stress test (70 rounds of rapid switching with the Fast toggle flipped, and again with every GIF delayed 3.5 s): no sprite ever below 0.5 opacity or 0 px. Scenarios checked live by routing: healthy, GIFs 8 s late, GIFs 404, GIFs and back PNGs 404, only artwork left, everything 404 (placeholder), GIF and PNG hanging forever (flipped front shows after 1.5 s). **No size jump when the GIF arrives** (`lib/battle/sprite-fit.ts`, `fetchGifSize` in `use-sprite.ts`): while the static PNG stands in, the GIF's size is read from its first ten bytes (a ranged request, cancelled at once; `parseGifSize`) and the PNG's visible part (the alpha scan in `lib/sprite-bounds.ts`, as the Pokédex detail view's `useFitTransform` does) is scaled to fill that box, centred across with its feet on the bottom edge (`fitStaticToBox`), inside a box of exactly the GIF's size, so the swap changes the picture and nothing else. Verified live with a 9 s GIF: the box was 206x170 and 199x149 before and after, at the same position. If the ranged request is blocked the stand-in simply keeps its natural size (the old behaviour, with the jump).
- **Log** (`battle-log.tsx`): follows the newest entry like a chat; scrolling up (more than 24 px from the bottom) stops it and shows "Jump to latest (n new)"; the button or scrolling back down resumes. On phones (below `lg`) `LogOverlay` shows the last three non-header log lines over the bottom of the field (full width under `sm`, left 44 % from `sm`); the player's plate sits above it on phones (`bottom-15`) and the player's feet were raised (`SPOT.p1.y` 82) so neither is covered. Measured: no overlap with the plate at 390 px; hidden at 1280 px.
- **Turn limit** (`lib/battle/turn-limit.ts`, lobby radio Off/30/50/100, remembered in settings): when the `|turn|N+1` line for a limit of N arrives the engine swallows it, reads both teams from `BattleStream.battle.sides`, decides (more Pokémon standing wins; level: higher total HP %, each Pokémon's HP as a percentage of its own maximum summed, fainted = 0; level again: a draw), adds a log line saying why ("Turn limit reached (30). Prince has 3 Pokémon left to CPU (Easy)'s 1, so Prince wins.") and ends the battle with `>forcewin p1|p2` or `>forcetie`. The field chip reads "Turn 21/50" (amber for the last five turns). **The simulator's own protection stays on:** its 1000-turn tie is always on (a test reads the installed simulator's source for it), and every format now has the Endless Battle Clause: National Dex and Gens 1-3 have it in the simulator's own rules, and `formats.ts` adds it (`gen4randombattle@@@Endless Battle Clause` ... `gen9`) to Gens 4-9, whose random-battle rules lack it (checked from the `|rule|` lines of every format; a test checks all ten, with a turn limit set).
- Tests: `tests/sprite-chain.test.ts`, `tests/turn-limit.test.ts`, `tests/move-fx.test.ts` (style per move, iconic ones by name, 18 unique looks, ordering with a deliberate-breakage check, cue contents, and real battles through `sequenceLines`), `tests/music.test.ts` (notation, playback scheduling, ducking), `tests/battle.test.ts` (parsing, ids against the snapshot, National Dex teams, Illusion/Primal/locked-move regressions, 9 full CPU battles across gens 1-9 through the real reducer) and `tests/cpu.test.ts` (scoring rules, switch logic, Normal vs Easy). They add about 8 s (the strength test plays 24 battles). `tests/resolver.mjs` now also gives JSON imports the `type: "json"` attribute Node insists on. Strip-only TypeScript: no parameter properties or enums in code the tests import.
- **Windows gotcha:** PowerShell 5.1 `Get-Content | Set-Content` rewrites UTF-8 files as the ANSI code page (an "é" became an invalid byte and Turbopack refused the file; "▲" became "?"). Edit with the Edit tool or Node, never `Set-Content` on files with non-ASCII text.

## Final review (what was found and fixed)

- **Detail panel wider than the screen at 390 px for a few frames.** Cause, found by recording `scrollWidth` and the offending elements every frame: the static *stand-in* sprite
  (and its silhouette) is scaled up to about x2.3 around its centre by `useFitTransform` so its visible part matches the tight-cropped GIF; its box, invisible padding and all,
  stuck out of the sprite slot and made the panel's scroller scroll sideways for 10-27 frames (up to 535 px wide). Fixes: `ArtLayer` always renders a wrapper (so the image is never
  remounted when the stand-in becomes the GIF) that is `overflow-hidden` only when a fit transform is applied, and the scroller is `overflow-x-hidden` as a backstop.
  Measured per frame on four Pokémon: 0 frames wider than the screen (was 27, 17, 10). Also verified at 320, 360, 390 and 768 px.
- **Drag hint** now reads "Drag onto a card to compare, or into your team", and a completed drag of either kind stops it for the session.
- **Reduced motion audit** (two methods, each with a no-preference control that finds hundreds of hits): running CSS animations (`document.getAnimations()`) and inline-style rewrites per
  element (catches framer-motion's JS animations). Found and fixed: Tailwind `animate-pulse` loading skeletons and the cry button's bars pulsed forever (now `motion-safe:`), hover
  scale/translate on the cry button and evolution stages (`motion-safe:`), the 120 ms scale on drop highlights, and the team panel's height animation (duration 0). Nothing infinite remains.
  Tilt is CSS-only and off. Remaining writes are one-shot (each chip once).
- **Team bar overflowed at 320-360 px** (six fixed 40 px slots): slots now share the width (`flex-1 aspect-square max-w-12`), Clear moves into the panel on narrow screens.
- **Two team changes in the same tick** could overwrite each other (the second read a stale ref): every change goes through `setTeam`, which updates `teamRef` first.
- **Sibling keys** (see Type calculator): distinct keys for siblings keyed by Pokémon id.
- **Dev-console sweep** (every feature on the dev server, all console errors/warnings and failed requests captured): no React warnings, no hydration mismatches.
- **Clean install:** deleted `node_modules` and `.next`, `npm ci` (63 s), `npm run build` and `npm test` all pass; type-check and lint clean. `npm audit --omit=dev`: 0 vulnerabilities;
  the 5 "high" are all in the dev-only ESLint chain (braces via fast-glob via eslint-config-next) and need a major upgrade to fix.
- **Profile** (phone 390x844 at 3x, CPU 4x slower, production build; `perf-all` style harness: trace for compositor fps and raster, in-page rAF recorder for main-thread frames): grid
  flick-scroll p95 17 ms, 0 slow frames; filters, shiny, stage switch, panel scroll, close, ghost-fx settled, team add/panel/drag, compare: p95 17 ms; raster 0-12 ms/s everywhere.
  Opening a view and the evolution sequence have p95 33 ms with a few frames of 50-120 ms (evolution tasks are all under 55 ms). Fixed: opening the detail view ran a 315 ms click task
  (4x), now ~200 ms: the sections below the sprite (type chips, evolution, encounters, cry panel) mount two frames later (`sectionsReady`), and GIF first frames are extracted
  only for reduced motion (that canvas readback blocked the main thread for 120 ms). **Known, not fixed:** the *first* open of each view per page load is cold, about 4x its
  warm cost (detail: 57 ms of layout cold vs 5 warm; compare 107-170 ms vs 8) and it is per view, not shared; opening a different Pokémon is warm. Ruled out by experiment: fonts, symbol fallback glyphs, image decoding, text content. A
  hidden "warm-up" element did not help and was removed. Do not re-add one without measuring.
- **Safari / WebAssembly decoder:** see Cries.

## How things were verified (reuse these methods)

- Browser checks use **Playwright installed outside the project** (a scratch directory), not a dependency.
  Launch Chromium with `--enable-gpu --use-angle=d3d11 --ignore-gpu-blocklist` for realistic GPU behaviour; the
  default (software raster) is a useful pessimistic stand-in for a weak phone GPU.
- **`requestAnimationFrame` timing cannot see raster/compositor cost in headless Chrome** (it read a flat 60fps
  for a deliberately heavy filter). Measure with browser tracing instead: sum `RasterTask` duration and count
  `Display::DrawAndSwap` per second, with `Emulation.setCPUThrottlingRate` for the main thread.
- Always sanity-check a measuring harness with a control that *must* fail before trusting a green result.
- **Find a long frame's cause from the trace, not by guessing:** list the longest `RunTask`s on `CrRendererMain`, then the children of the big `FunctionCall` (Layout, UpdateLayoutTree, readbacks), and the dirty-object count of each Layout. `EventDispatch <click>` containing one huge `FunctionCall` is React's synchronous render.
- **Overflow bugs are per frame:** sample `scrollWidth` and the overflowing elements in a rAF loop through the open animation; checking once after it settles misses them.
- Time-based features (night mode) are tested with Playwright's `page.clock`, crossing the boundary with the page open.
- Pure logic is unit-tested in the project suite `tests/` (`npm test`; Node's built-in runner and TypeScript stripping plus the resolver hook in `tests/resolver.mjs`), against
  saved PokéAPI snapshots, never the live API.
- To prove a test can fail, **mutate the code on purpose** and see `npm test` go red (done for the resolver, table lookup, build script, Japan-edition rule, the type maths,
  radar rounding, the narrow-stage scale, the misspell length rule and the preload cap). A mutant that survives means a test is missing: that is how a "Road N" test gap was found.

## Environment gotchas (Windows, Git Bash tool)

- The Bash tool often rejects heredocs containing apostrophes or large blocks ("unexpected EOF"). Write files with the
  file-writing tool, or write a small `.cjs` patch script and run it with `node`.
- After `git stash pop` / checkout the working copy can have CRLF line endings; normalise (`\r\n` -> `\n`) before
  matching multi-line strings in patch scripts. Patch scripts should be idempotent.
- `next build` and `next dev` write to different dirs (`.next` and `.next/dev`), but stop any server on port 3000
  before rebuilding so you test the build you think you're testing.
