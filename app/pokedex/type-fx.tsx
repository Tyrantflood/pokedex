"use client";

import { useEffect, useMemo, type CSSProperties } from "react";
import type { PokemonType } from "@/lib/pokemon-types";

/**
 * Background effects for the detail view, one theme per primary type. They live on their own
 * layer *under* the content, so text and the sprite are never filtered or distorted.
 *
 * Performance rule: only transform and opacity animate (composited, ~0 raster cost). The
 * classic SVG displacement/turbulence versions of heat shimmer and caustics were profiled and
 * dropped (see the commit message): they cost 1,300-3,300 ms/s of raster time on a phone-sized
 * viewport. Per-theme element counts are kept small (<= ~16 animated elements).
 */

export type FxKind =
  | "fire" | "water" | "ghost" | "electric" | "grass" | "ice" | "fighting" | "poison" | "ground"
  | "flying" | "psychic" | "bug" | "rock" | "dragon" | "dark" | "steel" | "fairy" | "normal" | "stars";

const KIND_BY_TYPE: Record<PokemonType, FxKind> = {
  fire: "fire", water: "water", ghost: "ghost", electric: "electric", grass: "grass", ice: "ice",
  fighting: "fighting", poison: "poison", ground: "ground", flying: "flying", psychic: "psychic",
  bug: "bug", rock: "rock", dragon: "dragon", dark: "dark", steel: "steel", fairy: "fairy",
  normal: "normal", stellar: "stars", unknown: "stars",
};

export const fxKindOf = (type: PokemonType | undefined): FxKind => KIND_BY_TYPE[type ?? "unknown"] ?? "stars";

// ---- small seeded PRNG so each theme looks the same every time it opens ----
function mulberry32(seed: number) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hash = (s: string) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7);

type Style = CSSProperties & Record<`--${string}`, string | number>;

// ---- particles ----
interface Field {
  /** Animation family (see globals.css). */
  motion: "rise" | "fall" | "drift" | "twinkle" | "wander";
  count: number;
  color: string;
  size: [number, number];
  duration: [number, number];
  /** Horizontal travel in px (rise/fall/wander). */
  dx?: [number, number];
  /** Vertical range in % where drifting/twinkling/wandering particles live. */
  y?: [number, number];
  /** Extra class for the shape (fx-leaf, fx-star, fx-grit). */
  shape?: string;
  glow?: boolean;
  hollow?: boolean;
  opacity?: number;
}

function Particles({ field: f, seed }: { field: Field; seed: string }) {
  const items = useMemo(() => {
    const r = mulberry32(hash(seed));
    const between = (a: number, b: number) => a + r() * (b - a);
    return Array.from({ length: f.count }, () => {
      const size = between(f.size[0], f.size[1]);
      const d = between(f.duration[0], f.duration[1]);
      const style: Style = {
        width: size,
        height: size,
        "--d": `${d.toFixed(1)}s`,
        "--dl": `-${(r() * d).toFixed(1)}s`,
        "--dx": `${between(...(f.dx ?? [-30, 30])).toFixed(0)}px`,
        "--dy": `${between(-30, 30).toFixed(0)}px`,
        "--o": f.opacity ?? 0.9,
        left: `${between(2, 96).toFixed(1)}%`,
      };
      if (f.motion === "drift") {
        style.top = `${between(...(f.y ?? [10, 90])).toFixed(1)}%`;
        style.left = undefined;
        style["--dy"] = `${between(-8, 4).toFixed(1)}vh`;
      } else if (f.motion === "twinkle" || f.motion === "wander") {
        style.top = `${between(...(f.y ?? [5, 95])).toFixed(1)}%`;
      }
      if (f.hollow) {
        style.border = `1.5px solid ${f.color}`;
        style.background = `color-mix(in srgb, ${f.color} 18%, transparent)`;
      } else {
        style.background = f.color;
      }
      if (f.glow) style.boxShadow = `0 0 ${Math.round(size * 2)}px ${Math.round(size / 2)}px ${f.color}`;
      return style;
    });
  }, [f, seed]);

  return (
    <>
      {items.map((style, i) => (
        <span key={i} className={`fx-p fx-${f.motion} ${f.shape ?? ""}`} style={style} />
      ))}
    </>
  );
}

const Ring = ({ color, size, duration, delay, width = 1.5, ease }: { color: string; size: string; duration: number; delay: number; width?: number; ease?: string }) => (
  <i
    className="fx-ring fx-at-sprite"
    style={{ "--s": size, "--c": color, "--d": `${duration}s`, "--dl": `${delay}s`, "--bw": `${width}px`, ...(ease ? { "--ease": ease } : {}) } as Style}
  />
);

const Breathe = ({ color, size = "70vmin", duration = 7 }: { color: string; size?: string; duration?: number }) => (
  <i className="fx-breathe fx-at-sprite" style={{ "--c": color, "--s": size, "--d": `${duration}s` } as Style} />
);

// ---- fixed layouts for the hand-placed effects ----
const PLUMES = [
  { left: 4, d: 6.2, dl: -1, dx: 18 }, { left: 21, d: 7.4, dl: -3.5, dx: -22 }, { left: 38, d: 5.6, dl: -0.5, dx: 14 },
  { left: 55, d: 7, dl: -4.4, dx: -16 }, { left: 72, d: 6.4, dl: -2.2, dx: 20 }, { left: 88, d: 7.8, dl: -5.6, dx: -12 },
];
const BOLTS = [
  { left: "6%", top: "-2%", h: 360, w: 120, d: 7, dl: -1, pts: "60,0 44,70 72,120 38,190 66,240 46,360" },
  { left: "76%", top: "4%", h: 320, w: 110, d: 9, dl: -5, pts: "55,0 70,60 40,115 68,180 48,250 62,320" },
  { left: "44%", top: "-4%", h: 280, w: 100, d: 11, dl: -8, pts: "50,0 36,55 58,100 40,170 56,220 44,280" },
];
const STREAK_TOPS = [14, 27, 39, 52, 63, 76, 88];

const FIELDS = {
  embers: { motion: "rise", count: 12, color: "#ffb060", size: [2, 5], duration: [5, 10], dx: [-40, 40], glow: true } satisfies Field,
  pollen: { motion: "rise", count: 12, color: "rgba(190,255,140,0.8)", size: [5, 10], duration: [10, 17], dx: [10, 90], shape: "fx-leaf" } satisfies Field,
  snow: { motion: "fall", count: 14, color: "rgba(235,250,255,0.85)", size: [3, 6], duration: [9, 16], dx: [-40, 40] } satisfies Field,
  frost: { motion: "twinkle", count: 6, color: "#bdf2ff", size: [6, 11], duration: [3, 6], shape: "fx-star" } satisfies Field,
  bubbles: { motion: "rise", count: 12, color: "rgba(220,140,255,0.8)", size: [6, 16], duration: [8, 15], dx: [-30, 30], hollow: true } satisfies Field,
  dust: { motion: "drift", count: 14, color: "rgba(226,191,101,0.55)", size: [2, 5], duration: [14, 26], y: [55, 95] } satisfies Field,
  fireflies: { motion: "wander", count: 10, color: "#d8ff6a", size: [3, 5], duration: [8, 14], dx: [-40, 40], glow: true } satisfies Field,
  grit: { motion: "fall", count: 10, color: "rgba(170,150,120,0.6)", size: [2, 5], duration: [10, 18], dx: [-20, 20], shape: "fx-grit" } satisfies Field,
  sparkles: { motion: "twinkle", count: 14, color: "#ffd1f0", size: [6, 12], duration: [2.5, 5.5], shape: "fx-star", glow: true } satisfies Field,
  stars: { motion: "twinkle", count: 18, color: "#e8fffb", size: [2, 5], duration: [2.5, 6] } satisfies Field,
} as const;

interface Props {
  kind: FxKind;
  /** Reduced motion: render only the static layers. */
  reduce: boolean;
}

export function TypeFx({ kind, reduce }: Props) {
  const seed = kind;
  let content: React.ReactNode = null;

  switch (kind) {
    case "fire":
      content = (
        <>
          {/* Warm colour grade: static, background only. */}
          <div className="fx-fire-grade" />
          {!reduce && (
            <>
              {/* Heat shimmer: wide warm plumes that rise and waver. */}
              {PLUMES.map((p, i) => (
                <b key={i} className="fx-plume" style={{ left: `${p.left}%`, "--d": `${p.d}s`, "--dl": `${p.dl}s`, "--dx": `${p.dx}px` } as Style} />
              ))}
              <Particles field={FIELDS.embers} seed={seed} />
            </>
          )}
        </>
      );
      break;
    case "water":
      content = (
        <>
          <div className="fx-water-grade" />
          <div className="fx-caustic fx-caustic-a" />
          {!reduce && (
            <>
              <div className="fx-caustic fx-caustic-b" />
              <Ring color="rgba(200,235,255,0.55)" size="44vmin" duration={6} delay={0} />
              <Ring color="rgba(200,235,255,0.45)" size="44vmin" duration={6} delay={-2} />
              <Ring color="rgba(200,235,255,0.35)" size="44vmin" duration={6} delay={-4} />
            </>
          )}
        </>
      );
      break;
    case "ghost":
      content = (
        <>
          <i className="fx-fog" style={{ left: "-10vw", top: "6vh", "--c": "rgba(150,120,220,0.28)", "--d": "15s" } as Style} />
          <i className="fx-fog" style={{ left: "18vw", top: "42vh", "--c": "rgba(110,90,190,0.24)", "--d": "21s" } as Style} />
          <i className="fx-fog" style={{ left: "-20vw", top: "60vh", "--c": "rgba(170,140,230,0.18)", "--d": "26s" } as Style} />
          <div className="fx-vignette" style={reduce ? { animation: "none" } : undefined} />
        </>
      );
      break;
    case "electric":
      content = reduce ? null : (
        <>
          <div className="fx-flash" style={{ "--d": "7s", "--dl": "-1s" } as Style} />
          {BOLTS.map((b, i) => (
            <svg key={i} className="fx-bolt" viewBox={`0 0 ${b.w} ${b.h}`} style={{ left: b.left, top: b.top, width: b.w, height: b.h, "--d": `${b.d}s`, "--dl": `${b.dl}s` } as Style}>
              <polyline points={b.pts} fill="none" stroke="rgba(255,235,100,0.28)" strokeWidth="9" strokeLinejoin="round" />
              <polyline points={b.pts} fill="none" stroke="#fff7b0" strokeWidth="2.5" strokeLinejoin="round" />
            </svg>
          ))}
        </>
      );
      break;
    case "grass":
      content = reduce ? null : <Particles field={FIELDS.pollen} seed={seed} />;
      break;
    case "ice":
      content = reduce ? null : (
        <>
          <Particles field={FIELDS.snow} seed={seed} />
          <Particles field={FIELDS.frost} seed={`${seed}2`} />
        </>
      );
      break;
    case "fighting":
      content = reduce ? null : (
        <>
          <Ring color="rgba(255,100,70,0.6)" size="52vmin" duration={2.6} delay={0} width={3} ease="cubic-bezier(0.1,0.7,0.3,1)" />
          <Ring color="rgba(255,100,70,0.45)" size="52vmin" duration={2.6} delay={-1.3} width={3} ease="cubic-bezier(0.1,0.7,0.3,1)" />
        </>
      );
      break;
    case "poison":
      content = reduce ? null : <Particles field={FIELDS.bubbles} seed={seed} />;
      break;
    case "ground":
      content = reduce ? null : <Particles field={FIELDS.dust} seed={seed} />;
      break;
    case "flying":
      content = reduce ? null : (
        <>
          {STREAK_TOPS.map((top, i) => (
            <i key={i} className="fx-streak" style={{ top: `${top}%`, width: `${18 + ((i * 7) % 16)}vw`, "--d": `${6 + ((i * 3) % 6)}s`, "--dl": `-${(i * 1.7).toFixed(1)}s` } as Style} />
          ))}
        </>
      );
      break;
    case "psychic":
      content = (
        <>
          <Breathe color="rgba(249,85,135,0.3)" size="80vmin" duration={6} />
          {!reduce && (
            <>
              <Ring color="rgba(249,120,170,0.5)" size="60vmin" duration={7} delay={0} width={2} ease="ease-in-out" />
              <Ring color="rgba(249,120,170,0.4)" size="60vmin" duration={7} delay={-2.3} width={2} ease="ease-in-out" />
              <Ring color="rgba(249,120,170,0.3)" size="60vmin" duration={7} delay={-4.6} width={2} ease="ease-in-out" />
            </>
          )}
        </>
      );
      break;
    case "bug":
      content = reduce ? null : <Particles field={FIELDS.fireflies} seed={seed} />;
      break;
    case "rock":
      content = reduce ? null : <Particles field={FIELDS.grit} seed={seed} />;
      break;
    case "dragon":
      content = <div className="fx-conic" style={reduce ? { animation: "none" } : undefined} />;
      break;
    case "dark":
      content = <div className="fx-vignette" style={reduce ? { animation: "none" } : undefined} />;
      break;
    case "steel":
      content = reduce ? null : <div className="fx-glint" />;
      break;
    case "fairy":
      content = reduce ? null : <Particles field={FIELDS.sparkles} seed={seed} />;
      break;
    case "normal":
      content = <Breathe color="rgba(255,255,255,0.14)" size="75vmin" duration={8} />;
      break;
    case "stars":
      content = reduce ? null : <Particles field={FIELDS.stars} seed={seed} />;
      break;
  }

  return (
    <div className="fx-root" data-fx={kind} aria-hidden>
      {content}
    </div>
  );
}

/**
 * Safety net for very weak devices: after the effects have settled in, if the page is
 * managing fewer than ~30 frames per second, call `onSlow` (the caller drops the effects).
 * Samples only a short window, so it costs nothing afterwards.
 */
const SETTLE_MS = 2600; // lets the open animation and the scan reveal finish first
const SAMPLE_MS = 1500;
const SLOW_FRAME_MS = 34;

export function useFrameGuard(active: boolean, onSlow: () => void) {
  useEffect(() => {
    if (!active) return;
    let raf = 0;
    let alive = true;
    let last = 0;
    const start = performance.now();
    const deltas: number[] = [];
    const tick = (t: number) => {
      if (!alive) return;
      if (last && t - start > SETTLE_MS) deltas.push(t - last);
      last = t;
      if (t - start < SETTLE_MS + SAMPLE_MS) {
        raf = requestAnimationFrame(tick);
        return;
      }
      deltas.sort((a, b) => a - b);
      if ((deltas[Math.floor(deltas.length / 2)] ?? 0) > SLOW_FRAME_MS) onSlow();
    };
    raf = requestAnimationFrame(tick);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
    };
  }, [active, onSlow]);
}
