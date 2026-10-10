import assert from "node:assert/strict";
import test from "node:test";
import { computeScale, compareHeights, formatMetres, HUMAN_HEIGHT_DM, renderedSize, rulerStepDm, type ScaleInput, type Subject } from "../lib/compare-scale";

/** A small seeded random generator, so a failure in the random runs can be reproduced. */
function seeded(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

const MIN_COLUMN = 124;

test("one scale for everybody: drawn height is exactly proportional to real height, and the row always fits", () => {
  const random = seeded(2024);
  const between = (a: number, b: number) => a + random() * (b - a);
  let maxError = 0;
  let heightLimited = 0;
  let widthLimited = 0;
  let tooNarrow = 0;

  for (let n = 0; n < 20_000; n++) {
    const subjects: Subject[] = [
      { heightDm: Math.round(between(1, 200)), aspect: between(0.2, 4) },
      { heightDm: HUMAN_HEIGHT_DM, aspect: 0.35 },
      { heightDm: Math.round(between(1, 200)), aspect: between(0.2, 4) },
    ];
    const input: ScaleInput = { subjects, stageWidth: between(300, 1400), stageHeight: between(200, 700), gap: 28, topPad: 30, bottomPad: 50, minColumnWidth: MIN_COLUMN };
    const px = computeScale(input);
    const tallest = Math.max(...subjects.map((s) => s.heightDm));
    const rowWidth = (scale: number) => subjects.reduce((w, s) => w + Math.max(s.heightDm * scale * s.aspect, MIN_COLUMN), 0) + input.gap * 4;
    const byHeight = (input.stageHeight - input.topPad - input.bottomPad) / tallest;

    subjects.forEach((s) => {
      maxError = Math.max(maxError, Math.abs(renderedSize(s, px).height / s.heightDm - px));
    });
    assert.ok(px > 0);
    assert.ok(tallest * px <= input.stageHeight - input.topPad - input.bottomPad + 1e-6, "fits vertically");

    if (rowWidth(0.01) > input.stageWidth) {
      // Narrower than three labels: nothing can make it fit, so it uses the height-limited scale and scrolls sideways.
      tooNarrow++;
      assert.ok(Math.abs(px - Math.max(0.01, byHeight)) < 1e-9, "a very narrow stage falls back to the height-limited scale, not a dot");
      continue;
    }
    assert.ok(rowWidth(px) <= input.stageWidth + 1e-6, "the row, labels included, fits the stage width");
    if (px < byHeight - 1e-6) {
      widthLimited++;
      assert.ok(rowWidth(px * 1.01) > input.stageWidth - 1e-6, "the width-limited scale is the largest that fits");
    } else heightLimited++;
  }
  assert.ok(maxError < 1e-9, `drawn height / real height differs between subjects by ${maxError}`);
  assert.ok(heightLimited > 0 && widthLimited > 0 && tooNarrow > 0, "the random runs reach all three regimes");
});

test("Wailord next to a human and a Joltik keep their 145 : 17 : 1 ratios", () => {
  const px = computeScale({
    subjects: [{ heightDm: 145, aspect: 1.9 }, { heightDm: 17, aspect: 0.35 }, { heightDm: 1, aspect: 1 }],
    stageWidth: 560,
    stageHeight: 380,
    gap: 28,
    topPad: 30,
    bottomPad: 50,
    minColumnWidth: MIN_COLUMN,
  });
  assert.ok(Math.abs((145 * px) / (17 * px) - 145 / 17) < 1e-9);
  assert.ok(Math.abs((17 * px) / (1 * px) - 17) < 1e-9);
});

test("height wording, metres and ruler steps", () => {
  assert.equal(compareHeights(34, 17), "2.0× taller");
  assert.equal(compareHeights(17, 34), "2.0× shorter");
  assert.equal(compareHeights(17, 17), "exactly the same height");
  assert.equal(compareHeights(145, 5), "29× taller");
  assert.equal(formatMetres(17), "1.7 m");
  for (const dm of [1, 10, 100, 145, 700]) assert.ok(dm / rulerStepDm(dm) <= 8, `a ruler for ${dm} dm has at most 8 steps`);
});
