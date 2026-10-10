import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { nameFromTable, type LocationNameTable } from "../lib/location-table";

// The table that ships with the app (scripts/build-location-names.mjs writes it; it is committed).
const table = JSON.parse(readFileSync(new URL("../lib/location-names.generated.json", import.meta.url), "utf8")) as LocationNameTable;
const areaSlugs = Object.keys(table.areas);

test("the shipped table is well formed and complete enough to rely on", () => {
  assert.equal(table.version, 1);
  assert.ok(Number.isFinite(Date.parse(table.generatedAt)), "generatedAt is a date");
  assert.ok(areaSlugs.length >= 1000, `${areaSlugs.length} areas`);
  assert.ok(Object.keys(table.locations).length >= 1000, `${Object.keys(table.locations).length} locations`);
  for (const slug of areaSlugs) {
    const [english, location] = table.areas[slug];
    assert.ok(english === null || (typeof english === "string" && english.length > 0), `${slug}: English name`);
    assert.ok(location in table.locations, `${slug}: its location "${location}" is in the table`);
  }
  for (const [slug, english] of Object.entries(table.locations)) assert.ok(english === null || english.length > 0, `${slug}: English name`);
});

test("every area in the table resolves to a sane name", () => {
  for (const slug of areaSlugs) {
    const name = nameFromTable(slug, table);
    assert.ok(name && name.trim().length > 0, `${slug}: empty name`);
    assert.ok(!/\(\s*\)/.test(name), `${slug}: empty brackets in "${name}"`);
    // PokéAPI's "Road N" for a route is corrected; the real "Victory Road N" is not.
    assert.ok(!/\bRoad \d/.test(name) || /Victory Road \d/.test(name), `${slug}: "${name}"`);
  }
});

test("known areas across generations", () => {
  const want: Record<string, string> = {
    "pallet-town-area": "Pallet Town",
    "mt-moon-1f": "Mt. Moon (1F)",
    "pokemon-tower-6f": "Pokémon Tower (6F)",
    "hoenn-route-120-area": "Route 120",
    "kalos-route-2-area": "Route 2",
    "alola-route-1-east": "Route 1 (East)",
    "ballimere-lake-max-den-c": "Ballimere Lake (Max Den C)",
    "relic-passage-castelia-sewers-entrance": "Relic Passage (Castelia Sewers entrance)",
    "hoenn-pokecenter-area": "Pokecenter", // no English name anywhere: the slug formatter
  };
  for (const [slug, name] of Object.entries(want)) assert.equal(nameFromTable(slug, table), name, slug);
});

test("an area (or a location) the table lacks is undefined, so the caller looks it up; a null English name is an answer", () => {
  assert.equal(nameFromTable("not-a-real-area", table), undefined);
  const small: LocationNameTable = {
    version: 1,
    generatedAt: new Date().toISOString(),
    areas: { "a-area": ["A", "a"], "orphan-area": ["Orphan", "missing-location"], "bare-area": [null, "bare"] },
    locations: { a: "A", bare: null },
  };
  assert.equal(nameFromTable("a-area", small), "A");
  assert.equal(nameFromTable("orphan-area", small), undefined, "its location isn't in the table");
  assert.equal(nameFromTable("bare-area", small), "Bare", "no English name at all is a known fact: the slug formatter, with no lookup");
});
