import assert from "node:assert/strict";
import test from "node:test";
import type { PokemonType } from "../lib/pokemon-types";
import {
  bestMultiplier,
  CHART_TYPES,
  DEFENSE_BUCKETS,
  defenseProfile,
  effectiveness,
  matchups,
  multiplier,
  multiplierLabel,
  type DefenseGroup,
} from "../lib/type-chart";
import { pokemonNamed, pokemonSnapshot, typeSnapshot } from "./fixtures/load";

const typesOf = (name: string) => pokemonNamed(name).types;
/** The profile as { "4": [...], "0.5": [...] }, which reads well in assertions. */
const byMultiplier = (groups: DefenseGroup[]) => Object.fromEntries(groups.map((g) => [String(g.multiplier), g.types]));

// ---- the chart against PokéAPI (a saved snapshot, not the live API) ----

test("the chart has exactly the 18 types PokéAPI has", () => {
  assert.equal(Object.keys(typeSnapshot).length, 18, "the snapshot is complete");
  assert.deepEqual([...CHART_TYPES].sort(), Object.keys(typeSnapshot).sort());
});

test("all 324 attacker/defender pairs match PokéAPI's damage_relations", () => {
  const wrong: string[] = [];
  let checked = 0;
  for (const attacker of Object.keys(typeSnapshot)) {
    const relations = typeSnapshot[attacker];
    const expected: Record<string, number> = {};
    for (const name of relations.double_damage_to) expected[name] = 2;
    for (const name of relations.half_damage_to) expected[name] = 0.5;
    for (const name of relations.no_damage_to) expected[name] = 0;
    for (const defender of Object.keys(typeSnapshot)) {
      checked++;
      const want = expected[defender] ?? 1;
      const got = multiplier(attacker as PokemonType, defender as PokemonType);
      if (got !== want) wrong.push(`${attacker} -> ${defender}: chart ${got}, PokéAPI ${want}`);
    }
  }
  assert.equal(checked, 324);
  assert.deepEqual(wrong, [], "the chart disagrees with the snapshot");
});

// ---- dual types ----

test("dual-type effectiveness is the product of both halves", () => {
  assert.equal(effectiveness("fire", ["grass", "poison"]), 2);
  assert.equal(effectiveness("ice", ["dragon", "flying"]), 4);
  assert.equal(effectiveness("grass", ["fire", "flying"]), 0.25);
  assert.equal(effectiveness("water", ["water"]), 0.5);
  assert.equal(effectiveness("stellar", ["fire"]), 1, "stellar is neutral");
});

test("an immunity wins over a weakness", () => {
  assert.equal(effectiveness("ground", ["flying", "steel"]), 0);
  assert.equal(effectiveness("fighting", ["normal", "ghost"]), 0);
  assert.equal(effectiveness("electric", ["ground", "flying"]), 0);
});

test("STAB matchups and their best multiplier", () => {
  assert.equal(bestMultiplier(["fire", "flying"], ["grass", "poison"]), 2);
  assert.equal(bestMultiplier(["grass", "poison"], ["fire", "flying"]), 1, "the better of x0.25 and x1");
  assert.deepEqual(matchups(["fire", "flying"], ["grass", "poison"]).map((m) => [m.attacker, m.multiplier]), [["fire", 2], ["flying", 2]]);
  assert.equal(multiplierLabel(0.25), "×¼");
});

// ---- the defensive profile behind the detail view's type calculator ----

test("a 4x weakness: Dragonite (dragon/flying) takes x4 from ice, and Charizard (fire/flying) from rock", () => {
  assert.deepEqual(byMultiplier(defenseProfile(typesOf("dragonite")))["4"], ["ice"]);
  assert.deepEqual(byMultiplier(defenseProfile(typesOf("charizard")))["4"], ["rock"]);
  // and a 0.25x resistance on the same Pokémon: ground resists nothing, but grass resists fire/flying twice over
  assert.deepEqual(byMultiplier(defenseProfile(typesOf("charizard")))["0.25"], ["grass", "bug"].sort((a, b) => CHART_TYPES.indexOf(a as PokemonType) - CHART_TYPES.indexOf(b as PokemonType)));
});

test("a dual-type cancel-out: Volcanion (fire/water) is neutral to water and grass, because x2 and x0.5 cancel", () => {
  const types = typesOf("volcanion");
  assert.deepEqual([...types].sort(), ["fire", "water"]);
  assert.equal(effectiveness("water", types), 1, "water: fire's weakness x water's resistance");
  assert.equal(effectiveness("grass", types), 1, "grass: water's weakness x fire's resistance");
  const placed = defenseProfile(types).flatMap((g) => g.types);
  assert.ok(!placed.includes("water") && !placed.includes("grass"), "neutral matchups appear in no group");
  assert.deepEqual(byMultiplier(defenseProfile(types))["0.25"], ["fire", "ice", "steel"], "while fire, ice and steel are resisted twice");
});

test("an immunity overrides a weakness: Gligar (ground/flying) is immune to electric, not weak to it", () => {
  const profile = byMultiplier(defenseProfile(typesOf("gligar")));
  assert.deepEqual(profile["0"], ["electric", "ground"], "ground gives electric immunity, flying gives ground immunity");
  assert.ok(!(profile["2"] ?? []).includes("electric"), "flying's weakness to electric is overridden");
  assert.ok(!(profile["4"] ?? []).includes("electric"));
  // Skarmory (flying/steel): steel is weak to ground, flying is immune to it
  const skarmory = byMultiplier(defenseProfile(typesOf("skarmory")));
  assert.ok(skarmory["0"].includes("ground") && !(skarmory["2"] ?? []).includes("ground"));
});

test("a regional form has its own types, so its own profile: Alolan Vulpix (ice) vs Vulpix (fire)", () => {
  assert.deepEqual(typesOf("vulpix"), ["fire"]);
  assert.deepEqual(typesOf("vulpix-alola"), ["ice"]);
  const base = byMultiplier(defenseProfile(typesOf("vulpix")));
  const alola = byMultiplier(defenseProfile(typesOf("vulpix-alola")));
  assert.ok(base["0.5"].includes("fire"), "Vulpix resists fire");
  assert.ok(alola["2"].includes("fire"), "Alolan Vulpix is weak to fire");
  assert.deepEqual(alola["2"], ["fire", "fighting", "rock", "steel"]);
  assert.notDeepEqual(base, alola);

  // Sandshrew (ground) vs Alolan Sandshrew (ice/steel): the immunity changes from electric to poison, and 4x weaknesses to fire and fighting appear
  const sand = byMultiplier(defenseProfile(typesOf("sandshrew")));
  const sandAlola = byMultiplier(defenseProfile(typesOf("sandshrew-alola")));
  assert.deepEqual(sand["0"], ["electric"]);
  assert.deepEqual(sandAlola["0"], ["poison"], "steel is immune to poison, and no longer ground to electric");
  assert.deepEqual(sandAlola["4"], ["fire", "fighting"], "ice and steel are both weak to each");
  assert.equal(sand["4"], undefined);
});

test("groups are ordered x4, x2, x0.5, x0.25, x0 and hold types in chart order", () => {
  for (const name of ["dragonite", "gligar", "volcanion", "vulpix-alola"]) {
    const groups = defenseProfile(typesOf(name));
    const order = groups.map((g) => DEFENSE_BUCKETS.indexOf(g.multiplier));
    assert.deepEqual(order, [...order].sort((a, b) => a - b), `${name}: groups in bucket order`);
    for (const group of groups) {
      const positions = group.types.map((t) => CHART_TYPES.indexOf(t));
      assert.deepEqual(positions, [...positions].sort((a, b) => a - b), `${name}: types in chart order`);
    }
  }
});

test("for every single and dual typing, each group is exactly what the chart says and nothing is listed twice", () => {
  const combos: PokemonType[][] = CHART_TYPES.map((t) => [t]);
  for (const a of CHART_TYPES) for (const b of CHART_TYPES) if (a < b) combos.push([a, b]);
  assert.equal(combos.length, 18 + 153);
  for (const defenders of combos) {
    const groups = defenseProfile(defenders);
    const seen = new Set<PokemonType>();
    for (const group of groups) {
      for (const attacker of group.types) {
        assert.ok(!seen.has(attacker), `${defenders.join("/")}: ${attacker} listed twice`);
        seen.add(attacker);
        assert.equal(effectiveness(attacker, defenders), group.multiplier);
      }
    }
    for (const attacker of CHART_TYPES) {
      if (!seen.has(attacker)) assert.equal(effectiveness(attacker, defenders), 1, `${defenders.join("/")}: ${attacker} is neutral`);
    }
  }
});

test("every Pokémon and form in the snapshot gets a valid profile", () => {
  assert.ok(pokemonSnapshot.length > 1300);
  for (const p of pokemonSnapshot) {
    for (const group of defenseProfile(p.types)) {
      assert.ok(DEFENSE_BUCKETS.includes(group.multiplier), `${p.name}: x${group.multiplier}`);
      assert.ok(group.types.length > 0);
    }
  }
});
