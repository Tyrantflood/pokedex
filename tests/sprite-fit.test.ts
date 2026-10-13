import assert from "node:assert/strict";
import { test } from "node:test";
import { fitStaticToBox, parseGifSize, type Bounds } from "../lib/battle/sprite-fit";
import { gifCounterpart, spriteTiers } from "../lib/battle/sprite-chain";

const header = (signature: string, w: number, h: number) => new Uint8Array([...[...signature].map((c) => c.charCodeAt(0)), w & 255, w >> 8, h & 255, h >> 8, 0xf7, 0, 0]);

test("a GIF's size is read from its first ten bytes", () => {
  assert.deepEqual(parseGifSize(header("GIF89a", 301, 240)), { w: 301, h: 240 });
  assert.deepEqual(parseGifSize(header("GIF87a", 60, 5)), { w: 60, h: 5 });
  assert.equal(parseGifSize(header("GIF90z", 60, 60)), null, "not a GIF");
  assert.equal(parseGifSize(new Uint8Array([71, 73, 70])), null, "too short");
  assert.equal(parseGifSize(header("GIF89a", 0, 10)), null, "an empty canvas");
  assert.equal(parseGifSize(new TextEncoder().encode("<html>404 not found</html>")), null, "an error page");
});

// A padded static sprite: 96 x 96, the creature occupying x 30..66 and y 20..90 (36 wide, 70 tall), standing near the bottom.
const bounds: Bounds = { naturalWidth: 96, naturalHeight: 96, left: 30, top: 20, right: 66, bottom: 90 };

test("the stand-in is scaled until the creature fills the GIF's box, feet on the bottom edge and centred across", () => {
  const box = { w: 140, h: 120 }; // the GIF will be 140 x 120
  const p = fitStaticToBox(bounds, box)!;
  const s = p.width / 96; // pixels of box per pixel of sprite
  // The creature is 36 x 70 in sprite pixels; the height is the tight dimension (120/70 < 140/36).
  assert.ok(Math.abs(s - 120 / 70) < 1e-9, `scale ${s}`);
  // Where the creature's bounding box lands inside the box:
  const creature = { left: p.left + 30 * s, right: p.left + 66 * s, top: p.top + 20 * s, bottom: p.top + 90 * s };
  assert.ok(Math.abs(creature.bottom - 120) < 1e-9, "feet on the bottom edge");
  assert.ok(Math.abs(creature.top - 0) < 1e-9, "head at the top: the tight dimension is filled exactly");
  assert.ok(Math.abs((creature.left + creature.right) / 2 - 70) < 1e-9, "centred across");
  assert.ok(creature.left >= 0 && creature.right <= 140, "inside the box");
  assert.deepEqual(p.box, box);
  assert.equal(p.height / 96, s, "square pixels: both axes scaled alike");
});

test("a wide box limits the scale by width instead, and the creature still stays inside it", () => {
  const p = fitStaticToBox(bounds, { w: 36, h: 200 })!;
  const s = p.width / 96;
  assert.ok(Math.abs(s - 1) < 1e-9, "36 / 36");
  const creature = { left: p.left + 30 * s, right: p.left + 66 * s, bottom: p.top + 90 * s, top: p.top + 20 * s };
  assert.ok(creature.left >= -1e-9 && creature.right <= 36 + 1e-9);
  assert.ok(Math.abs(creature.bottom - 200) < 1e-9, "feet still on the bottom edge");
  assert.ok(creature.top >= 0);
});

test("the visible part of the stand-in ends up the size of the GIF it waits for, for a spread of boxes", () => {
  for (const box of [{ w: 50, h: 50 }, { w: 245, h: 245 }, { w: 106, h: 240 }, { w: 377, h: 223 }, { w: 20, h: 300 }]) {
    const p = fitStaticToBox(bounds, box)!;
    const s = p.width / 96;
    const w = 36 * s;
    const h = 70 * s;
    assert.ok(w <= box.w + 1e-9 && h <= box.h + 1e-9, "never bigger than the box");
    assert.ok(Math.abs(w - box.w) < 1e-6 || Math.abs(h - box.h) < 1e-6, `one dimension fills the box (${box.w}x${box.h})`);
  }
});

test("nothing to fit gives nothing", () => {
  assert.equal(fitStaticToBox({ ...bounds, right: 30 }, { w: 100, h: 100 }), null, "an empty creature");
  assert.equal(fitStaticToBox(bounds, { w: 0, h: 100 }), null);
});

test("the stand-in knows which GIF it waits for: the one in its own tier, with the same flip", () => {
  const back = spriteTiers(465, "back");
  const pngOf = (id: string) => back.flat().find((c) => c.id === id)!;
  assert.equal(gifCounterpart(back, pngOf("back-png"))?.id, "back-gif");
  assert.equal(gifCounterpart(back, pngOf("front-png-flipped"))?.id, "front-gif-flipped");
  assert.equal(gifCounterpart(back, pngOf("back-gif")), null, "a GIF waits for nothing");
  assert.equal(gifCounterpart(spriteTiers(465, "front"), spriteTiers(465, "front").flat().find((c) => c.id === "front-png")!)?.id, "front-gif");
  // A candidate object from another call still matches: identity is by id.
  assert.equal(gifCounterpart(spriteTiers(465, "back"), spriteTiers(465, "back")[0][1])?.id, "back-gif");
});
