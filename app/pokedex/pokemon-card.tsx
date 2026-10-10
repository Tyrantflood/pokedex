"use client";

import { motion, type Variants } from "framer-motion";
import { memo, useRef, type PointerEvent } from "react";
import type { PokemonSummary } from "@/lib/summary";
import { preloadDetailArt } from "./art";
import { TYPE_COLORS } from "@/lib/type-colors";
import { measureCardElement, type CardRects } from "./card-rects";

const MAX_TILT_DEG = 14;
const SPRING = { type: "spring", stiffness: 260, damping: 30 } as const;

// Only `exit` is a variant: AnimatePresence's `custom` says whether this removal came
// from a filter change (animate out) or from scrolling out of the virtual window
// (vanish instantly, so scrolling never leaves fading ghosts behind).
const exitVariants: Variants = {
  exit: (animateExit: boolean) =>
    animateExit
      ? { opacity: 0, scale: 0.85, transition: { duration: 0.18 } }
      : { opacity: 0, transition: { duration: 0 } },
};

interface Props {
  pokemon: PokemonSummary;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Stagger delay in seconds for the initial entrance. */
  delay: number;
  /**
   * Whether a newly mounted card plays its entrance. False for cards that merely scroll
   * into the virtual window (they mount off-screen in the overscan rows), which keeps
   * mounting cheap during fast scrolling.
   */
  animateIn: boolean;
  onOpen: (p: PokemonSummary, origin: CardRects) => void;
  /** Starts (or finishes) a side-by-side comparison from this card. */
  onCompare: (p: PokemonSummary) => void;
  /** This card is the first half of a comparison that is waiting for a second pick. */
  picked: boolean;
  /** This Pokémon is on the team. */
  onTeam: boolean;
  /** Adds it to the team, or takes it off if it is already there. `sprite` is its sprite on screen, for the flight into the team bar. */
  onToggleTeam: (p: PokemonSummary, sprite: DOMRect | null) => void;
}

function PokemonCardImpl({ pokemon: p, x, y, width, height, delay, animateIn, onOpen, onCompare, picked, onTeam, onToggleTeam }: Props) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const frame = useRef(0);
  const color = TYPE_COLORS[p.types[0]] ?? TYPE_COLORS.unknown;

  // Tilt and shine are driven by CSS variables written straight to the DOM, so
  // pointer movement never triggers a React render.
  const onPointerEnter = (e: PointerEvent<HTMLDivElement>) => {
    // Warm the detail view's artwork as soon as the pointer arrives (touch included).
    preloadDetailArt(p);
    if (e.pointerType === "touch") return;
    e.currentTarget.dataset.hover = "true";
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "touch") return;
    const { clientX, clientY } = e;
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const outer = outerRef.current;
      const inner = innerRef.current;
      if (!outer || !inner) return;
      const r = outer.getBoundingClientRect();
      const px = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
      const py = Math.min(1, Math.max(0, (clientY - r.top) / r.height));
      inner.style.setProperty("--rx", `${((0.5 - py) * 2 * MAX_TILT_DEG).toFixed(2)}deg`);
      inner.style.setProperty("--ry", `${((px - 0.5) * 2 * MAX_TILT_DEG).toFixed(2)}deg`);
      inner.style.setProperty("--mx", `${(px * 100).toFixed(1)}%`);
      inner.style.setProperty("--my", `${(py * 100).toFixed(1)}%`);
    });
  };

  const onPointerLeave = (e: PointerEvent<HTMLDivElement>) => {
    cancelAnimationFrame(frame.current);
    delete e.currentTarget.dataset.hover;
    innerRef.current?.style.removeProperty("--rx");
    innerRef.current?.style.removeProperty("--ry");
  };

  // Flatten the hover tilt before measuring so the detail view starts from the card's
  // true on-screen rectangle, then hand over to the detail view.
  const open = () => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;
    cancelAnimationFrame(frame.current);
    delete outer.dataset.hover;
    inner.style.transition = "none";
    inner.style.removeProperty("--rx");
    inner.style.removeProperty("--ry");
    inner.getBoundingClientRect(); // force the flattened style to apply
    const rects = measureCardElement(outer);
    inner.style.transition = "";
    if (rects) onOpen(p, rects);
  };

  return (
    <motion.div
      ref={outerRef}
      role="listitem"
      data-card-id={p.id}
      className="holo-card absolute left-0 top-0"
      style={{ width, height, ["--type" as string]: color }}
      // Position is part of initial, so a card fades in place instead of flying in;
      // later x/y changes (filters, resize) spring.
      initial={animateIn ? { opacity: 0, scale: 0.88, x, y } : false}
      animate={{ opacity: 1, scale: 1, x, y }}
      variants={exitVariants}
      exit="exit"
      transition={{
        x: SPRING,
        y: SPRING,
        opacity: { delay, duration: 0.3 },
        scale: { delay, type: "spring", stiffness: 320, damping: 26 },
      }}
      onPointerEnter={onPointerEnter}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
    >
      <div ref={innerRef} className="holo-inner">
        <div className="holo-face">
          <div className="flex items-start justify-between p-3">
            <span className="font-mono text-xs text-zinc-300/80">#{String(p.number).padStart(4, "0")}</span>
            {p.tag && (
              <span className="mr-7 rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white/90">
                {p.tag}
              </span>
            )}
          </div>
          <div className="absolute inset-x-3 bottom-3">
            <p className="truncate text-sm font-semibold capitalize text-white">{p.name.replace(/-/g, " ")}</p>
            <div className="mt-1.5 flex gap-1.5">
              {p.types.map((t) => (
                <span
                  key={t}
                  className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-black/80"
                  style={{ background: TYPE_COLORS[t] ?? TYPE_COLORS.unknown }}
                >
                  {t}
                </span>
              ))}
            </div>
          </div>
          <div className="holo-shine" />
        </div>
        <div className="holo-sprite">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={p.sprite}
            alt=""
            draggable={false}
            decoding="async"
            className={`sprite-bob ${p.pixel ? "sprite-pixel" : "sprite-smooth"}`}
            style={{ animationDelay: `${-(p.id % 9) * 0.37}s` }}
          />
        </div>
        <button
          type="button"
          aria-label={`View ${p.name.replace(/-/g, " ")}`}
          onClick={open}
          onFocus={() => preloadDetailArt(p)}
          className="absolute inset-0 rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-teal-300"
        />
        {/* Comparison without dragging: always shown on touch screens, on hover/focus elsewhere. */}
        <button
          type="button"
          className="compare-btn"
          aria-label={picked ? `Stop comparing ${p.name.replace(/-/g, " ")}` : `Compare ${p.name.replace(/-/g, " ")} with another Pokémon`}
          aria-pressed={picked}
          onClick={() => onCompare(p)}
        >
          ⇄
        </button>
        {/* Team: dragging a card into the team bar works with a mouse; this button is for touch and keyboard. */}
        <button
          type="button"
          className="team-btn"
          aria-label={onTeam ? `Remove ${p.name.replace(/-/g, " ")} from the team` : `Add ${p.name.replace(/-/g, " ")} to the team`}
          aria-pressed={onTeam}
          title={onTeam ? "On your team: press to remove" : "Add to team"}
          onClick={() => onToggleTeam(p, outerRef.current ? (measureCardElement(outerRef.current)?.sprite ?? null) : null)}
        >
          {onTeam ? "✓" : "+"}
        </button>
      </div>
    </motion.div>
  );
}

export const PokemonCard = memo(PokemonCardImpl);
