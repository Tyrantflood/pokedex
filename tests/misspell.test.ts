import assert from "node:assert/strict";
import test from "node:test";
import { misspell } from "../lib/misspell";

const samples = [
  "Spits fire that is hot enough to melt boulders. Known to cause forest fires unintentionally.",
  "It is said that its cry can be heard from far away, but it rarely uses it.",
  "A strange seed was planted on its back at birth. The plant sprouts and grows with this POKéMON.",
  "Ab cd ef.", // nothing eligible (no word of 4+ letters)
  "Hmm... ok",
];

test("a misspelling looks like a typo: same length, only letters change, first and last letter stay, 1 to 3 words", () => {
  let changed = 0;
  for (const text of samples) {
    for (let n = 0; n < 4000; n++) {
      const out = misspell(text);
      assert.equal(out.length, text.length, "length must be preserved (no layout shift)");
      assert.equal(out.replace(/[A-Za-z]/g, "x"), text.replace(/[A-Za-z]/g, "x"), "whitespace, punctuation and other characters are untouched");
      const before = text.split(/(\s+)/);
      const after = out.split(/(\s+)/);
      assert.equal(before.length, after.length);
      const diff = before.map((word, i) => [word, after[i]]).filter(([x, y]) => x !== y);
      if (out === text) continue;
      changed++;
      assert.ok(diff.length >= 1 && diff.length <= 3, `touches 1-3 words, got ${diff.length}`);
      for (const [x, y] of diff) {
        assert.ok(/^[A-Za-z]{4,}/.test(x), `only words with 4+ letters are altered: ${x}`);
        assert.notEqual(x.toLowerCase(), y.toLowerCase());
        assert.equal(x[0], y[0], `first letter stays put: ${x} -> ${y}`);
        assert.equal(x.at(-1), y.at(-1), `last character stays put: ${x} -> ${y}`);
      }
    }
  }
  assert.ok(changed > 10_000, "most runs on text with eligible words change something");
});

test("text with eligible words always changes; text without any is returned untouched", () => {
  for (let n = 0; n < 2000; n++) assert.notEqual(misspell(samples[0]), samples[0]);
  assert.equal(misspell("Ab cd ef."), "Ab cd ef.");
});
