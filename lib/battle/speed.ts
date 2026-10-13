/**
 * How much faster than the base timings (the holds in protocol.ts and the animation lengths in move-fx.ts) each mode plays.
 * Normal trims a third off the base timings; Fast is three times Normal; reduced motion is faster still (its animations are gone, and
 * the banner is held for a readable moment separately, see moveHoldMs).
 */
export const NORMAL_SPEED = 1.5;
export const FAST_SPEED = NORMAL_SPEED * 3;
export const REDUCED_MOTION_SPEED = 6;

export function speedFor(mode: { reducedMotion: boolean; fast: boolean }): number {
  return mode.reducedMotion ? REDUCED_MOTION_SPEED : mode.fast ? FAST_SPEED : NORMAL_SPEED;
}
