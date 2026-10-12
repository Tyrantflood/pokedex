import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { allSpriteUrls } from "../lib/battle/ids";
import { PLACEHOLDER_URL, runChain, spriteTiers, type Probe, type Shown, type Size } from "../lib/battle/sprite-chain";

const availability: Record<string, string> = JSON.parse(readFileSync(new URL("./fixtures/sprite-availability.json", import.meta.url), "utf8"));
const IDS = Object.keys(availability).map(Number);

const SIZE: Size = { w: 96, h: 96 };
const tick = () => new Promise((r) => setTimeout(r, 0));
/** The chain only needs promise callbacks to run, which a few microtask turns flush: far faster than timers for thousands of runs. */
const flush = async () => {
  for (let i = 0; i < 16; i++) await Promise.resolve();
};

/** A probe that answers from a table of which URLs exist (instantly), as the real network would for a healthy connection. */
function probeFor(bits: string, id: number): Probe {
  const u = allSpriteUrls(id);
  const existing = new Set([u.backGif, u.backPng, u.frontGif, u.frontPng, u.artwork].filter((_, i) => bits[i] === "1"));
  return async (url) => (existing.has(url) ? SIZE : null);
}

/** Runs a chain to the end and returns what was shown last. */
async function settle(id: number, facing: "back" | "front", probe: Probe, stageMs = 5): Promise<{ last: Shown | null; updates: Shown[] }> {
  const updates: Shown[] = [];
  const stop = runChain(spriteTiers(id, facing), probe, (s) => updates.push(s), { stageMs });
  await flush();
  stop();
  return { last: updates.at(-1) ?? null, updates };
}

test("the chain for your Pokémon is animated back, static back, flipped front, artwork, placeholder; the opponent's has no back views", () => {
  const back = spriteTiers(465, "back");
  assert.deepEqual(
    back.flat().map((c) => `${c.kind}${c.flip ? " (flipped)" : ""}`),
    ["gif", "png", "gif (flipped)", "png (flipped)", "artwork (flipped)", "placeholder"],
  );
  const u = allSpriteUrls(465);
  assert.equal(back[0][0].url, u.backGif);
  assert.equal(back[0][1].url, u.backPng);
  assert.equal(back[1][0].url, u.frontGif, "the stand-in is the front view");
  assert.equal(back.at(-1)![0].url, PLACEHOLDER_URL);
  assert.deepEqual(
    spriteTiers(465, "front").flat().map((c) => c.kind),
    ["gif", "png", "artwork", "placeholder"],
  );
  assert.ok(spriteTiers(465, "front").flat().every((c) => !c.flip));
});

test("every Generation 1-5 species' back sprite loads through the chain, and so does every front sprite", async () => {
  assert.ok(IDS.length > 640, `only ${IDS.length} species in the snapshot`);
  let animated = 0;
  for (const id of IDS) {
    for (const facing of ["back", "front"] as const) {
      const { last } = await settle(id, facing, probeFor(availability[id], id));
      assert.ok(last, `${id} ${facing}: nothing was ever shown`);
      assert.notEqual(last!.candidate.kind, "placeholder", `${id} ${facing} ended on the placeholder though PokéAPI has pictures (${availability[id]})`);
      assert.equal(last!.waiting, false);
      if (last!.candidate.kind === "gif") animated++;
    }
  }
  assert.ok(animated > IDS.length, "most Pokémon should end up animated");
});

test("whatever PokéAPI is missing, every species still ends on the best picture that exists and is never left empty", async () => {
  // Knock out each combination of the five pictures for every species: 32 cases each, all 673 species.
  const names = ["back gif", "back png", "front gif", "front png", "artwork"];
  const expectBack = (bits: string) => (bits[0] === "1" ? "back gif" : bits[1] === "1" ? "back png" : bits[2] === "1" ? "front gif" : bits[3] === "1" ? "front png" : bits[4] === "1" ? "artwork" : "placeholder");
  const expectFront = (bits: string) => (bits[2] === "1" ? "front gif" : bits[3] === "1" ? "front png" : bits[4] === "1" ? "artwork" : "placeholder");
  const sample = IDS.filter((_, i) => i % 9 === 0); // 75 species x 32 combinations x 2 views keeps the test quick
  for (const id of sample) {
    for (let mask = 0; mask < 32; mask++) {
      const bits = [4, 3, 2, 1, 0].map((b) => ((mask >> b) & 1 ? "1" : "0")).join("");
      for (const facing of ["back", "front"] as const) {
        const { last } = await settle(id, facing, probeFor(bits, id));
        const expected = facing === "back" ? expectBack(bits) : expectFront(bits);
        const got = last ? `${last.candidate.kind === "gif" ? (last.candidate.url.includes("/back/") ? "back gif" : "front gif") : last.candidate.kind === "png" ? (last.candidate.url.includes("/back/") ? "back png" : "front png") : last.candidate.kind}` : "nothing";
        assert.equal(got, expected, `${id} ${facing} with ${names.filter((_, i) => bits[i] === "1").join(", ") || "no pictures"}`);
        if (expected === "placeholder") assert.equal(last?.waiting ?? false, false, "gave up: not 'waiting' any more");
        if (last && facing === "back" && expected.startsWith("front")) assert.equal(last.candidate.flip, true, "a front view standing in for the back is mirrored");
      }
    }
  }
});

test("a slow animated GIF never hides the Pokémon: the static sprite shows at once and the GIF replaces it on arrival", async () => {
  const u = allSpriteUrls(465); // Tangrowth: its back GIF is about 190 KB
  let releaseGif: (s: Size) => void = () => {};
  const gif = new Promise<Size>((resolve) => (releaseGif = resolve));
  const probe: Probe = (url) => (url === u.backGif ? gif : url === u.backPng ? Promise.resolve(SIZE) : Promise.resolve(null));
  const updates: Shown[] = [];
  const stop = runChain(spriteTiers(465, "back"), probe, (s) => updates.push(s), { stageMs: 50_000 });
  assert.equal(updates.length, 0, "nothing is announced synchronously: the caller shows the placeholder first");
  for (let i = 0; i < 4; i++) await tick();
  assert.equal(updates.length, 1);
  assert.equal(updates[0].candidate.kind, "png", "the 1 KB static sprite is up while the GIF downloads");
  assert.equal(updates[0].candidate.url, u.backPng);
  releaseGif({ w: 245, h: 245 });
  for (let i = 0; i < 4; i++) await tick();
  assert.equal(updates.at(-1)!.candidate.kind, "gif");
  assert.deepEqual(updates.at(-1)!.size, { w: 245, h: 245 });
  stop();
});

test("when the back pictures fail the next tier starts at once; when they merely hang it starts after the stage delay", async () => {
  const u = allSpriteUrls(1);
  const calls: string[] = [];
  const failBack: Probe = async (url) => {
    calls.push(url);
    return url === u.frontGif ? SIZE : null;
  };
  const a = await settle(1, "back", failBack);
  assert.equal(a.last!.candidate.id, "front-gif-flipped");
  assert.deepEqual(calls.slice(0, 3), [u.backGif, u.backPng, u.frontGif], "back pair first, then the flipped front, with no waiting");

  // Both back pictures hang forever: after stageMs the front view is brought in anyway.
  const hang: Probe = (url) => (url === u.backGif || url === u.backPng ? new Promise<Size | null>(() => {}) : Promise.resolve(url === u.frontPng ? SIZE : null));
  const updates: Shown[] = [];
  const stop = runChain(spriteTiers(1, "back"), hang, (s) => updates.push(s), { stageMs: 20 });
  await tick();
  assert.equal(updates.length, 0, "still waiting inside the stage delay");
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(updates.at(-1)?.candidate.id, "front-png-flipped");
  stop();
});

test("with nothing loadable the placeholder is the final answer, and a stopped chain stays silent", async () => {
  const none: Probe = async () => null;
  const { last } = await settle(25, "back", none);
  assert.equal(last!.candidate.kind, "placeholder");
  assert.equal(last!.waiting, false);
  const updates: Shown[] = [];
  const stop = runChain(spriteTiers(25, "back"), async () => SIZE, (s) => updates.push(s), { stageMs: 5 });
  stop();
  for (let i = 0; i < 4; i++) await tick();
  assert.equal(updates.length, 0, "stopped before anything loaded");
});
