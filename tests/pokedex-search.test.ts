import assert from "node:assert/strict";
import { test } from "node:test";
import { matchesQuery, parseQuery, searchKey } from "../lib/pokedex-search";

test("the shared search matches by name part, number prefix, hyphen and #", () => {
  const key = searchKey("great-tusk");
  assert.equal(key, "great tusk");
  assert.ok(matchesQuery(parseQuery("tusk"), key, 984));
  assert.ok(matchesQuery(parseQuery("Great-Tusk"), key, 984));
  assert.ok(matchesQuery(parseQuery("#98"), key, 984));
  assert.ok(matchesQuery(parseQuery("0984"), key, 984));
  assert.ok(matchesQuery(parseQuery(""), key, 984));
  assert.ok(!matchesQuery(parseQuery("pika"), key, 984));
  assert.ok(!matchesQuery(parseQuery("99"), key, 984));
});
