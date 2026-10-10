"use client";

import { motion } from "framer-motion";
import type { PokemonSummary } from "@/lib/summary";

/** Shown after pressing Compare on a card: waits for you to choose the second Pokémon. */
export function CompareTray({ first, onCancel }: { first: PokemonSummary; onCancel: () => void }) {
  const name = first.name.replace(/-/g, " ");
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-28 z-40 flex justify-center px-4">
      <motion.div
        role="status"
        aria-live="polite"
        className="pointer-events-auto flex max-w-full items-center gap-3 rounded-full border border-teal-300/50 bg-[#0a0e13]/95 py-2 pl-2 pr-3 shadow-[0_8px_30px_rgba(0,0,0,0.5),0_0_24px_rgba(45,212,191,0.25)]"
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 24, opacity: 0, transition: { duration: 0.16 } }}
        transition={{ type: "spring", stiffness: 320, damping: 28 }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={first.sprite} alt="" className={`h-10 w-10 shrink-0 object-contain ${first.pixel ? "[image-rendering:pixelated]" : ""}`} draggable={false} />
        <p className="min-w-0 text-sm text-white">
          Comparing <strong className="font-semibold capitalize">{name}</strong>
          <span className="text-white/65"> · choose another Pokémon</span>
        </p>
        <button
          type="button"
          onClick={onCancel}
          className="shrink-0 rounded-full border border-white/25 px-3 py-1 text-xs text-white hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300"
        >
          Cancel
        </button>
      </motion.div>
    </div>
  );
}
