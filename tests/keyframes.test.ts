import assert from "node:assert/strict";
import { test } from "node:test";
import { toKeyframes, toOptions } from "../lib/battle/keyframes";

test("equal-length lists become evenly spaced keyframes with one transform string and the opacity", () => {
  const k = toKeyframes({ x: [0, 50, 100], y: [0, -10, 0], scale: [1, 1.5, 1], opacity: [0, 1, 0] });
  assert.deepEqual(k.map((f) => f.offset), [0, 0.5, 1]);
  assert.equal(k[1].transform, "translate(50px, -10px) scale(1.5, 1.5)");
  assert.deepEqual(k.map((f) => f.opacity), [0, 1, 0]);
  assert.ok(k.every((f) => f.easing === "ease-in-out"));
});

test("lists of different lengths share one set of keyframes by interpolating at every offset used", () => {
  // a steady flight (two values) with a fade in and out (four): the flight is at a third of its way at the first fade point
  const k = toKeyframes({ x: [0, 90], opacity: [0, 1, 1, 0] });
  assert.deepEqual(k.map((f) => +(f.offset as number).toFixed(3)), [0, 0.333, 0.667, 1]);
  assert.deepEqual(k.map((f) => f.transform), ["translate(0px, 0px)", "translate(30px, 0px)", "translate(60px, 0px)", "translate(90px, 0px)"]);
  assert.deepEqual(k.map((f) => f.opacity), [0, 1, 1, 0]);
});

test("`times` place the lists that are as long as it, and the others stay evenly spread", () => {
  const k = toKeyframes({ opacity: [0, 1, 1, 0], scaleX: [0, 1] }, { times: [0, 0.1, 0.9, 1] });
  assert.deepEqual(k.map((f) => f.offset), [0, 0.1, 0.9, 1]);
  assert.equal(k[1].transform, "scale(0.1, 1)"); // scaleX runs 0 -> 1 over the whole animation
  assert.equal(k[2].transform, "scale(0.9, 1)");
  assert.deepEqual(k.map((f) => f.opacity), [0, 1, 1, 0]);
});

test("a single value holds for the whole animation, a property left out is left out, and nothing means no keyframes", () => {
  const k = toKeyframes({ rotate: 10, opacity: [0, 1] });
  assert.deepEqual(k.map((f) => f.transform), ["rotate(10deg)", "rotate(10deg)"]);
  assert.equal(k.some((f) => "scale" in f), false);
  assert.deepEqual(toKeyframes({}), []);
  assert.deepEqual(toKeyframes({ x: [] }), []);
  const onlyOpacity = toKeyframes({ opacity: [0, 1, 0] });
  assert.ok(onlyOpacity.every((f) => !("transform" in f)));
});

test("only transform and opacity are ever written (nothing that would lay out or paint again), whatever the frames", () => {
  const k = toKeyframes({ x: [0, 1], y: [0, 1], scale: [1, 2], scaleX: [0, 1], scaleY: [1, 0], rotate: [0, 360], opacity: [0, 1] }, { ease: "easeOut", times: [0, 1] });
  for (const frame of k) for (const key of Object.keys(frame)) assert.ok(["offset", "easing", "transform", "opacity"].includes(key), key);
  assert.ok(k.every((f) => f.easing === "ease-out"));
  assert.equal(k[1].transform, "translate(1px, 1px) rotate(360deg) scale(2, 0)");
});

test("the options hold the first frame through the delay and the last after the end, in milliseconds", () => {
  assert.deepEqual(toOptions({ duration: 0.55, delay: 0.25 }), { duration: 550, delay: 250, fill: "both", easing: "linear" });
  assert.equal(toOptions({ duration: 0.4 }, "none").fill, "none");
  assert.equal(toOptions({ duration: 0 }).duration, 1, "never zero");
  assert.equal(toOptions({ duration: 1, delay: -2 }).delay, 0);
});
