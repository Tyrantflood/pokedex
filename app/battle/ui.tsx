"use client";

import { useState } from "react";
import { battleSpriteUrls, type Facing } from "@/lib/battle/ids";
import { TYPE_COLORS } from "@/lib/type-colors";
import type { PokemonType } from "@/lib/pokemon-types";

/** A type name in its colour. */
export function TypeChip({ type, className = "" }: { type: string; className?: string }) {
  const color = TYPE_COLORS[type as PokemonType] ?? "#68a090";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-black/85 ${className}`}
      style={{ backgroundColor: color }}
    >
      {type}
    </span>
  );
}

const STATUS_STYLE: Record<string, string> = {
  brn: "bg-orange-500 text-black",
  par: "bg-yellow-300 text-black",
  slp: "bg-zinc-400 text-black",
  frz: "bg-cyan-300 text-black",
  psn: "bg-purple-500 text-white",
  tox: "bg-fuchsia-600 text-white",
};

export function StatusChip({ status }: { status: string }) {
  if (!status) return null;
  return <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${STATUS_STYLE[status] ?? "bg-zinc-500 text-white"}`}>{status}</span>;
}

export function HpBar({ fraction, className = "" }: { fraction: number; className?: string }) {
  const f = Math.max(0, Math.min(1, fraction));
  const color = f > 0.5 ? "bg-emerald-400" : f > 0.2 ? "bg-amber-400" : "bg-red-500";
  return (
    <div className={`h-2 overflow-hidden rounded-full bg-black/60 ring-1 ring-white/10 ${className}`} role="presentation">
      {/* scaleX instead of width: the bar animates on the compositor and never re-lays-out the plate. */}
      <div className={`h-full w-full origin-left transition-transform duration-700 ease-out motion-reduce:transition-none ${color}`} style={{ transform: `scaleX(${f})` }} />
    </div>
  );
}

/**
 * A Pokémon's picture: the animated Showdown sprite, then the pixel sprite, then nothing. Shown at its native pixel size times
 * `scale` (Showdown draws every species at one pixel density, so a Wailord really is bigger than a Joltik).
 */
export function SpriteImage({ spriteId, facing, scale, alt, className = "" }: { spriteId: number; facing: Facing; scale: number; alt: string; className?: string }) {
  const urls = battleSpriteUrls(spriteId, facing);
  const [attempt, setAttempt] = useState({ id: spriteId, index: 0 });
  const [size, setSize] = useState<{ id: number; w: number; h: number } | null>(null);
  const index = attempt.id === spriteId ? attempt.index : 0;
  const url = urls[index];
  const known = size && size.id === spriteId ? size : null;
  if (!url) return <span className="grid size-16 place-items-center rounded-full bg-black/30 text-xl text-white/60" aria-label={alt}>?</span>;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- animated GIFs from a third-party CDN; next/image would freeze them
    <img
      key={url}
      src={url}
      alt={alt}
      draggable={false}
      onLoad={(e) => setSize({ id: spriteId, w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
      onError={() => setAttempt({ id: spriteId, index: index + 1 })}
      style={{ imageRendering: "pixelated", width: known ? known.w * scale : undefined, height: known ? known.h * scale : undefined, opacity: known ? 1 : 0 }}
      className={`max-w-none select-none ${className}`}
    />
  );
}
