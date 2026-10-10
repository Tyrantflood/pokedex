import assert from "node:assert/strict";
import test from "node:test";
import { MAX_VERDICT_LENGTH, verdict } from "../lib/verdict";
import { pokemonNamed, pokemonSnapshot } from "./fixtures/load";

const pretty = (name: string) => name.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

test("6,000 random pairs: always one clean line that names someone, the same in either order", () => {
  let state = 7;
  const random = () => (state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 2 ** 32;
  const pick = () => pokemonSnapshot[Math.floor(random() * pokemonSnapshot.length)];

  const lines = new Set<string>();
  let pairs = 0;
  for (let i = 0; i < 6000; i++) {
    const a = pick();
    const b = pick();
    if (a.id === b.id) continue;
    pairs++;
    const line = verdict(a, b);
    assert.ok(line.length > 10 && line.length <= MAX_VERDICT_LENGTH, `length ${line.length}: ${line}`);
    assert.ok(!/\n/.test(line), "one line");
    assert.ok(!/NaN|undefined|Infinity|null/.test(line), `no junk: ${line}`);
    assert.ok(line.includes(pretty(a.name)) || line.includes(pretty(b.name)), `mentions at least one of them: ${line}`);
    assert.equal(verdict(a, b), line, "deterministic");
    assert.equal(verdict(b, a), line, "the same line whichever order they are compared in");
    lines.add(line);
  }
  assert.ok(pairs > 5900);
  assert.ok(lines.size > 200, `only ${lines.size} distinct lines: the wording should vary`);
});

test("identical stat blocks read as a tie", () => {
  const first = pokemonSnapshot[0];
  assert.match(verdict(first, { ...first, id: 99999, name: "twin" }), /Dead heat|too close/);
});

test("well-known pairs produce a verdict", () => {
  for (const [x, y] of [["charizard", "venusaur"], ["pikachu", "diglett"], ["wailord", "joltik"], ["shuckle", "deoxys-speed"], ["eevee", "snorlax"], ["mewtwo", "magikarp"]]) {
    const line = verdict(pokemonNamed(x), pokemonNamed(y));
    assert.ok(line.length > 10 && line.length <= MAX_VERDICT_LENGTH, `${x} vs ${y}: ${line}`);
  }
});
