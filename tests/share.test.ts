import assert from "node:assert/strict";
import { test } from "node:test";
import { inviteUrl, shareMessage, shareMethod } from "../lib/battle/room-config";

test("the invite is shared as \"Battle me on DEX-LINK: <link>\", with the room's private link", () => {
  const url = inviteUrl("https://pokedex.example", "abcdefghijklmnop");
  assert.equal(url, "https://pokedex.example/battle?room=abcdefghijklmnop");
  assert.equal(shareMessage(url), "Battle me on DEX-LINK: https://pokedex.example/battle?room=abcdefghijklmnop");
});

test("Share opens the native sheet only on a touch device that has one; everywhere else it copies the message", () => {
  assert.equal(shareMethod({ canShare: true, touch: true }), "native", "a phone");
  assert.equal(shareMethod({ canShare: true, touch: false }), "copy", "a desktop browser that happens to have navigator.share");
  assert.equal(shareMethod({ canShare: false, touch: true }), "copy", "a touch device without it");
  assert.equal(shareMethod({ canShare: false, touch: false }), "copy");
});
