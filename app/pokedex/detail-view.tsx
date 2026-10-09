"use client";

import {
  AnimatePresence,
  animate as tween,
  motion,
  useAnimate,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "framer-motion";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { loadEvolutionChain, loadFlavorText, type EvolutionResult } from "@/app/actions";
import type { EvolutionNode } from "@/lib/evolution";
import { evolvesInto } from "@/lib/evolution-path";
import { stopCry } from "@/lib/cry-audio";
import { firstFrame } from "@/lib/first-frame";
import { measureSpriteBounds } from "@/lib/sprite-bounds";
import { preloadImage } from "@/lib/preload-image";
import type { PokemonSummary } from "@/lib/summary";
import { TYPE_COLORS } from "@/lib/type-colors";
import { measureCard, type CardRects } from "./card-rects";
import { CryPanel } from "./cry-panel";
import { artSet, preloadDetailArt, readArtMode, saveArtMode, type ArtImage, type ArtMode, type ArtSet, type StillImage } from "./art";
import { EVOLVE_REVEAL_S, EvolveFx, Sparkles } from "./evolve-fx";
import { FlavorText } from "./flavor-text";
import { TypeFx, fxKindOf, useFrameGuard } from "./type-fx";

const EASE = [0.22, 1, 0.36, 1] as const;
const OPEN_S = 0.6;
const CLOSE_S = 0.5;
const CONTENT_DELAY_S = 0.3;
const CARD_RADIUS = 16;
const MAX_BASE_STAT = 255;

// Scan reveal: a bar sweeps the sprite top to bottom while the readouts tick up.
const SCAN_S = 1.5;
const SCAN_EASE = [0.45, 0, 0.25, 1] as const;
/** Scan begins just after the sprite lands from the card... */
const OPEN_SCAN_DELAY_S = OPEN_S + 0.05;
/** ...or just after the sprite swaps when moving to another Pokémon. */
const SWITCH_SCAN_DELAY_S = 0.2;
/** After the evolution flash the new silhouette is shown first, then the scan. */
const EVOLVE_SCAN_DELAY_S = EVOLVE_REVEAL_S;
/** The shiny crossfade starts this long after the sparkles, so it lands in the glow. */
const SHINY_FADE_DELAY_S = 0.22;
/** Artwork <-> Animated: a plain crossfade of this length. */
const SWAP_S = 0.25;
/** Entering and leaving states of the art layer. A swap only fades; a new Pokémon also scales a little. */
const ART_SWAP = {
  out: (swap: boolean) => ({ opacity: 0, scale: swap ? 1 : 0.92 }),
  in: { opacity: 1, scale: 1 },
};
/** Length of one idle bob, in seconds (matches .art-bob in globals.css). */
const BOB_S = 2.6;
/** Exit and enter time when moving between Pokémon (each half of a quick swap). */
const SWITCH_S = 0.18;
const READOUT_EASE = [0.16, 1, 0.3, 1] as const;
const STAT_TICK_S = 0.95;
const STAT_STAGGER_S = 0.11;

const STAT_ROWS = [
  { key: "hp", label: "HP" },
  { key: "attack", label: "Attack" },
  { key: "defense", label: "Defense" },
  { key: "specialAttack", label: "Sp. Atk" },
  { key: "specialDefense", label: "Sp. Def" },
  { key: "speed", label: "Speed" },
] as const;

const pretty = (s: string) => s.replace(/-/g, " ");
/** Timeline clock reading (a module-level helper, so event handlers can use it without tripping the render-purity lint). */
const stamp = () => performance.now();
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const decodeImage = (src: string) => {
  const img = new Image();
  img.src = src;
  return img.decode().catch(() => {});
};

const colorOf = (p: PokemonSummary) => TYPE_COLORS[p.types[0]] ?? TYPE_COLORS.unknown;
const color2Of = (p: PokemonSummary) => TYPE_COLORS[p.types[1] ?? p.types[0]] ?? colorOf(p);

// One request per species per page load; failures aren't kept so Retry really retries.
const evolutionRequests = new Map<string, Promise<EvolutionResult>>();
function fetchEvolution(species: string): Promise<EvolutionResult> {
  let request = evolutionRequests.get(species);
  if (!request) {
    request = loadEvolutionChain(species)
      .catch((): EvolutionResult => ({ ok: false, error: "Couldn't reach the server." }))
      .then((result) => {
        if (!result.ok) evolutionRequests.delete(species);
        return result;
      });
    evolutionRequests.set(species, request);
  }
  return request;
}

const flavorRequests = new Map<string, Promise<string | null>>();
function fetchFlavor(species: string): Promise<string | null> {
  let request = flavorRequests.get(species);
  if (!request) {
    request = loadFlavorText(species)
      .catch(() => ({ ok: false as const }))
      .then((result) => {
        if (!result.ok) {
          flavorRequests.delete(species);
          return null;
        }
        return result.text;
      });
    flavorRequests.set(species, request);
  }
  return request;
}

/** Slightly different flicker timing per element, so they don't all blink in unison. */
const flick = (i: number): CSSProperties => ({ ["--fd" as string]: `${5.6 + ((i * 1.3) % 3)}s`, ["--fdl" as string]: `${-(i * 1.7)}s` });

/**
 * Shared clock for the scan and the readouts, so they always start together.
 * Delays are measured from `t0` (when the view opened, or when a stage was clicked) and
 * nothing starts until `go`, i.e. until the artwork can actually be drawn.
 */
interface Timeline {
  t0: number;
  go: boolean;
  reduce: boolean;
}

/** Seconds still to wait before something scheduled `delay` seconds after t0 should start. */
const remaining = (tl: Timeline, delay: number) => Math.max(0, delay - (performance.now() - tl.t0) / 1000);

interface Props {
  /** The Pokémon whose card was clicked. Closing always returns to this card. */
  pokemon: PokemonSummary;
  /** Where that card was on screen when clicked; the view grows out of this. */
  origin: CardRects;
  /** Maps an evolution-chain species to the Pokémon to show for it. */
  resolveSpecies: (species: string) => PokemonSummary | undefined;
  /** Called once the closing animation has finished. */
  onClosed: () => void;
}

export function DetailView({ pokemon: original, origin, resolveSpecies, onClosed }: Props) {
  const [scope, animate] = useAnimate<HTMLDivElement>();
  const slotRef = useRef<HTMLDivElement>(null);
  const spriteRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const closing = useRef(false);
  const started = useRef(false);
  const requestCloseRef = useRef<() => void>(() => {});
  const reduceMotion = useReducedMotion() ?? false;

  // `current` is what's shown; `original` stays the card we return to.
  const [current, setCurrent] = useState(original);
  type SwitchKind = "open" | "quick" | "evolve";
  const delayOf = (kind: SwitchKind | "swap") => (kind === "evolve" ? EVOLVE_SCAN_DELAY_S : kind === "quick" ? SWITCH_SCAN_DELAY_S : OPEN_SCAN_DELAY_S);
  // The readouts restart when the Pokémon changes; the scan also restarts when only the image style changes.
  const [switchKind, setSwitchKind] = useState<SwitchKind>("open");
  // "swap": only the image style changed (Artwork <-> Animated): a quick crossfade, no scan.
  const [artKind, setArtKind] = useState<SwitchKind | "swap">("open");
  const scanDelay = delayOf(switchKind);
  // Artwork or animated sprites; remembered for the browser session.
  const [mode, setMode] = useState<ArtMode>(readArtMode);
  // Animated sprites that failed to load (PokéAPI lists a few that 404): treated as missing.
  const [broken, setBroken] = useState<ReadonlySet<string>>(() => new Set());
  // Animated sprites that have finished loading. Until then the static pixel sprite stands in for them,
  // so the scan never waits on a GIF.
  const [liveGifs, setLiveGifs] = useState<ReadonlySet<string>>(() => new Set());
  const art = artSet(current, mode, broken);
  const artKey = `${current.id}:${art.base.src}`;
  // Shiny stays on while moving along the chain (when the next form has a shiny version).
  const [shiny, setShiny] = useState(false);
  const [burst, setBurst] = useState(0);
  const showShiny = shiny && art.shiny !== null;
  // Set while the evolution sequence plays; stage clicks are ignored until it ends.
  const [evo, setEvo] = useState<{ from: StillImage; to: StillImage; target: PokemonSummary } | null>(null);
  const [t0, setT0] = useState(() => performance.now());
  const [artT0, setArtT0] = useState(t0);
  const [readyId, setReadyId] = useState<number | null>(null);
  const [readyArt, setReadyArt] = useState<string | null>(null);
  const timeline: Timeline = { t0, go: readyId === current.id, reduce: reduceMotion };
  const artTimeline: Timeline = { t0: artT0, go: readyArt === artKey, reduce: reduceMotion };

  // Pokédex entry for whichever Pokémon is showing. undefined = still loading.
  const [flavors, setFlavors] = useState<Record<string, string | null>>({});
  useEffect(() => {
    let live = true;
    fetchFlavor(current.species).then((text) => {
      if (live) setFlavors((prev) => ({ ...prev, [current.species]: text }));
    });
    return () => {
      live = false;
    };
  }, [current.species]);
  const flavor = flavors[current.species];

  // Type-themed background effects. They start once the open animation has finished (so the
  // flight stays smooth) and switch themselves off if the device can't keep up.
  const fxKind = fxKindOf(current.types[0]);
  const [fxOn, setFxOn] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setFxOn(true), reduceMotion ? 0 : OPEN_S * 1000 + 150);
    return () => clearTimeout(timer);
  }, [reduceMotion]);
  const dropFx = useCallback(() => setFxOn(false), []);
  useFrameGuard(fxOn && !reduceMotion, dropFx);

  // The scan and the readouts wait for a still image to be decoded: the artwork, or for an animated sprite
  // the static pixel sprite that stands in for it (already on screen on the card, so effectively instant).
  // The GIF itself is never waited for: it replaces the stand-in when it arrives.
  const baseSrc = art.base.src;
  const baseAnimated = art.base.animated;
  const gateSrc = art.base.animated ? art.base.fallback.src : art.base.src;
  const shinySrc = art.shiny?.src ?? null;
  useEffect(() => {
    let alive = true;
    const decode = (src: string) => {
      const img = new Image();
      img.src = src;
      return img.decode().then(
        () => true,
        () => false,
      );
    };
    Promise.race([decode(gateSrc), sleep(2500)]).then(() => {
      if (!alive) return;
      setReadyId(current.id);
      setReadyArt(`${current.id}:${baseSrc}`);
      // Warm the shiny image too, so the toggle can start its sparkles and crossfade at once.
      preloadImage(shinySrc);
    });
    if (baseAnimated) {
      decode(baseSrc).then((ok) => {
        if (!alive) return;
        if (ok) setLiveGifs((prev) => new Set(prev).add(baseSrc));
        else setBroken((prev) => new Set(prev).add(baseSrc)); // missing: the static sprite stays (with its bob)
      });
    }
    return () => {
      alive = false;
    };
  }, [current.id, baseSrc, baseAnimated, gateSrc, shinySrc]);

  const color = colorOf(current);
  const name = pretty(current.name);

  // The panel starts exactly over the card and grows to full screen.
  const [start] = useState(() => ({
    top: origin.card.top,
    left: origin.card.left,
    right: window.innerWidth - origin.card.right,
    bottom: window.innerHeight - origin.card.bottom,
  }));

  // ---- Scroll lock ----
  // The page reserves a scrollbar gutter (globals.css) so the layout never jumps. Swap that
  // gutter for equal padding while locked: the grid stays put and the fixed overlay can
  // cover the full window width. Runs before paint so the first frame is already correct.
  useLayoutEffect(() => {
    const html = document.documentElement;
    const previous = { overflow: html.style.overflow, gutter: html.style.scrollbarGutter, padding: html.style.paddingRight };
    const reserved = window.innerWidth - html.clientWidth;
    html.style.scrollbarGutter = "auto";
    html.style.overflow = "hidden";
    html.style.paddingRight = `${reserved}px`;
    return () => {
      html.style.overflow = previous.overflow;
      html.style.scrollbarGutter = previous.gutter;
      html.style.paddingRight = previous.padding;
    };
  }, []);

  // ---- Open: card -> full screen, sprite flies to its slot, pixel -> silhouette ----
  useLayoutEffect(() => {
    const slot = slotRef.current;
    if (started.current || !slot) return;
    started.current = true;

    const slotRect = slot.getBoundingClientRect();
    if (reduceMotion) {
      animate("[data-d=panel]", { top: 0, left: 0, right: 0, bottom: 0, borderRadius: 0, opacity: 1 }, { duration: 0 });
      animate("[data-d=sprite]", { opacity: 1 }, { duration: 0.2 });
      animate("[data-d=px]", { opacity: 0 }, { duration: 0 });
      animate("[data-d=art]", { opacity: 1 }, { duration: 0 });
      animate("[data-d=tint]", { opacity: 1 }, { duration: 0.2 });
      animate("[data-d=content], [data-d=chrome]", { opacity: 1, y: 0 }, { duration: 0.2 });
      return;
    }

    animate(
      "[data-d=panel]",
      { top: [start.top, 0], left: [start.left, 0], right: [start.right, 0], bottom: [start.bottom, 0], borderRadius: [CARD_RADIUS, 0] },
      { duration: OPEN_S, ease: EASE },
    );
    animate("[data-d=panel]", { opacity: [0, 1] }, { duration: 0.15 });

    // Sprite: start at the card sprite's rectangle, end at the slot (identity transform).
    const fromX = origin.sprite.left - slotRect.left;
    const fromY = origin.sprite.top - slotRect.top;
    const fromScale = origin.sprite.width / slotRect.width;
    if (spriteRef.current) spriteRef.current.style.transform = `translateX(${fromX}px) translateY(${fromY}px) scale(${fromScale})`;
    animate("[data-d=sprite]", { x: [fromX, 0], y: [fromY, 0], scale: [fromScale, 1] }, { duration: OPEN_S, ease: EASE });
    animate("[data-d=sprite]", { opacity: [0, 1] }, { duration: 0.12 });
    // The card's pixel sprite upgrades to the artwork (a silhouette until the scan) while it flies.
    animate("[data-d=px]", { opacity: [1, 0] }, { duration: 0.35, delay: 0.12 });
    animate("[data-d=art]", { opacity: [0, 1] }, { duration: 0.35, delay: 0.12 });

    animate("[data-d=tint]", { opacity: [0, 1] }, { duration: 0.9, delay: 0.1 });
    animate("[data-d=content], [data-d=chrome]", { opacity: [0, 1], y: [14, 0] }, { duration: 0.4, delay: CONTENT_DELAY_S });
  }, [animate, origin, reduceMotion, start]);

  // ---- Close: reverse everything, back to wherever the original card is *now* ----
  const requestClose = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    stopCry();

    // Re-measure: the grid may have been scrolled, resized or re-filtered since opening.
    const rects = measureCard(original.id);
    const slot = slotRef.current?.getBoundingClientRect();
    const animations: { finished: Promise<unknown> }[] = [];

    animations.push(animate("[data-d=content], [data-d=chrome]", { opacity: 0, y: 8 }, { duration: 0.18 }));
    animations.push(animate("[data-d=fx]", { opacity: 0 }, { duration: 0.2 }));

    if (rects && slot && !reduceMotion) {
      const { card, sprite } = rects;
      animations.push(
        animate(
          "[data-d=panel]",
          {
            top: card.top,
            left: card.left,
            right: window.innerWidth - card.right,
            bottom: window.innerHeight - card.bottom,
            borderRadius: CARD_RADIUS,
          },
          { duration: CLOSE_S, ease: EASE },
        ),
        animate("[data-d=panel]", { opacity: 0 }, { duration: 0.15, delay: CLOSE_S - 0.15 }),
        animate(
          "[data-d=sprite]",
          { x: sprite.left - slot.left, y: sprite.top - slot.top, scale: sprite.width / slot.width },
          { duration: CLOSE_S, ease: EASE },
        ),
        animate("[data-d=sprite]", { opacity: 0 }, { duration: 0.1, delay: CLOSE_S - 0.1 }),
        // The pixel layer always holds the *original* card's sprite, so even after moving
        // along an evolution chain the flight lands as the card's own sprite.
        animate("[data-d=px]", { opacity: 1 }, { duration: 0.3 }),
        animate("[data-d=art]", { opacity: 0 }, { duration: 0.3 }),
        animate("[data-d=tint]", { opacity: 0 }, { duration: CLOSE_S, ease: EASE }),
      );
    } else {
      // Card isn't on screen (or reduced motion): a plain fade, nothing flies.
      animations.push(
        animate("[data-d=panel], [data-d=sprite], [data-d=tint]", { opacity: 0 }, { duration: reduceMotion ? 0.15 : 0.3 }),
      );
    }

    Promise.all(animations.map((a) => a.finished)).then(onClosed);
  }, [animate, onClosed, original.id, reduceMotion]);

  useEffect(() => {
    requestCloseRef.current = requestClose;
  }, [requestClose]);

  // ---- Esc, focus trap and focus return ----
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    closeButtonRef.current?.focus({ preventScroll: true });

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        requestCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || !scope.current) return;
      // Keep Tab inside the view.
      const focusable = Array.from(scope.current.querySelectorAll<HTMLElement>("button:not([disabled])"));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !scope.current.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !scope.current.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      opener?.focus?.({ preventScroll: true });
    };
  }, [scope]);

  // ---- Evolution chain (fetched on demand, cached on the server) ----
  // Every stage the user can click belongs to this same chain, so it is fetched once for
  // the original Pokémon and stays put while the rest of the view changes.
  const [evolution, setEvolution] = useState<EvolutionResult | "loading">("loading");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    fetchEvolution(original.species).then((result) => {
      if (live) setEvolution(result);
    });
    return () => {
      live = false;
    };
  }, [original.species, attempt]);
  const retryEvolution = () => {
    setEvolution("loading");
    setAttempt((n) => n + 1);
  };

  const commitSwitch = (target: PokemonSummary, kind: "quick" | "evolve") => {
    const now = stamp();
    setSwitchKind(kind);
    setArtKind(kind);
    setT0(now);
    setArtT0(now);
    setCurrent(target);
  };

  // The button reflects the choice at once; the picture follows as soon as the new one is decoded.
  const [wantedMode, setWantedMode] = useState<ArtMode | null>(null);
  const modeRequest = useRef(0);
  const chooseMode = (next: ArtMode) => {
    if (next === (wantedMode ?? mode) || evo || closing.current) return;
    const request = ++modeRequest.current;
    setWantedMode(next);
    saveArtMode(next);
    preloadDetailArt(current, next);
    // Only the picture changes: once the new one is decoded (waiting a moment at most) it crossfades in,
    // with no scan or silhouette, and the numbers stay put.
    const incoming = artSet(current, next, broken).base;
    const img = new Image();
    img.src = incoming.src;
    Promise.race([img.decode().then(() => true, () => false), sleep(700)]).then((ok) => {
      if (request !== modeRequest.current || closing.current) return; // a newer click took over
      if (ok && incoming.animated) setLiveGifs((prev) => new Set(prev).add(incoming.src));
      setArtKind("swap");
      setMode(next);
      setWantedMode(null);
    });
  };

  const selectStage = (target: PokemonSummary) => {
    if (closing.current || evo || starting.current || target.id === current.id) return;
    preloadDetailArt(target, mode);
    stopCry();
    // Moving *forward* in the chain plays the evolution sequence; going back (or sideways) is the quick switch.
    const forward = evolution !== "loading" && evolution.ok && evolvesInto(evolution.chain, current.species, target.species);
    if (forward && !reduceMotion) {
      const next = artSet(target, mode, broken);
      const nextArt = shiny && next.shiny ? next.shiny : next.base;
      preloadDetailArt(target, mode);
      preloadImage(nextArt.src);
      startEvolution(showShiny && art.shiny ? art.shiny : art.base, nextArt, target);
      return;
    }
    commitSwitch(target, "quick");
  };

  // The white silhouettes are static: an animated sprite is frozen to its first frame first, so the pulsing
  // never runs a filter on every animation frame. (Cached by then, so this is normally instant.)
  const starting = useRef(false);
  const startEvolution = (from: ArtImage, to: ArtImage, target: PokemonSummary) => {
    if (starting.current) return;
    starting.current = true;
    const still = (img: ArtImage): Promise<StillImage> =>
      img.animated
        ? Promise.race([firstFrame(img.src), sleep(1500).then(() => null)]).then((url) => (url ? { src: url, pixelated: img.pixelated } : { src: img.src, pixelated: img.pixelated }))
        : Promise.resolve({ src: img.src, pixelated: img.pixelated });
    Promise.all([still(from), still(to)]).then(([f, t]) => {
      starting.current = false;
      if (!closing.current) setEvo({ from: f, to: t, target });
    });
  };

  const toggleShiny = () => {
    if (evo) return;
    setShiny(!shiny);
    if (!reduceMotion) setBurst((n) => n + 1);
  };

  const total = Object.values(current.stats).reduce((sum, v) => sum + v, 0);

  return (
    <div ref={scope} role="dialog" aria-modal="true" aria-label={name} data-type={current.types[0]} className="fixed inset-0 z-40">
      {/* The card's own look, grown to fill the screen. */}
      <div
        data-d="panel"
        className="fixed overflow-hidden border"
        style={{
          ...start,
          opacity: 0,
          borderRadius: CARD_RADIUS,
          borderColor: `color-mix(in srgb, ${colorOf(original)} 55%, transparent)`,
          background: `radial-gradient(120% 75% at 50% 28%, color-mix(in srgb, ${colorOf(original)} 42%, #0d1117) 0%, #0d1117 72%)`,
        }}
      />
      {/* Background shifts to the Pokémon's type colours, and again when you move along the chain. */}
      <div data-d="tint" className="pointer-events-none fixed inset-0" style={{ opacity: 0 }}>
        <AnimatePresence initial={false}>
          <motion.div
            key={current.id}
            className="absolute inset-0"
            style={{
              background: `radial-gradient(70% 55% at 30% 40%, color-mix(in srgb, ${color} 45%, transparent), transparent 70%), linear-gradient(135deg, color-mix(in srgb, ${color} 38%, #0a0e13) 0%, color-mix(in srgb, ${color2Of(current)} 32%, #0a0e13) 100%)`,
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            // Keep the old layer (essentially) opaque underneath until the new one has faded in. The exit
            // target must differ from 1 or the animation finishes instantly and the layer vanishes.
            exit={{ opacity: 0.99, transition: { duration: 0.5 } }}
            transition={{ duration: 0.5 }}
          />
        </AnimatePresence>
      </div>

      {/* Type effects: background only, under the content. Crossfades when the type changes. */}
      <div data-d="fx" className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
        <AnimatePresence initial>
          {fxOn && (
            <motion.div
              key={fxKind}
              className="absolute inset-0"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.6 }}
            >
              <TypeFx kind={fxKind} reduce={reduceMotion} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div
        className="absolute inset-0 overflow-y-auto overscroll-contain"
        onClick={(e) => {
          if (e.target === e.currentTarget || (e.target as HTMLElement).dataset.dismiss) requestClose();
        }}
      >
        <div
          data-dismiss="true"
          className="mx-auto grid min-h-full max-w-5xl content-center items-start gap-8 px-6 py-20 md:grid-cols-[auto_minmax(0,1fr)] md:gap-14"
        >
          {/* Left column stays in view while a long evolution tree scrolls. */}
          <div className="mx-auto flex w-[min(78vw,50vh,440px)] flex-col gap-4 md:sticky md:top-20">
          {/* Sprite slot: the flying sprite lands here. */}
          <div ref={slotRef} className="relative aspect-square w-full">
            <div ref={spriteRef} data-d="sprite" className="absolute inset-0 origin-top-left" style={{ opacity: 0 }}>
              {/* Always the original card's sprite: only used for the flight in and back out. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                data-d="px"
                src={original.sprite}
                alt=""
                draggable={false}
                className={`absolute inset-0 h-full w-full object-contain ${original.pixel ? "[image-rendering:pixelated]" : ""}`}
              />
              <div data-d="art" className="absolute inset-0" style={{ opacity: 0 }}>
                <AnimatePresence mode={artKind === "swap" ? "sync" : "wait"} initial={false} custom={artKind === "swap"}>
                  <motion.div
                    key={artKey}
                    custom={artKind === "swap"}
                    className="absolute inset-0"
                    variants={ART_SWAP}
                    initial="out"
                    animate="in"
                    exit="out"
                    transition={{ duration: artKind === "swap" ? SWAP_S : SWITCH_S }}
                  >
                    <ScanArt
                      name={name}
                      art={art}
                      color={color}
                      startDelay={delayOf(artKind)}
                      timeline={artTimeline}
                      shiny={showShiny}
                      burst={burst}
                      scan={artKind !== "swap"}
                      live={!art.base.animated || liveGifs.has(art.base.src)}
                    />
                  </motion.div>
                </AnimatePresence>
                {evo && (
                  <EvolveFx
                    from={evo.from}
                    to={evo.to}
                    color={color}
                    onSwap={() => {
                      if (!closing.current) commitSwitch(evo.target, "evolve");
                    }}
                    onDone={() => setEvo(null)}
                  />
                )}
              </div>
            </div>
          </div>

          {/* Fades in with the rest of the content (data-d="chrome"). Remounts per Pokémon. */}
          <div data-d="chrome" className="flex flex-col gap-4" style={{ opacity: 0 }}>
            <div role="group" aria-label="Image style" className="mx-auto flex rounded-full border border-white/25 bg-black/30 p-0.5 text-sm font-semibold">
              {(["artwork", "animated"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={(wantedMode ?? mode) === m}
                  onClick={() => chooseMode(m)}
                  onPointerEnter={() => preloadDetailArt(current, m)}
                  onFocus={() => preloadDetailArt(current, m)}
                  className="rounded-full px-3.5 py-1 capitalize text-white/70 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300 aria-pressed:bg-white/20 aria-pressed:text-white"
                >
                  {m}
                </button>
              ))}
            </div>
            {mode === "animated" && !art.base.animated && (
              <p className="-mt-2 text-center text-xs text-white/60">No animated sprite for this form: static sprite with an idle bob.</p>
            )}
            {art.shiny && (
              <button
                type="button"
                aria-pressed={showShiny}
                onClick={toggleShiny}
                onPointerEnter={() => preloadImage(art.shiny?.src ?? null)}
                onFocus={() => preloadImage(art.shiny?.src ?? null)}
                className="mx-auto flex items-center gap-2 rounded-full border border-white/25 bg-black/30 px-4 py-1.5 text-sm font-semibold text-white hover:bg-black/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300 aria-pressed:border-amber-200/70 aria-pressed:bg-amber-200/15 aria-pressed:text-amber-100"
              >
                <span aria-hidden>✦</span> Shiny
              </button>
            )}
            <CryPanel key={current.id} url={current.cry} color={color} name={name} reduceMotion={reduceMotion} />
          </div>
          </div>

          <div data-d="content" data-dismiss="" className="min-w-0 space-y-7" style={{ opacity: 0 }}>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={current.id}
                className="space-y-7"
                initial={{ opacity: 0, x: 18 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -18 }}
                transition={{ duration: SWITCH_S }}
              >
                <header>
                  <p className="fx-flick font-mono text-sm text-white/70" style={flick(0)}>
                    #{String(current.number).padStart(4, "0")}
                  </p>
                  <h2 className="mt-1 text-4xl font-bold capitalize tracking-tight text-white md:text-5xl">{name}</h2>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {current.types.map((t) => (
                      <span
                        key={t}
                        className="rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide text-black/80"
                        style={{ background: TYPE_COLORS[t] ?? TYPE_COLORS.unknown }}
                      >
                        {t}
                      </span>
                    ))}
                    {current.tag && (
                      <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white">
                        {current.tag}
                      </span>
                    )}
                  </div>
                </header>

                {/* Only this text is ever misspelled by the Ghost theme; the name and stats never are. */}
                {flavor !== null && (
                  <section aria-label="Pokédex entry" className="min-h-[3.75rem]">
                    {flavor === undefined ? (
                      <div role="status" aria-label="Loading Pokédex entry" className="space-y-2 pt-1">
                        <div className="h-3 w-full animate-pulse rounded bg-white/10" />
                        <div className="h-3 w-4/5 animate-pulse rounded bg-white/10" />
                      </div>
                    ) : (
                      <FlavorText text={flavor} ghost={fxKind === "ghost" && !reduceMotion} />
                    )}
                  </section>
                )}

                <section aria-label="Base stats">
                  <h3 className="fx-flick mb-2 text-xs font-semibold uppercase tracking-widest text-white/70" style={flick(1)}>Base stats</h3>
                  <ul className="space-y-1.5">
                    {STAT_ROWS.map(({ key, label }, i) => (
                      <StatRow
                        key={key}
                        label={label}
                        value={current.stats[key]}
                        color={color}
                        delay={scanDelay + i * STAT_STAGGER_S}
                        timeline={timeline}
                      />
                    ))}
                    <li className="grid grid-cols-[4.5rem_2.25rem_1fr] items-center gap-3 border-t border-white/15 pt-1.5 text-sm">
                      <span className="text-white/75">Total</span>
                      <span className="font-mono tabular-nums text-white">
                        <Readout value={total} delay={scanDelay + 0.5} duration={STAT_TICK_S} timeline={timeline} />
                      </span>
                    </li>
                  </ul>
                </section>

                <div className="grid gap-6 sm:grid-cols-2">
                  <section aria-label="Abilities">
                    <h3 className="fx-flick mb-2 text-xs font-semibold uppercase tracking-widest text-white/70" style={flick(2)}>Abilities</h3>
                    <ul className="flex flex-wrap gap-2">
                      {current.abilities.length === 0 && <li className="text-sm text-white/60">None listed</li>}
                      {current.abilities.map((a) => (
                        <li
                          key={a.name}
                          className="rounded-lg border border-white/20 bg-black/25 px-2.5 py-1 text-sm capitalize text-white"
                        >
                          {pretty(a.name)}
                          {a.hidden && <span className="ml-1.5 text-[10px] uppercase tracking-wider text-white/60">Hidden</span>}
                        </li>
                      ))}
                    </ul>
                  </section>
                  <section aria-label="Size">
                    <h3 className="fx-flick mb-2 text-xs font-semibold uppercase tracking-widest text-white/70" style={flick(3)}>Size</h3>
                    <dl className="grid grid-cols-2 gap-2 text-sm">
                      <div className="rounded-lg border border-white/20 bg-black/25 px-3 py-1.5">
                        <dt className="text-[10px] uppercase tracking-wider text-white/60">Height</dt>
                        <dd className="font-mono text-white">
                          <Readout value={current.height / 10} decimals={1} delay={scanDelay + 0.1} duration={1.1} timeline={timeline} /> m
                        </dd>
                      </div>
                      <div className="rounded-lg border border-white/20 bg-black/25 px-3 py-1.5">
                        <dt className="text-[10px] uppercase tracking-wider text-white/60">Weight</dt>
                        <dd className="font-mono text-white">
                          <Readout value={current.weight / 10} decimals={1} delay={scanDelay + 0.1} duration={1.1} timeline={timeline} /> kg
                        </dd>
                      </div>
                    </dl>
                  </section>
                </div>
              </motion.div>
            </AnimatePresence>

            {/* Outside the swapping block, so it (and keyboard focus on a stage) survives a switch. */}
            <section aria-label="Evolution chain">
              <h3 className="fx-flick mb-2 text-xs font-semibold uppercase tracking-widest text-white/70" style={flick(4)}>Evolution</h3>
              <EvolutionSection
                state={evolution}
                current={current}
                accent={color}
                resolveSpecies={resolveSpecies}
                onSelect={selectStage}
                onRetry={retryEvolution}
              />
            </section>
          </div>
        </div>
      </div>

      <button
        data-d="chrome"
        ref={closeButtonRef}
        type="button"
        onClick={requestClose}
        aria-label="Close"
        className="fixed right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-xl leading-none text-white hover:bg-black/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300"
        style={{ opacity: 0 }}
      >
        ×
      </button>
    </div>
  );
}

/**
 * A CSS transform that scales a padded pixel sprite so its visible part fills the slot the way a GIF
 * (which is cropped tight to the creature) does. The static sprite stands in while a GIF loads, and without
 * this it would be drawn much smaller and then jump when the GIF replaced it. Undefined until measured.
 */
function useFitTransform(src: string | null): string | undefined {
  const [result, setResult] = useState<{ src: string; transform: string } | null>(null);
  useEffect(() => {
    if (!src) return;
    let alive = true;
    measureSpriteBounds(src)
      .then((b) => {
        if (!alive || !b.measured) return;
        const big = Math.max(b.naturalWidth, b.naturalHeight);
        const k = big / Math.max(b.right - b.left, b.bottom - b.top);
        const dx = (-((b.left + b.right) / 2 - b.naturalWidth / 2) / big) * 100;
        const dy = (-((b.top + b.bottom) / 2 - b.naturalHeight / 2) / big) * 100;
        setResult({ src, transform: `scale(${k.toFixed(3)}) translate(${dx.toFixed(2)}%, ${dy.toFixed(2)}%)` });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [src]);
  return result?.src === src ? result.transform : undefined;
}

/**
 * The first frame of an animated image: `undefined` while it is being extracted, `null` if it can't be
 * (callers then fall back), and the still image's URL otherwise. Not animated: always `null`.
 */
function useStill(img: ArtImage | null): string | null | undefined {
  const src = img?.animated ? img.src : null;
  const [result, setResult] = useState<{ src: string; still: string | null } | null>(null);
  useEffect(() => {
    if (!src) return;
    let alive = true;
    firstFrame(src).then((still) => {
      if (alive) setResult({ src, still });
    });
    return () => {
      alive = false;
    };
  }, [src]);
  if (!src) return null;
  return result?.src === src ? result.still : undefined;
}

/**
 * One image in the sprite slot. Static sprites standing in for a missing animation get the idle bob;
 * every bobbing layer is phase-aligned to the wall clock, so layers mounted at different times
 * (the normal image, the silhouette, the shiny image) still move together.
 */
function ArtLayer({
  src,
  pixelated,
  bob,
  reduce,
  className = "",
  style,
  alt = "",
  layer,
  fit,
}: {
  src: string;
  pixelated: boolean;
  bob: boolean;
  reduce: boolean;
  className?: string;
  style?: CSSProperties;
  alt?: string;
  layer: string;
  /** A transform that enlarges the visible part of a padded sprite (see useFitTransform). */
  fit?: string;
}) {
  const [phase] = useState(() => (performance.now() / 1000) % BOB_S);
  const bobbing = bob && !reduce;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      data-s={layer}
      src={src}
      alt={alt}
      draggable={false}
      className={`absolute inset-0 h-full w-full object-contain ${pixelated ? "[image-rendering:pixelated]" : ""} ${bobbing ? "art-bob" : ""} ${className}`}
      style={bobbing ? { ...style, animationDelay: `-${phase}s` } : fit ? { ...style, transform: fit } : style}
    />
  );
}

/**
 * The image as a dark silhouette, resolved top to bottom by a glowing scan bar.
 * Remounted (via key) for each Pokémon and image style so the reveal replays.
 *
 * Animated sprites play inside the reveal. The silhouette and, under reduced motion, the whole
 * image use the sprite's first frame instead, so nothing filtered ever animates and reduced
 * motion really does pause.
 */
function ScanArt({
  name,
  art,
  color,
  startDelay,
  timeline,
  shiny,
  burst,
  scan,
  live,
}: {
  name: string;
  art: ArtSet;
  color: string;
  startDelay: number;
  timeline: Timeline;
  shiny: boolean;
  /** Counts shiny toggles; each change plays a sparkle burst. 0 = none yet. */
  burst: number;
  /** False when only the image style changed: the image is simply there, with no silhouette or scan. */
  scan: boolean;
  /** False while an animated sprite is still loading: its static stand-in is drawn until then. */
  live: boolean;
}) {
  const { reduce, go } = timeline;
  const [scope, animate] = useAnimate<HTMLDivElement>();
  const { base } = art;
  const shinyArt = art.shiny;

  const baseStill = useStill(base);
  const shinyStill = useStill(shinyArt);
  /** What to draw for an image: itself, or (paused for reduced motion) its first frame. */
  const visible = (img: ArtImage, still: string | null | undefined): (StillImage & { bob: boolean }) | null => {
    if (!img.animated) return img;
    // Not loaded yet: the static sprite stands in, and the GIF replaces it on arrival.
    if (!reduce) return live ? img : { ...img.fallback, bob: false };
    // Reduced motion: paused on the first frame (the static sprite until that has been extracted).
    return { ...(still ? { src: still, pixelated: img.pixelated } : img.fallback), bob: false };
  };
  const standInFit = useFitTransform(base.animated ? base.fallback.src : null);
  const baseShown = visible(base, baseStill);
  const shinyShown = shinyArt ? visible(shinyArt, shinyStill) : null;
  // Silhouette: the first frame of an animated sprite once extracted; until then (or if it can't be) the
  // static sprite, so the scan never waits for it.
  const silImage: StillImage = base.animated ? (baseStill ? { src: baseStill, pixelated: base.pixelated } : base.fallback) : base;
  const silSrc = silImage.src;

  // The shiny image only exists once it has been wanted, and is crossfaded over the normal one.
  // Its starting opacity is fixed at mount (a stable style prop) so React never fights the animation.
  const [startedShiny] = useState(shiny);
  const lastShiny = useRef(shiny);
  const [armed, setArmed] = useState(shiny);
  if (shiny && !armed) setArmed(true);
  const shinySrc = shinyArt?.src ?? null;
  useEffect(() => {
    if (lastShiny.current === shiny) return;
    lastShiny.current = shiny;
    const target = shiny ? 1 : 0;
    // Only one of the two layers is ever visible once the fade is over (the other would just
    // animate unseen behind it, and show at the edges where the two sprites differ).
    if (reduce) {
      animate("[data-s=shiny]", { opacity: target }, { duration: 0 });
      animate("[data-s=base]", { opacity: 1 - target }, { duration: 0 });
      return;
    }
    let alive = true;
    let running: { stop: () => void; finished: Promise<unknown> } | undefined;
    const began = performance.now();
    const ready = shiny && shinySrc ? Promise.race([decodeImage(shinySrc), sleep(1200)]) : Promise.resolve();
    ready.then(() => {
      if (!alive) return;
      if (!shiny) animate("[data-s=base]", { opacity: 1 }, { duration: 0 });
      const wait = Math.max(0, SHINY_FADE_DELAY_S - (performance.now() - began) / 1000);
      running = animate("[data-s=shiny]", { opacity: target }, { duration: 0.5, delay: wait, ease: "easeInOut" });
      running.finished.then(() => {
        if (alive && shiny) animate("[data-s=base]", { opacity: 0 }, { duration: 0 });
      });
    });
    return () => {
      alive = false;
      running?.stop();
    };
  }, [animate, scope, shiny, shinySrc, reduce]);

  // The silhouette exists only until the reveal has finished; after that nothing but the real image remains.
  // (An animated sprite's silhouette needs its first frame extracted, so it can appear a moment after
  // the image is ready: the scan waits for it, and the layer is removed rather than merely faded.)
  const [revealDone, setRevealDone] = useState(false);
  const { t0 } = timeline;
  useEffect(() => {
    // Reduced motion: straight to the final, fully revealed state. Otherwise wait for the image.
    if (reduce || !go || !scan) return;
    let alive = true;
    const delay = remaining({ t0, go, reduce }, startDelay);
    const running = [
      animate("[data-s=full]", { clipPath: ["inset(0 0 100% 0)", "inset(0 0 0% 0)"] }, { duration: SCAN_S, delay, ease: SCAN_EASE }),
      animate("[data-s=bar]", { top: ["0%", "100%"] }, { duration: SCAN_S, delay, ease: SCAN_EASE }),
      animate("[data-s=bar]", { opacity: [0, 1, 1, 0] }, { duration: SCAN_S, delay, ease: "linear", times: [0, 0.06, 0.94, 1] }),
      animate("[data-s=sil]", { opacity: 0 }, { duration: 0.25, delay: delay + SCAN_S }),
    ];
    Promise.all(running.map((a) => a.finished)).then(() => {
      if (alive) setRevealDone(true);
    });
    return () => {
      alive = false;
      running.forEach((a) => a.stop());
    };
  }, [animate, reduce, go, scan, t0, startDelay]);

  const shadow = "drop-shadow-[0_18px_24px_rgba(0,0,0,0.45)]";
  return (
    <div ref={scope} className="absolute inset-0">
      {!reduce && scan && !revealDone && (
        <ArtLayer
          layer="sil"
          fit={base.animated && silSrc === base.fallback.src ? standInFit : undefined}
          src={silSrc}
          pixelated={silImage.pixelated}
          bob={base.bob}
          reduce={reduce}
          style={{ filter: `brightness(0) drop-shadow(0 0 10px ${color}aa)` }}
        />
      )}
      {/* The scan clips this wrapper, so the shiny image is revealed by the scan too. */}
      <div data-s="full" className="absolute inset-0" style={{ clipPath: reduce || !scan ? undefined : "inset(0 0 100% 0)" }}>
        {baseShown && (
          <ArtLayer
            layer="base"
            fit={base.animated && baseShown.src === base.fallback.src ? standInFit : undefined}
            src={baseShown.src}
            pixelated={baseShown.pixelated}
            bob={baseShown.bob}
            reduce={reduce}
            className={shadow}
            style={{ opacity: startedShiny ? 0 : 1 }}
            alt={name + (shiny ? " (shiny)" : "")}
          />
        )}
        {armed && shinyShown && (
          <ArtLayer
            layer="shiny"
            src={shinyShown.src}
            pixelated={shinyShown.pixelated}
            bob={shinyShown.bob}
            reduce={reduce}
            className={shadow}
            style={{ opacity: startedShiny ? 1 : 0 }}
          />
        )}
      </div>
      {burst > 0 && !reduce && <Sparkles key={burst} />}
      {!reduce && scan && (
        <div
          data-s="bar"
          aria-hidden
          className="pointer-events-none absolute inset-x-[-6%] h-0.75 -translate-y-1/2"
          style={{
            top: "0%",
            opacity: 0,
            background: `linear-gradient(90deg, transparent, ${color}, #fff, ${color}, transparent)`,
            boxShadow: `0 0 14px 4px ${color}, 0 0 40px 10px color-mix(in srgb, ${color} 55%, transparent)`,
          }}
        >
          <span
            className="absolute inset-x-[6%] bottom-full h-16"
            style={{
              background: `linear-gradient(to bottom, transparent, color-mix(in srgb, ${color} 30%, transparent))`,
              // Feather the sides so the trail has no hard rectangular edges.
              maskImage: "linear-gradient(90deg, transparent, black 25%, black 75%, transparent)",
            }}
          />
        </div>
      )}
    </div>
  );
}

/** A number that ticks up from zero like a data readout (skipped entirely for reduced motion). */
function useCount(value: number, delay: number, duration: number, tl: Timeline) {
  const { reduce, go, t0 } = tl;
  const mv = useMotionValue(reduce ? value : 0);
  useEffect(() => {
    if (reduce) {
      mv.set(value);
      return;
    }
    mv.set(0);
    if (!go) return; // holds at zero until the scan can start
    const controls = tween(mv, value, { duration, delay: remaining({ t0, go, reduce }, delay), ease: READOUT_EASE });
    return () => controls.stop();
  }, [mv, value, delay, duration, reduce, go, t0]);
  return mv;
}

function Readout({
  value,
  delay,
  duration,
  decimals = 0,
  timeline,
}: {
  value: number;
  delay: number;
  duration: number;
  decimals?: number;
  timeline: Timeline;
}) {
  const mv = useCount(value, delay, duration, timeline);
  const text = useTransform(mv, (v) => v.toFixed(decimals));
  return <motion.span>{text}</motion.span>;
}

function StatRow({ label, value, color, delay, timeline }: { label: string; value: number; color: string; delay: number; timeline: Timeline }) {
  // The number and its bar share one animated value, so they tick and fill together.
  const mv = useCount(value, delay, STAT_TICK_S, timeline);
  const text = useTransform(mv, (v) => Math.round(v).toString());
  const width = useTransform(mv, (v) => `${(v / MAX_BASE_STAT) * 100}%`);
  return (
    <li className="grid grid-cols-[4.5rem_2.25rem_1fr] items-center gap-3 text-sm">
      <span className="text-white/75">{label}</span>
      <motion.span className="font-mono tabular-nums text-white">{text}</motion.span>
      <div className="h-2.5 overflow-hidden rounded-full bg-black/35">
        <motion.div
          className="h-full rounded-full"
          style={{ width, background: `linear-gradient(90deg, ${color}, color-mix(in srgb, ${color} 55%, white))` }}
        />
      </div>
    </li>
  );
}

function EvolutionSection({
  state,
  current,
  accent,
  resolveSpecies,
  onSelect,
  onRetry,
}: {
  state: EvolutionResult | "loading";
  current: PokemonSummary;
  accent: string;
  resolveSpecies: (species: string) => PokemonSummary | undefined;
  onSelect: (p: PokemonSummary) => void;
  onRetry: () => void;
}) {
  if (state === "loading") {
    return (
      <div role="status" aria-label="Loading evolution chain" className="flex animate-pulse items-center gap-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-20 w-20 rounded-xl bg-black/30" />
        ))}
      </div>
    );
  }
  if (!state.ok) {
    return (
      <div role="alert" className="flex items-center gap-3 text-sm text-white/80">
        <span>{state.error}</span>
        <button
          type="button"
          onClick={onRetry}
          className="rounded-lg border border-white/30 px-3 py-1 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300"
        >
          Retry
        </button>
      </div>
    );
  }
  if (state.chain.children.length === 0) {
    return <p className="text-sm text-white/70">This Pokémon does not evolve.</p>;
  }
  return (
    <div className="overflow-x-auto pb-2">
      <EvolutionBranch node={state.chain} current={current} accent={accent} resolveSpecies={resolveSpecies} onSelect={onSelect} />
    </div>
  );
}

interface BranchProps {
  node: EvolutionNode;
  current: PokemonSummary;
  accent: string;
  resolveSpecies: (species: string) => PokemonSummary | undefined;
  onSelect: (p: PokemonSummary) => void;
}

function EvolutionBranch({ node, current, accent, resolveSpecies, onSelect }: BranchProps) {
  const shared = { current, accent, resolveSpecies, onSelect };
  // Many-way branches (Eevee has 8) read better as a grid under the parent than as one tall column.
  if (node.children.length > 3) {
    return (
      <div className="flex flex-col gap-3">
        <EvolutionStage node={node} {...shared} />
        <div className="grid grid-cols-[repeat(auto-fill,6rem)] gap-x-2 gap-y-3">
          {node.children.map((child) => (
            <div key={child.species} className="flex flex-col items-center gap-1">
              <span className="text-center text-[10px] leading-tight text-white/70">↓ {child.requirement ?? "?"}</span>
              <EvolutionBranch node={child} {...shared} />
            </div>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <EvolutionStage node={node} {...shared} />
      {node.children.length > 0 && (
        <div className="flex flex-col gap-3">
          {node.children.map((child) => (
            <div key={child.species} className="flex items-center gap-2">
              <div className="flex w-20 shrink-0 flex-col items-center text-center text-[10px] leading-tight text-white/70">
                <span aria-hidden>→</span>
                <span>{child.requirement ?? "?"}</span>
              </div>
              <EvolutionBranch node={child} {...shared} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EvolutionStage({
  node,
  current,
  accent,
  resolveSpecies,
  onSelect,
}: { node: EvolutionNode } & Omit<BranchProps, "node">) {
  const target = resolveSpecies(node.species);
  const highlighted = node.species === current.species;
  const isCurrent = target?.id === current.id;
  const style = {
    borderColor: highlighted ? accent : "rgba(255,255,255,0.18)",
    background: highlighted ? `color-mix(in srgb, ${accent} 28%, rgba(0,0,0,0.3))` : "rgba(0,0,0,0.25)",
  };
  const body = (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={node.sprite} alt="" width={72} height={72} loading="lazy" className="h-[72px] w-[72px] [image-rendering:pixelated]" />
      <span className="mt-1 w-full truncate text-xs capitalize text-white">{pretty(node.species)}</span>
    </>
  );
  const base = "flex w-24 shrink-0 flex-col items-center rounded-xl border p-2 text-center";

  if (!target) {
    return (
      <div className={base} style={style} aria-current={highlighted ? "true" : undefined}>
        {body}
      </div>
    );
  }
  return (
    <button
      type="button"
      className={`${base} transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300 ${isCurrent ? "cursor-default" : "cursor-pointer hover:brightness-125"}`}
      style={style}
      aria-label={isCurrent ? `${pretty(node.species)} (shown)` : `View ${pretty(node.species)}`}
      aria-current={highlighted ? "true" : undefined}
      // Warm the artwork so the scan can start the moment the view switches.
      onPointerEnter={() => preloadDetailArt(target)}
      onFocus={() => preloadDetailArt(target)}
      onClick={() => onSelect(target)}
    >
      {body}
    </button>
  );
}
