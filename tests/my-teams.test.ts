import assert from "node:assert/strict";
import { test } from "node:test";
import { copyTeam, exportBackup, findTeam, importBackup, normalizeSet, parseStore, removeTeam, serializeStore, upsertTeam, type SavedTeam } from "../lib/battle/my-teams";

const set = { species: "Great Tusk", item: "Leftovers", ability: "Protosynthesis", moves: ["Earthquake", "Rapid Spin", "Knock Off", "Ice Spinner", "Extra"], nature: "Jolly", evs: { atk: 252, spe: 252, hp: 4 }, teraType: "Steel" };
const team = (id: string, name = "Team"): SavedTeam => ({ id, name, formatKey: "team-gen9ou", sets: [normalizeSet(set)!], updatedAt: 5, check: { ok: true, errors: [], formatId: "gen9ou@@@!Team Preview" }, icons: [984] });

test("a set is read safely: defaults filled, four moves, no nickname, numbers clamped", () => {
  const s = normalizeSet({ ...set, name: "evil|nick", evs: { atk: 9999, spe: -4 }, ivs: { atk: 99 }, level: 500 })!;
  assert.equal(s.name, "Great Tusk");
  assert.equal(s.moves.length, 4);
  assert.deepEqual(s.evs, { hp: 0, atk: 255, def: 0, spa: 0, spd: 0, spe: 0 });
  assert.equal(s.ivs.atk, 31);
  assert.equal(s.ivs.hp, 31);
  assert.equal(s.level, 100);
  assert.equal(s.teraType, "Steel");
  assert.equal(normalizeSet({ species: "" }), null);
  assert.equal(normalizeSet(null), null);
  assert.equal(normalizeSet("Pikachu"), null);
});

test("the store round-trips, and a damaged save cannot throw", () => {
  const store = upsertTeam(upsertTeam({ version: 1, teams: [] }, team("aaaa1111")), team("bbbb2222", "Second"));
  assert.deepEqual(store.teams.map((t) => t.id), ["bbbb2222", "aaaa1111"], "newest first");
  assert.deepEqual(parseStore(serializeStore(store)), store);
  for (const junk of ["", "nope", "null", "[]", '{"version":2,"teams":[]}', '{"version":1}', '{"version":1,"teams":"x"}', '{"version":1,"teams":[1,null,{"id":"x"},{"id":"abcd","formatKey":"f","sets":"bad"}]}']) {
    const parsed = parseStore(junk);
    assert.equal(parsed.version, 1);
    assert.ok(Array.isArray(parsed.teams));
  }
  const odd = parseStore('{"version":1,"teams":[{"id":"abcd","formatKey":"team-gen9ou","name":"","sets":[{"species":"Pikachu"},{"nope":1}]},{"id":"abcd","formatKey":"team-gen9ou"}]}');
  assert.equal(odd.teams.length, 1, "duplicate id dropped");
  assert.equal(odd.teams[0].name, "Untitled team");
  assert.equal(odd.teams[0].sets.length, 1);
});

test("upsert replaces by id, remove and find work, copy gets a new id", () => {
  let store = upsertTeam({ version: 1, teams: [] }, team("aaaa1111"));
  store = upsertTeam(store, { ...team("aaaa1111"), name: "Renamed" });
  assert.equal(store.teams.length, 1);
  assert.equal(findTeam(store, "aaaa1111")?.name, "Renamed");
  const copy = copyTeam(store.teams[0], "Copy", "cccc3333", 9);
  assert.equal(copy.id, "cccc3333");
  copy.sets[0].moves[0] = "Changed";
  assert.notEqual(store.teams[0].sets[0].moves[0], "Changed", "a deep copy");
  assert.equal(removeTeam(store, "aaaa1111").teams.length, 0);
});

test("a backup restores into an empty store, skips identical teams, and adds changed ones as copies", () => {
  const store = upsertTeam(upsertTeam({ version: 1, teams: [] }, team("aaaa1111")), team("bbbb2222", "Second"));
  const backup = exportBackup(store, 0);
  const restored = importBackup(backup, { version: 1, teams: [] });
  assert.ok(restored.ok);
  assert.deepEqual(restored.ok && restored.store.teams.map((t) => t.id).sort(), ["aaaa1111", "bbbb2222"]);
  const again = importBackup(backup, store);
  assert.ok(again.ok && again.added === 0 && again.skipped === 2, "importing the same backup twice adds nothing");
  const edited = upsertTeam(store, { ...store.teams[1], name: "Edited" });
  let n = 0;
  const merged = importBackup(backup, edited, () => `new${n++}0000`);
  assert.ok(merged.ok && merged.added === 1 && merged.store.teams.length === 3, "the changed team is kept and the backup's version added as a copy");
  for (const bad of ["not json", "{}", '{"kind":"other","version":1}', JSON.stringify({ kind: "pokedex-battle-teams", version: 9, teams: [] })]) assert.equal(importBackup(bad, store).ok, false, bad);
});
