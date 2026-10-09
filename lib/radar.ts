import type { PokemonStats } from "./pokemon-types";

/** Radar axes, clockwise from the top. */
export const RADAR_AXES: { key: keyof PokemonStats; label: string }[] = [
  { key: "hp", label: "HP" },
  { key: "attack", label: "Attack" },
  { key: "defense", label: "Defense" },
  { key: "speed", label: "Speed" },
  { key: "specialDefense", label: "Sp. Def" },
  { key: "specialAttack", label: "Sp. Atk" },
];

/**
 * The value at the outer ring. Shared by both Pokémon so the shapes are directly comparable; at
 * least 100 so two weak Pokémon don't both look huge, rounded up to a multiple of 10 otherwise.
 */
export function radarMax(a: PokemonStats, b: PokemonStats): number {
  const top = Math.max(...RADAR_AXES.flatMap(({ key }) => [a[key], b[key]]));
  return Math.max(100, Math.ceil(top / 10) * 10);
}

/** Point on axis `i` at `ratio` (0 = centre, 1 = outer ring). */
export function radarPoint(i: number, ratio: number, cx: number, cy: number, radius: number): [number, number] {
  const angle = -Math.PI / 2 + (i * 2 * Math.PI) / RADAR_AXES.length;
  return [cx + Math.cos(angle) * radius * ratio, cy + Math.sin(angle) * radius * ratio];
}

/** SVG polygon points for a stat block; `progress` (0..1) grows the shape out from the centre. */
export function radarPolygon(stats: PokemonStats, max: number, progress: number, cx: number, cy: number, radius: number): string {
  return RADAR_AXES.map(({ key }, i) => radarPoint(i, (stats[key] / max) * progress, cx, cy, radius).map((n) => n.toFixed(2)).join(",")).join(" ");
}
