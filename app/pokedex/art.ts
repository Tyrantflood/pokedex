import type { PokemonSummary } from "@/lib/summary";

/** Which kind of image the detail view's sprite slot shows. */
export type ArtMode = "artwork" | "animated";

/** A still image that can stand in for another one (a plain src plus how to draw it). */
export interface StillImage {
  src: string;
  pixelated: boolean;
}

/** One image drawn in the sprite slot. */
export interface ArtImage extends StillImage {
  /** An animated GIF: frozen to a still frame for reduced motion, and for silhouettes. */
  animated: boolean;
  /** A static sprite standing in for a missing animation: given a gentle procedural idle bob. */
  bob: boolean;
  /** What to draw if a still frame can't be extracted from `src` (for GIFs; otherwise itself). */
  fallback: StillImage;
}

export interface ArtSet {
  base: ArtImage;
  /** The shiny version, or null when this form has no shiny image of the chosen kind at all. */
  shiny: ArtImage | null;
}

const still = (src: string, pixelated: boolean): ArtImage => {
  const self = { src, pixelated };
  return { ...self, animated: false, bob: false, fallback: self };
};

/**
 * What the sprite slot shows for a Pokémon in a given mode.
 *
 * Animated mode uses PokéAPI's Showdown GIFs. Where there is none (or it failed to load, see `broken`)
 * it uses the static pixel sprite with an idle bob instead; the same goes for the shiny image.
 * Artwork mode is the official artwork (or the pixel sprite for the few forms without any).
 */
export function artSet(p: PokemonSummary, mode: ArtMode, broken: ReadonlySet<string>): ArtSet {
  if (mode === "artwork") {
    return {
      base: still(p.artwork ?? p.sprite, !p.artwork && p.pixel),
      shiny: p.shinyArtwork ? still(p.shinyArtwork, !p.artwork && p.pixel) : null,
    };
  }

  const fallback: StillImage = { src: p.sprite, pixelated: p.pixel };
  const gif = (src: string | null): ArtImage | null =>
    src && !broken.has(src) ? { src, pixelated: true, animated: true, bob: false, fallback } : null;
  const bobbing = (src: string | null, pixelated: boolean): ArtImage | null =>
    src ? { src, pixelated, animated: false, bob: true, fallback: { src, pixelated } } : null;

  return {
    base: gif(p.animated) ?? bobbing(p.sprite, p.pixel)!,
    shiny: gif(p.animatedShiny) ?? bobbing(p.spriteShiny, true) ?? (p.shinyArtwork ? still(p.shinyArtwork, false) : null),
  };
}

const MODE_KEY = "pokedex:detail-mode";

/** The remembered choice for this browser session (artwork if none, or if storage is unavailable). */
export function readArtMode(): ArtMode {
  try {
    return sessionStorage.getItem(MODE_KEY) === "animated" ? "animated" : "artwork";
  } catch {
    return "artwork";
  }
}

export function saveArtMode(mode: ArtMode): void {
  try {
    sessionStorage.setItem(MODE_KEY, mode);
  } catch {
    /* the choice just isn't remembered */
  }
}
