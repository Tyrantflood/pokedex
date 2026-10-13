/**
 * Makes the static sprite that stands in while an animated GIF downloads occupy the same box the GIF will, so nothing jumps when the
 * GIF arrives. The same idea as the Pokédex detail view's `useFitTransform`: the static sprites are padded squares (96 px) with the
 * creature small in the middle, the GIFs are cropped tight to the creature, so by default the stand-in is drawn much smaller. Here we
 * know the GIF's size before it has downloaded (its header, see `parseGifSize`), so the stand-in is scaled until the creature's visible
 * part (from the alpha scan in lib/sprite-bounds.ts) fits that box, feet on the bottom edge, centred across.
 *
 * Pure geometry, in one unit (the GIF's own pixels); the caller multiplies by its display scale.
 */
import type { Size } from "./sprite-chain";

/** The size a GIF will have, from its first ten bytes ("GIF87a" or "GIF89a", then the logical screen width and height, little endian). */
export function parseGifSize(bytes: Uint8Array): Size | null {
  if (bytes.length < 10) return null;
  const signature = String.fromCharCode(...bytes.slice(0, 6));
  if (signature !== "GIF87a" && signature !== "GIF89a") return null;
  const w = bytes[6] | (bytes[7] << 8);
  const h = bytes[8] | (bytes[9] << 8);
  return w > 0 && h > 0 ? { w, h } : null;
}

/** Where the creature is inside a padded sprite: image size, and the opaque region (left/top inclusive, right/bottom exclusive). */
export interface Bounds {
  naturalWidth: number;
  naturalHeight: number;
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface Placement {
  /** The box to reserve (the GIF's size). */
  box: Size;
  /** Where to draw the whole padded image inside the box, and how large. */
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Scales and positions a padded sprite so its visible part fits `box`: as large as fits, centred across, feet on the bottom edge. */
export function fitStaticToBox(bounds: Bounds, box: Size): Placement | null {
  const visibleW = bounds.right - bounds.left;
  const visibleH = bounds.bottom - bounds.top;
  if (visibleW <= 0 || visibleH <= 0 || box.w <= 0 || box.h <= 0) return null;
  const s = Math.min(box.w / visibleW, box.h / visibleH);
  return {
    box,
    left: box.w / 2 - ((bounds.left + bounds.right) / 2) * s,
    top: box.h - bounds.bottom * s,
    width: bounds.naturalWidth * s,
    height: bounds.naturalHeight * s,
  };
}
