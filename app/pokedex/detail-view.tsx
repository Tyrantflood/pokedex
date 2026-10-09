"use client";

import { motion, useAnimate, useReducedMotion } from "framer-motion";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { loadEvolutionChain, type EvolutionResult } from "@/app/actions";
import type { EvolutionNode } from "@/lib/evolution";
import type { PokemonStats } from "@/lib/pokemon-types";
import type { PokemonSummary } from "@/lib/summary";
import { TYPE_COLORS } from "@/lib/type-colors";
import { measureCard, type CardRects } from "./card-rects";

const EASE = [0.22, 1, 0.36, 1] as const;
const OPEN_S = 0.6;
const CLOSE_S = 0.5;
const CONTENT_DELAY_S = 0.3;
const MAX_BASE_STAT = 255;
const CARD_RADIUS = 16;

const STAT_ROWS: { key: keyof PokemonStats; label: string }[] = [
  { key: "hp", label: "HP" },
  { key: "attack", label: "Attack" },
  { key: "defense", label: "Defense" },
  { key: "specialAttack", label: "Sp. Atk" },
  { key: "specialDefense", label: "Sp. Def" },
  { key: "speed", label: "Speed" },
];

const pretty = (s: string) => s.replace(/-/g, " ");

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

interface Props {
  pokemon: PokemonSummary;
  /** Where the card was on screen when it was clicked; the view grows out of this. */
  origin: CardRects;
  /** Called once the closing animation has finished. */
  onClosed: () => void;
}

export function DetailView({ pokemon: p, origin, onClosed }: Props) {
  const [scope, animate] = useAnimate<HTMLDivElement>();
  const slotRef = useRef<HTMLDivElement>(null);
  const spriteRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const closing = useRef(false);
  const started = useRef(false);
  const requestCloseRef = useRef<() => void>(() => {});
  const reduceMotion = useReducedMotion();

  const color = TYPE_COLORS[p.types[0]] ?? TYPE_COLORS.unknown;
  const color2 = TYPE_COLORS[p.types[1] ?? p.types[0]] ?? color;
  const name = pretty(p.name);

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

  // ---- Open: card -> full screen, sprite flies to its slot, pixel -> artwork ----
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
    // Pixel sprite upgrades to artwork while it flies.
    animate("[data-d=px]", { opacity: [1, 0] }, { duration: 0.35, delay: 0.12 });
    animate("[data-d=art]", { opacity: [0, 1] }, { duration: 0.35, delay: 0.12 });

    animate("[data-d=tint]", { opacity: [0, 1] }, { duration: 0.9, delay: 0.1 });
    animate("[data-d=content], [data-d=chrome]", { opacity: [0, 1], y: [14, 0] }, { duration: 0.4, delay: CONTENT_DELAY_S });
  }, [animate, origin, reduceMotion, start]);

  // ---- Close: reverse everything, back to wherever the card is *now* ----
  const requestClose = useCallback(() => {
    if (closing.current) return;
    closing.current = true;

    // Re-measure: the grid may have been scrolled, resized or re-filtered since opening.
    const rects = measureCard(p.id);
    const slot = slotRef.current?.getBoundingClientRect();
    const animations: { finished: Promise<unknown> }[] = [];

    animations.push(animate("[data-d=content], [data-d=chrome]", { opacity: 0, y: 8 }, { duration: 0.18 }));

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
  }, [animate, onClosed, p.id, reduceMotion]);

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
  const [evolution, setEvolution] = useState<EvolutionResult | "loading">("loading");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    fetchEvolution(p.species).then((result) => {
      if (live) setEvolution(result);
    });
    return () => {
      live = false;
    };
  }, [p.species, attempt]);
  const retryEvolution = () => {
    setEvolution("loading");
    setAttempt((n) => n + 1);
  };

  const total = Object.values(p.stats).reduce((sum, v) => sum + v, 0);

  return (
    <div ref={scope} role="dialog" aria-modal="true" aria-label={name} className="fixed inset-0 z-40">
      {/* The card's own look, grown to fill the screen. */}
      <div
        data-d="panel"
        className="fixed overflow-hidden border"
        style={{
          ...start,
          opacity: 0,
          borderRadius: CARD_RADIUS,
          borderColor: `color-mix(in srgb, ${color} 55%, transparent)`,
          background: `radial-gradient(120% 75% at 50% 28%, color-mix(in srgb, ${color} 42%, #0d1117) 0%, #0d1117 72%)`,
        }}
      />
      {/* Background shifts to the Pokémon's type colours. */}
      <div
        data-d="tint"
        className="pointer-events-none fixed inset-0"
        style={{
          opacity: 0,
          background: `radial-gradient(70% 55% at 30% 40%, color-mix(in srgb, ${color} 45%, transparent), transparent 70%), linear-gradient(135deg, color-mix(in srgb, ${color} 38%, #0a0e13) 0%, color-mix(in srgb, ${color2} 32%, #0a0e13) 100%)`,
        }}
      />

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
          {/* Sprite slot: the flying sprite lands here. */}
          {/* Stays in view while a long evolution tree scrolls past on wide screens. */}
          <div ref={slotRef} className="relative mx-auto aspect-square w-[min(78vw,50vh,440px)] md:sticky md:top-20">
            <div ref={spriteRef} data-d="sprite" className="absolute inset-0 origin-top-left" style={{ opacity: 0 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                data-d="px"
                src={p.sprite}
                alt=""
                draggable={false}
                className={`absolute inset-0 h-full w-full object-contain ${p.pixel ? "[image-rendering:pixelated]" : ""}`}
              />
              {p.artwork && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  data-d="art"
                  src={p.artwork}
                  alt={name}
                  draggable={false}
                  className="absolute inset-0 h-full w-full object-contain drop-shadow-[0_18px_24px_rgba(0,0,0,0.45)]"
                  style={{ opacity: 0 }}
                />
              )}
            </div>
          </div>

          <div data-d="content" data-dismiss="" className="min-w-0 space-y-7" style={{ opacity: 0 }}>
            <header>
              <p className="font-mono text-sm text-white/70">#{String(p.number).padStart(4, "0")}</p>
              <h2 className="mt-1 text-4xl font-bold capitalize tracking-tight text-white md:text-5xl">{name}</h2>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {p.types.map((t) => (
                  <span
                    key={t}
                    className="rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide text-black/80"
                    style={{ background: TYPE_COLORS[t] ?? TYPE_COLORS.unknown }}
                  >
                    {t}
                  </span>
                ))}
                {p.tag && (
                  <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white">
                    {p.tag}
                  </span>
                )}
              </div>
            </header>

            <section aria-label="Base stats">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-white/70">Base stats</h3>
              <ul className="space-y-1.5">
                {STAT_ROWS.map(({ key, label }, i) => (
                  <li key={key} className="grid grid-cols-[4.5rem_2.25rem_1fr] items-center gap-3 text-sm">
                    <span className="text-white/75">{label}</span>
                    <span className="font-mono tabular-nums text-white">{p.stats[key]}</span>
                    <div className="h-2.5 overflow-hidden rounded-full bg-black/35">
                      <motion.div
                        className="h-full rounded-full"
                        style={{ background: `linear-gradient(90deg, ${color}, color-mix(in srgb, ${color} 55%, white))` }}
                        initial={{ width: 0 }}
                        animate={{ width: `${(p.stats[key] / MAX_BASE_STAT) * 100}%` }}
                        // Bars fill one by one, after the view has finished growing.
                        transition={{ duration: 0.7, ease: EASE, delay: reduceMotion ? 0 : OPEN_S + 0.05 + i * 0.1 }}
                      />
                    </div>
                  </li>
                ))}
                <li className="grid grid-cols-[4.5rem_2.25rem_1fr] items-center gap-3 border-t border-white/15 pt-1.5 text-sm">
                  <span className="text-white/75">Total</span>
                  <span className="font-mono tabular-nums text-white">{total}</span>
                </li>
              </ul>
            </section>

            <div className="grid gap-6 sm:grid-cols-2">
              <section aria-label="Abilities">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-white/70">Abilities</h3>
                <ul className="flex flex-wrap gap-2">
                  {p.abilities.length === 0 && <li className="text-sm text-white/60">None listed</li>}
                  {p.abilities.map((a) => (
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
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-white/70">Size</h3>
                <dl className="grid grid-cols-2 gap-2 text-sm">
                  <div className="rounded-lg border border-white/20 bg-black/25 px-3 py-1.5">
                    <dt className="text-[10px] uppercase tracking-wider text-white/60">Height</dt>
                    <dd className="font-mono text-white">{(p.height / 10).toFixed(1)} m</dd>
                  </div>
                  <div className="rounded-lg border border-white/20 bg-black/25 px-3 py-1.5">
                    <dt className="text-[10px] uppercase tracking-wider text-white/60">Weight</dt>
                    <dd className="font-mono text-white">{(p.weight / 10).toFixed(1)} kg</dd>
                  </div>
                </dl>
              </section>
            </div>

            <section aria-label="Evolution chain">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-white/70">Evolution</h3>
              <EvolutionSection state={evolution} current={p.species} accent={color} onRetry={retryEvolution} />
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

function EvolutionSection({
  state,
  current,
  accent,
  onRetry,
}: {
  state: EvolutionResult | "loading";
  current: string;
  accent: string;
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
      <EvolutionBranch node={state.chain} current={current} accent={accent} />
    </div>
  );
}

function EvolutionBranch({ node, current, accent }: { node: EvolutionNode; current: string; accent: string }) {
  // Many-way branches (Eevee has 8) read better as a grid under the parent than as one tall column.
  if (node.children.length > 3) {
    return (
      <div className="flex flex-col gap-3">
        <EvolutionStage node={node} active={node.species === current} accent={accent} />
        <div className="grid grid-cols-[repeat(auto-fill,6rem)] gap-x-2 gap-y-3">
          {node.children.map((child) => (
            <div key={child.species} className="flex flex-col items-center gap-1">
              <span className="text-center text-[10px] leading-tight text-white/70">↓ {child.requirement ?? "?"}</span>
              <EvolutionBranch node={child} current={current} accent={accent} />
            </div>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <EvolutionStage node={node} active={node.species === current} accent={accent} />
      {node.children.length > 0 && (
        <div className="flex flex-col gap-3">
          {node.children.map((child) => (
            <div key={child.species} className="flex items-center gap-2">
              <div className="flex w-20 shrink-0 flex-col items-center text-center text-[10px] leading-tight text-white/70">
                <span aria-hidden>→</span>
                <span>{child.requirement ?? "?"}</span>
              </div>
              <EvolutionBranch node={child} current={current} accent={accent} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EvolutionStage({ node, active, accent }: { node: EvolutionNode; active: boolean; accent: string }) {
  return (
    <div
      className="flex w-24 shrink-0 flex-col items-center rounded-xl border p-2 text-center"
      style={{
        borderColor: active ? accent : "rgba(255,255,255,0.18)",
        background: active ? `color-mix(in srgb, ${accent} 28%, rgba(0,0,0,0.3))` : "rgba(0,0,0,0.25)",
      }}
      aria-current={active ? "true" : undefined}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={node.sprite} alt="" width={72} height={72} loading="lazy" className="h-[72px] w-[72px] [image-rendering:pixelated]" />
      <span className="mt-1 w-full truncate text-xs capitalize text-white">{pretty(node.species)}</span>
    </div>
  );
}
