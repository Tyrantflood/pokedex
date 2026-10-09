"use client";

import { motion } from "framer-motion";
import { useMemo, useRef, useState } from "react";
import type { PokemonSummary } from "@/lib/summary";
import { TYPE_COLORS } from "@/lib/type-colors";
import { verdict } from "@/lib/verdict";
import { Matchups } from "./matchups";
import { ScaleStage } from "./scale-stage";
import { StatRadar } from "./stat-radar";
import { useModal } from "./use-modal";

const pretty = (s: string) => s.replace(/-/g, " ");
const primary = (p: PokemonSummary) => TYPE_COLORS[p.types[0]] ?? TYPE_COLORS.unknown;

/** Two colours that can be told apart even when both Pokémon share a primary type. */
function colorsFor(a: PokemonSummary, b: PokemonSummary): [string, string] {
  const ca = primary(a);
  let cb = primary(b);
  if (cb === ca) {
    const alt = [b.types[1], a.types[1]].map((t) => (t ? TYPE_COLORS[t] : undefined)).find((c) => c && c !== ca);
    cb = alt ?? "#ffffff";
  }
  return [ca, cb];
}

interface Props {
  a: PokemonSummary;
  b: PokemonSummary;
  onClose: () => void;
}

export function CompareView({ a: first, b: second, onClose }: Props) {
  const scope = useRef<HTMLDivElement>(null);
  const [swapped, setSwapped] = useState(false);
  const [a, b] = swapped ? [second, first] : [first, second];
  const [colorA, colorB] = colorsFor(a, b);
  const line = useMemo(() => verdict({ ...a, height: a.height }, { ...b, height: b.height }), [a, b]);

  // After closing, focus returns to whatever opened this; for a drag and drop (nothing focused)
  // it goes to the compare button of the card that was dropped onto.
  useModal(scope, onClose, () => document.querySelector<HTMLElement>(`[data-card-id="${second.id}"] .compare-btn`));

  return (
    <motion.div
      ref={scope}
      role="dialog"
      aria-modal="true"
      aria-label={`Compare ${pretty(a.name)} and ${pretty(b.name)}`}
      className="fixed inset-0 z-40 overflow-y-auto overscroll-contain"
      style={{
        background: `radial-gradient(60% 45% at 18% 0%, ${colorA}33, transparent 70%), radial-gradient(60% 45% at 82% 0%, ${colorB}33, transparent 70%), #0a0e13`,
      }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
    >
      <motion.div
        className="mx-auto max-w-6xl px-4 pb-12 pt-4 sm:px-6"
        initial={{ y: 18, scale: 0.985 }}
        animate={{ y: 0, scale: 1 }}
        exit={{ y: 8, scale: 0.99 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      >
        <header className="flex items-center gap-3 py-3">
          <h2 className="text-2xl font-bold tracking-tight">Compare</h2>
          <p className="min-w-0 truncate text-sm text-white/75">
            <span className="font-semibold capitalize" style={{ color: colorA }}>{pretty(a.name)}</span>
            <span className="text-white/45"> vs </span>
            <span className="font-semibold capitalize" style={{ color: colorB }}>{pretty(b.name)}</span>
          </p>
          <button
            type="button"
            onClick={() => setSwapped((s) => !s)}
            aria-label="Swap sides"
            title="Swap sides"
            className="ml-auto flex h-9 w-9 items-center justify-center rounded-full border border-white/20 text-lg hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300"
          >
            ⇄
          </button>
          <button
            type="button"
            data-autofocus
            onClick={onClose}
            aria-label="Close comparison"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-xl leading-none hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300"
          >
            ×
          </button>
        </header>

        {/* Verdict: a joke from a few base numbers, and labelled as one. */}
        <section aria-label="Verdict, just for fun" className="mb-5 rounded-2xl border border-dashed border-amber-200/40 bg-amber-200/[0.06] px-4 py-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="rounded-full bg-amber-200 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-black">Just for fun</span>
            <p data-verdict className="min-w-0 flex-1 text-sm italic text-white/90 sm:text-base">{line}</p>
          </div>
          <p className="mt-1.5 text-[11px] text-white/50">Not a battle prediction: it is made up from a few base numbers. Real battles also depend on moves, abilities, levels, items and more.</p>
        </section>

        {/* The scale comparison gets the full width: the wider the stage, the bigger everyone is drawn. */}
        <section aria-label="Size, to scale" className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-white/70">Size · to scale, next to a human</h3>
          <ScaleStage a={a} b={b} colorA={colorA} colorB={colorB} />
        </section>

        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <section aria-label="Base stats" className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-widest text-white/70">Base stats</h3>
            <StatRadar key={`${a.id}-${b.id}`} a={{ name: pretty(a.name), stats: a.stats, color: colorA }} b={{ name: pretty(b.name), stats: b.stats, color: colorB }} />
          </section>
          <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-white/70">Type matchups · both ways</h3>
            <Matchups a={a} b={b} colorA={colorA} colorB={colorB} />
          </section>
        </div>
      </motion.div>
    </motion.div>
  );
}
