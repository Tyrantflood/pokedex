import assert from "node:assert/strict";
import { test } from "node:test";
import { Dex } from "@pkmn/sim";
import { dexTypeMath } from "../lib/battle/dex-facts";
import { analyseTeam, type TypeChart } from "../lib/team";
import { effectiveness } from "../lib/type-chart";
import type { PokemonType } from "../lib/pokemon-types";

const chartFor = (formatId: string): TypeChart => {
  const math = dexTypeMath(Dex.forFormat(formatId));
  return (attack, defenders) => math.multiplier(attack, defenders);
};
const exposure = (types: PokemonType[][], chart: TypeChart | undefined, attack: PokemonType) => analyseTeam(types, chart).exposures.find((e) => e.type === attack)!;

test("without a chart the analysis is the Pokédex's, unchanged", () => {
  const team: PokemonType[][] = [["water", "flying"], ["steel"], ["ghost", "poison"], ["fire"]];
  assert.deepEqual(analyseTeam(team), analyseTeam(team, effectiveness));
});

test("the builder's coverage follows the format's generation: Gen 1 Ghost can't hit Psychic, Gens 2-5 Steel resists Ghost and Dark, Gen 6+ matches the modern chart", () => {
  const alakazam: PokemonType[][] = [["psychic"]];
  assert.equal(exposure(alakazam, undefined, "ghost").worst, 2, "modern chart: Ghost beats Psychic");
  assert.equal(exposure(alakazam, chartFor("gen1ou"), "ghost").immune, 1, "Gen 1: Ghost does nothing to Psychic");
  assert.equal(exposure(alakazam, chartFor("gen1ou"), "ghost").weak, 0);
  assert.equal(exposure(alakazam, chartFor("gen9ou"), "ghost").weak, 1, "Gen 9: as modern");

  const skarmory: PokemonType[][] = [["steel", "flying"]];
  assert.equal(exposure(skarmory, undefined, "ghost").worst, 1, "modern: neutral");
  for (const id of ["gen2ou", "gen3ou", "gen4ou", "gen5ou"]) {
    assert.equal(exposure(skarmory, chartFor(id), "ghost").worst, 0.5, `${id}: Steel resists Ghost`);
    assert.equal(exposure(skarmory, chartFor(id), "dark").worst, 0.5, `${id}: Steel resists Dark`);
  }
  assert.equal(exposure(skarmory, chartFor("gen6ou"), "ghost").worst, 1, "Gen 6 removed it");

  // Gen 1 has no Fairy/Dark/Steel to attack with: those never show up as a weakness or a resistance.
  const gen1 = analyseTeam([["dragon"], ["fighting"]], chartFor("gen1ou"));
  for (const type of ["fairy", "dark", "steel"] as PokemonType[]) {
    const e = gen1.exposures.find((x) => x.type === type)!;
    assert.deepEqual([e.weak, e.resist, e.immune], [0, 0, 0], type);
  }
  // Gen 1 Bug and Poison hit each other super effectively (modern: not).
  assert.equal(exposure([["bug"]], chartFor("gen1ou"), "poison").weak, 1);
  assert.equal(exposure([["bug"]], undefined, "poison").weak, 0);
});

test("for Gen 6 and later the simulator's chart and the site's agree on every attack against every typing", () => {
  const types: PokemonType[] = ["normal", "fire", "water", "electric", "grass", "ice", "fighting", "poison", "ground", "flying", "psychic", "bug", "rock", "ghost", "dragon", "dark", "steel", "fairy"];
  const chart = chartFor("gen9ou");
  for (const a of types) for (const d1 of types) for (const d2 of [null, ...types]) {
    const defenders = d2 && d2 !== d1 ? [d1, d2] : [d1];
    assert.equal(chart(a, defenders), effectiveness(a, defenders), `${a} vs ${defenders.join("/")}`);
  }
});
