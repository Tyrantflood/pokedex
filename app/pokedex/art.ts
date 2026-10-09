import { firstFrame } from "@/lib/first-frame";
import { preloadImage } from "@/lib/preload-image";
import { measureSpriteBounds } from "@/lib/sprite-bounds";
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

const NONE: ReadonlySet<string> = new Set();

/**
 * Warms what the detail view will draw first for this Pokémon, in the mode the user is in: the image
 * itself (artwork or GIF) and, for a GIF, its first frame (used for the silhouette) and the static
 * sprite that stands in until the GIF is decoded. Call on hover/focus, so it is usually ready by the click.
 */
export function preloadDetailArt(p: PokemonSummary, mode: ArtMode = readArtMode()): void {
  const { base } = artSet(p, mode, NONE);
  preloadImage(base.src);
  if (base.animated) {
    preloadImage(base.fallback.src);
    void firstFrame(base.src);
    measureSpriteBounds(base.fallback.src).catch(() => {}); // to size the stand-in like the GIF
  }
}

const MODE_KEY = "pokedex:detail-mode";

/** The remembered choice for this browser session: animated unless the user switched to artwork. */
export function readArtMode(): ArtMode {
  try {
    return sessionStorage.getItem(MODE_KEY) === "artwork" ? "artwork" : "animated";
  } catch {
    return "animated";
  }
}

export function saveArtMode(mode: ArtMode): void {
  try {
    sessionStorage.setItem(MODE_KEY, mode);
  } catch {
    /* the choice just isn't remembered */
  }
}
