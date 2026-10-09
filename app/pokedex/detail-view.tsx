"use client";

import { motion } from "framer-motion";
import { useEffect, useRef } from "react";
import type { PokemonSummary } from "@/lib/summary";
import { TYPE_COLORS } from "@/lib/type-colors";

export function DetailView({ pokemon: p, onClose }: { pokemon: PokemonSummary; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const color = TYPE_COLORS[p.types[0]] ?? TYPE_COLORS.unknown;
  const name = p.name.replace(/-/g, " ");

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const html = document.documentElement;
    const previousOverflow = html.style.overflow;
    html.style.overflow = "hidden";
    closeRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      // The close button is the only control, so keep focus on it.
      if (e.key === "Tab") {
        e.preventDefault();
        closeRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      html.style.overflow = previousOverflow;
      opener?.focus?.();
    };
  }, [onClose]);

  return (
    <motion.div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={name}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-sm overflow-hidden rounded-3xl border p-6 text-center"
        style={{
          borderColor: `color-mix(in srgb, ${color} 55%, transparent)`,
          background: `radial-gradient(120% 70% at 50% 25%, color-mix(in srgb, ${color} 42%, #0d1117) 0%, #0d1117 75%)`,
        }}
        initial={{ opacity: 0, scale: 0.92, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.15 } }}
        transition={{ type: "spring", stiffness: 320, damping: 30 }}
      >
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 h-8 w-8 rounded-full bg-white/10 text-lg leading-none text-white hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300"
        >
          ×
        </button>
        <p className="font-mono text-sm text-zinc-300/80">#{String(p.number).padStart(4, "0")}</p>
        {/* Artwork was preloaded on card hover/focus, so this normally paints instantly. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={p.artwork ?? p.sprite}
          alt={name}
          draggable={false}
          className={`mx-auto my-3 h-64 w-64 object-contain ${p.artwork || !p.pixel ? "" : "[image-rendering:pixelated]"}`}
        />
        <h2 className="text-2xl font-bold capitalize text-white">{name}</h2>
        {p.tag && (
          <span className="mt-1 inline-block rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white/90">
            {p.tag}
          </span>
        )}
        <div className="mt-3 flex justify-center gap-2">
          {p.types.map((t) => (
            <span
              key={t}
              className="rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide text-black/80"
              style={{ background: TYPE_COLORS[t] ?? TYPE_COLORS.unknown }}
            >
              {t}
            </span>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}
