import type { Pokemon } from "./pokemon-types";

export const PLACEHOLDER_SPRITE = "/placeholder.svg";

/** Pixel sprite, then official artwork, then the placeholder. Never null. */
export function spriteUrl(p: Pokemon, variant: "normal" | "shiny" = "normal"): string {
  return p.sprites[variant] ?? p.artwork[variant] ?? PLACEHOLDER_SPRITE;
}
