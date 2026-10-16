import assert from "node:assert/strict";
import { test } from "node:test";
import { moveChoice, SPECIAL_SUFFIX, type Special } from "../lib/battle/move-choice";

test("a move is plain unless a toggle is on: Mega, Ultra Burst, Z-Move, Dynamax and Tera are never added by themselves", () => {
  for (const slot of [1, 2, 3, 4]) assert.equal(moveChoice(slot, null), `move ${slot}`);
  const all: Special[] = ["mega", "ultra", "z", "dynamax", "tera"];
  assert.deepEqual(all.map((s) => moveChoice(2, s)), ["move 2 mega", "move 2 ultra", "move 2 zmove", "move 2 dynamax", "move 2 terastallize"]);
  assert.equal(Object.keys(SPECIAL_SUFFIX).length, 5);
});
