import type { SideId } from "@/lib/battle/protocol";

/** Where each side's Pokémon stands, as a percentage of the field: horizontal centre and the bottom edge of the sprite. */
export const SPOT: Record<SideId, { x: number; y: number }> = { p1: { x: 27, y: 82 }, p2: { x: 72, y: 50 } };

export interface Size {
  w: number;
  h: number;
}
export interface Point {
  x: number;
  y: number;
}

/** The middle of a side's Pokémon, in pixels: a sprite's feet are at `y`, and its middle is a little above them. */
export function centerOf(side: SideId, size: Size): Point {
  const spot = SPOT[side];
  return { x: (size.w * spot.x) / 100, y: (size.h * (spot.y - 11)) / 100 };
}

export const distance = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);
export const angleDeg = (a: Point, b: Point) => (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
