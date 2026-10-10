import assert from "node:assert/strict";
import test from "node:test";

// preload-image.ts uses the browser's Image; stand in a recording fake so the cache's bookkeeping can be checked.
class FakeImage {
  src: string | null = "";
  released = false;
  decoding = "";
  static created: FakeImage[] = [];
  constructor() {
    FakeImage.created.push(this);
  }
  removeAttribute(attribute: string) {
    if (attribute === "src") {
      this.src = null;
      this.released = true;
    }
  }
  decode() {
    return Promise.resolve();
  }
}
Object.assign(globalThis, { Image: FakeImage });
const { MAX_PRELOADED_IMAGES, preloadImage } = await import("../lib/preload-image");

const url = (i: number) => `https://x/${i}.png`;
const requested = (action: () => void) => {
  const before = FakeImage.created.length;
  action();
  return FakeImage.created.length - before;
};

test("the preload cache holds the last 50 images: oldest evicted, touching refreshes, floods stay capped", () => {
  const created = FakeImage.created;
  assert.equal(MAX_PRELOADED_IMAGES, 50);

  for (let i = 1; i <= 50; i++) preloadImage(url(i));
  assert.equal(created.length, 50, "50 distinct urls -> 50 images");
  assert.equal(requested(() => preloadImage(url(1))), 0, "url 1 is still cached; touching it makes it the most recent");

  // url 2 is now the oldest: a 51st evicts it, not url 1.
  assert.equal(requested(() => preloadImage(url(51))), 1);
  assert.equal(created[1].released, true, "the oldest (url 2) was released");
  assert.notEqual(created[0].released, true, "the touched url 1 survived");
  assert.equal(requested(() => preloadImage(url(1))), 0);
  assert.equal(requested(() => preloadImage(url(2))), 1, "url 2 was evicted, so it is requested again");

  for (let i = 100; i < 400; i++) preloadImage(url(i));
  assert.equal(created.filter((image) => !image.released).length, 50, "a 300-url flood leaves exactly 50 live images");
  assert.equal(requested(() => preloadImage(url(399))), 0, "the most recent is still cached");
  assert.equal(requested(() => preloadImage(null)), 0, "null is ignored");
});
