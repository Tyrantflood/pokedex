import assert from "node:assert/strict";
import test from "node:test";
import { buildGameEncounters, planRows, type GameEncounters, type RawEncounterArea } from "../lib/encounter-data";
import { GAMES, gameName, gameOrder } from "../lib/games";

const detail = (method: string, min: number, max: number, chance: number, conditions: string[] = []) => ({
  method: { name: method },
  min_level: min,
  max_level: max,
  chance,
  condition_values: conditions.map((name) => ({ name })),
});

const raw: RawEncounterArea[] = [
  {
    location_area: { name: "kanto-route-1-area" },
    version_details: [
      { version: { name: "blue" }, encounter_details: [detail("walk", 2, 3, 20), detail("walk", 3, 5, 25), detail("surf", 10, 10, 5)] },
      { version: { name: "red" }, encounter_details: [detail("walk", 2, 5, 90)] },
    ],
  },
  {
    location_area: { name: "route-1-area" },
    version_details: [
      { version: { name: "red" }, encounter_details: [detail("walk", 4, 7, 60), detail("walk", 4, 7, 60, ["time-night"])] },
      { version: { name: "brand-new-game" }, encounter_details: [detail("gift", 5, 5, 100)] },
    ],
  },
  { location_area: { name: "viridian-forest-area" }, version_details: [{ version: { name: "red" }, encounter_details: [detail("walk", 3, 4, 10)] }] },
  {
    location_area: { name: "pallet-town-area" },
    // 140 in the data: capped at 100
    version_details: [{ version: { name: "red" }, encounter_details: [detail("walk", 1, 1, 70), detail("walk", 1, 1, 70)] }],
  },
];

test("games are in release order, unknown versions last", () => {
  assert.deepEqual(buildGameEncounters(raw).map((g) => g.version), ["red", "blue", "brand-new-game"]);
});

test("areas with the same name merge: best chance, widest levels; conditions stay separate; chance caps at 100", () => {
  const red = buildGameEncounters(raw)[0];
  const route1 = red.locations.find((l) => l.name === "Route 1");
  assert.ok(route1, "'kanto-route-1-area' and 'route-1-area' both read as Route 1");
  const plain = route1.entries.find((e) => e.method === "walk" && e.conditions.length === 0);
  assert.equal(plain?.chance, 90, "best of the merged areas (90 vs 60), not their sum");
  assert.equal(plain?.minLevel, 2);
  assert.equal(plain?.maxLevel, 7);
  assert.equal(route1.entries.find((e) => e.conditions.includes("time-night"))?.chance, 60);
  assert.equal(red.locations[0].name, "Pallet Town", "highest chance first");
  assert.equal(red.locations.find((l) => l.name === "Pallet Town")?.entries[0].chance, 100);
});

test("slots in one area add up", () => {
  const blue = buildGameEncounters(raw)[1].locations[0];
  assert.equal(blue.entries[0].chance, 45, "20 + 25");
  assert.equal(blue.entries[0].minLevel, 2);
  assert.equal(blue.entries[0].maxLevel, 5);
  assert.equal(blue.entries[1].method, "surf");
});

test("names come from outside, and areas that end up with the same name merge", () => {
  const areas: RawEncounterArea[] = [
    { location_area: { name: "kanto-route-2-south" }, version_details: [{ version: { name: "red" }, encounter_details: [detail("walk", 3, 4, 10)] }] },
    { location_area: { name: "kanto-route-2-north" }, version_details: [{ version: { name: "red" }, encounter_details: [detail("walk", 3, 4, 30)] }] },
  ];
  const merged = buildGameEncounters(areas, () => "Route 2");
  assert.equal(merged[0].locations.length, 1);
  assert.equal(merged[0].locations[0].entries[0].chance, 30);
  const split = buildGameEncounters(areas, (slug) => (slug.endsWith("south") ? "Route 2 (South)" : "Route 2 (North)"));
  assert.deepEqual(split[0].locations.map((l) => l.name), ["Route 2 (North)", "Route 2 (South)"]);
  assert.equal(buildGameEncounters(areas)[0].locations[0].name, "Route 2 North", "the default is the slug formatter");
});

const dataFor = (version: string): GameEncounters => ({
  version,
  locations: [{ name: "X", entries: [{ method: "walk", conditions: [], minLevel: 1, maxLevel: 2, chance: 10 }] }],
});

test("planRows: games with data, 'no data' lines only for main games from the Pokémon's generation on", () => {
  const rows = planRows(buildGameEncounters(raw), 1);
  const text = rows.map((r) => (r.kind === "game" ? `[${r.game.version}]` : `(no data: ${r.games.map((g) => g.slug).join(",")})`));
  assert.equal(text[0], "[red]");
  assert.equal(text[1], "[blue]");
  assert.match(text[2], /^\(no data: yellow,gold,silver,crystal,ruby,sapphire,firered,leafgreen,emerald,diamond/);
  assert.equal(text.at(-1), "[brand-new-game]", "an unknown game with data is still shown");

  const gen9 = planRows([], 9);
  assert.deepEqual(gen9.flatMap((r) => (r.kind === "nodata" ? r.games.map((g) => g.slug) : [])), ["scarlet", "violet", "legends-za"]);
  assert.equal(gen9.length, 1, "consecutive no-data games collapse into one row");

  for (const row of planRows([], 1)) {
    if (row.kind !== "nodata") continue;
    for (const game of row.games) assert.ok(!/japan|isle|crown|teal|indigo|colosseum|xd|mega-dimension|champions/.test(game.slug), `${game.slug} is not main-series`);
  }
});

test("planRows hides the Japanese editions when the international games have data, shows them when they are all there is", () => {
  const withRed = planRows([dataFor("red-japan"), dataFor("red")], 1).flatMap((r) => (r.kind === "game" ? [r.game.version] : []));
  assert.deepEqual(withRed, ["red"]);
  const only = planRows([dataFor("red-japan")], 1).flatMap((r) => (r.kind === "game" ? [r.game.version] : []));
  assert.deepEqual(only, ["red-japan"]);
});

test("game list: order and names", () => {
  assert.ok(gameOrder("red") < gameOrder("gold") && gameOrder("gold") < gameOrder("scarlet"));
  assert.equal(gameName("lets-go-pikachu"), "Let's Go, Pikachu!");
  assert.equal(gameName("future-game"), "Future Game");
  assert.equal(new Set(GAMES.map((g) => g.slug)).size, GAMES.length, "no duplicate game slugs");
});
