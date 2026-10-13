import assert from "node:assert/strict";
import { test } from "node:test";
import { FAST_SPEED, NORMAL_SPEED, REDUCED_MOTION_SPEED, speedFor } from "../lib/battle/speed";
import { BANNER_MS, moveHoldMs, planMove } from "../lib/battle/move-fx";

test("Fast is three times Normal, Normal is a third shorter than the base timings, reduced motion is quickest", () => {
  assert.equal(NORMAL_SPEED, 1.5, "base timings divided by 1.5: a third off");
  assert.equal(FAST_SPEED / NORMAL_SPEED, 3);
  assert.ok(REDUCED_MOTION_SPEED >= FAST_SPEED);
  assert.equal(speedFor({ reducedMotion: false, fast: false }), NORMAL_SPEED);
  assert.equal(speedFor({ reducedMotion: false, fast: true }), FAST_SPEED);
  assert.equal(speedFor({ reducedMotion: true, fast: true }), REDUCED_MOTION_SPEED, "reduced motion wins over Fast");
});

test("a move's whole hold at Fast is a third of its hold at Normal", () => {
  const fx = planMove({ name: "Flamethrower", type: "fire", category: "Special", selfTarget: false });
  const hold = moveHoldMs(fx, false);
  assert.equal(hold, BANNER_MS + fx.durationMs);
  const normal = hold / speedFor({ reducedMotion: false, fast: false });
  const fast = hold / speedFor({ reducedMotion: false, fast: true });
  assert.ok(Math.abs(normal / fast - 3) < 1e-9);
  assert.ok(fast > 100, `a Fast banner plus attack should still last ${fast.toFixed(0)} ms: long enough to register`);
});
