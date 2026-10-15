"use client";

import { allSpriteUrls } from "@/lib/battle/ids";

/** The six members of a team as small pixel sprites (ids saved with the team, so no simulator is needed to draw them). */
export function TeamIcons({ icons, size = 28 }: { icons: number[]; size?: number }) {
  if (icons.length === 0) return <span className="text-xs text-zinc-500">No Pokémon yet</span>;
  return (
    <span className="inline-flex items-center" aria-hidden>
      {icons.map((id, i) => (
        // eslint-disable-next-line @next/next/no-img-element -- tiny third-party sprites
        <img key={`${id}-${i}`} src={allSpriteUrls(id).frontPng} alt="" width={size} height={size} loading="lazy" draggable={false} className="[image-rendering:pixelated]" style={{ width: size, height: size }} />
      ))}
    </span>
  );
}

const TAG_STYLE: Record<string, string> = {
  Offense: "border-red-300/40 bg-red-400/10 text-red-100",
  "Bulky offense": "border-orange-300/40 bg-orange-400/10 text-orange-100",
  Balance: "border-teal-300/40 bg-teal-300/10 text-teal-100",
  Stall: "border-sky-300/40 bg-sky-400/10 text-sky-100",
  Weather: "border-amber-300/40 bg-amber-300/10 text-amber-100",
  "Trick Room": "border-fuchsia-300/40 bg-fuchsia-400/10 text-fuchsia-100",
};

/** The playstyle tag of a recommended team. */
export function TagChip({ tag }: { tag: string }) {
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${TAG_STYLE[tag] ?? "border-white/20 text-zinc-200"}`}>{tag}</span>;
}
