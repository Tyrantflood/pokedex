import assert from "node:assert/strict";
import { test } from "node:test";
import { activeRoomPath, leavingCostsForfeit, parseActiveRoom, serializeActiveRoom } from "../lib/battle/active-room";
import { ROOM_TTL_MS } from "../lib/battle/room-protocol";

const now = 1_000_000_000;
const room = { code: "abcdefghijklmnop", formatKey: "team-gen9ou", phase: "playing" as const, savedAt: now - 1000 };

test("a saved room round-trips and points back at its battle", () => {
  assert.deepEqual(parseActiveRoom(serializeActiveRoom(room), now), room);
  assert.equal(activeRoomPath(room), "/battle?room=abcdefghijklmnop");
});

test("anything damaged, foreign or stale is ignored, never thrown on", () => {
  for (const raw of [null, undefined, "", "nope", "null", "[]", "{}", JSON.stringify({ ...room, code: "short" }), JSON.stringify({ ...room, code: "../../etc/passwd" }), JSON.stringify({ ...room, phase: "ended" }), JSON.stringify({ ...room, phase: "x" }), JSON.stringify({ ...room, formatKey: 5 }), JSON.stringify({ ...room, savedAt: "yesterday" }), JSON.stringify({ ...room, savedAt: now + 3_600_000 })]) {
    assert.equal(parseActiveRoom(raw as string, now), null, String(raw));
  }
  assert.ok(parseActiveRoom(JSON.stringify({ ...room, savedAt: now - ROOM_TTL_MS + 1000 }), now), "just inside the room's lifetime");
  assert.equal(parseActiveRoom(JSON.stringify({ ...room, savedAt: now - ROOM_TTL_MS - 1000 }), now), null, "the server has deleted that room by now");
});

test("only a battle under way costs a forfeit to leave", () => {
  assert.equal(leavingCostsForfeit({ phase: "playing" }), true);
  assert.equal(leavingCostsForfeit({ phase: "teams" }), false);
  assert.equal(leavingCostsForfeit({ phase: "waiting" }), false);
});
