"use client";

import type { Facing } from "@/lib/battle/ids";
import { useSprite } from "./use-sprite";
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
      <div className={`h-full w-full origin-left transition-transform ease-out motion-reduce:transition-none ${color}`} style={{ transform: `scaleX(${f})`, transitionDuration: "var(--hp-ms, 700ms)" }} />
    </div>
  );
}

/**
 * A Pokémon's picture, found through the fallback chain in lib/battle/sprite-chain.ts: animated, static, a flipped front view,
 * artwork, placeholder. It is never invisible: while the first picture loads (the animated GIFs can take seconds) the static sprite
 * or a placeholder is shown, and the GIF replaces it on arrival. Pixel sprites are drawn at their native size times `scale`
 * (Showdown draws every species at one pixel density, so a Wailord really is bigger than a Joltik); artwork is fitted to a similar height.
 */
export function SpriteImage({ spriteId, facing, scale, alt, className = "" }: { spriteId: number; facing: Facing; scale: number; alt: string; className?: string }) {
  const { candidate, size, waiting, fit } = useSprite(spriteId, facing);
  let width: number;
  let height: number;
  if (candidate.kind === "artwork" && size) {
    height = 90 * scale;
    width = height * (size.w / size.h);
  } else if (size && candidate.kind !== "placeholder") {
    width = size.w * scale;
    height = size.h * scale;
  } else {
    width = height = 60 * scale;
  }
  const pixel = candidate.kind === "gif" || candidate.kind === "png";
  const image = {
    imageRendering: pixel ? ("pixelated" as const) : ("auto" as const),
    opacity: waiting ? 0.55 : 1,
  };
  // The box is what the layout sees. While a static sprite waits for its GIF the box is the GIF's size and the sprite is drawn scaled to
  // fill it (fit), so the swap changes the picture and nothing else. A mirrored front view is mirrored as a whole box.
  const box = fit ? { width: fit.box.w * scale, height: fit.box.h * scale } : { width, height };
  return (
    <span data-sprite-box style={{ display: "block", position: "relative", ...box, transform: candidate.flip ? "scaleX(-1)" : undefined }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- animated GIFs from a third-party CDN; next/image would freeze them */}
      <img
        key={candidate.url}
        src={candidate.url}
        alt={alt}
        draggable={false}
        data-sprite={candidate.id}
        data-fit={fit ? "true" : undefined}
        style={
          fit
            ? { ...image, position: "absolute", left: fit.left * scale, top: fit.top * scale, width: fit.width * scale, height: fit.height * scale }
            : { ...image, width, height }
        }
        className={`max-w-none select-none ${waiting ? "motion-safe:animate-pulse" : ""} ${className}`}
      />
    </span>
  );
}
