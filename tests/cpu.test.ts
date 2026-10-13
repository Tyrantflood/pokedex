import assert from "node:assert/strict";
import { test } from "node:test";
import { BattleStreams, Dex, Teams } from "@pkmn/sim";
import type { PokemonSet } from "@pkmn/sim";
import { CpuPlayer } from "../lib/battle/cpu-player";
import { abilityBlocks, bestSwitch, isBadMatchup, matchupScore, NO_GOOD_MOVE, scoreMove, type FighterFacts, type Matchup, type MoveFacts } from "../lib/battle/cpu-logic";
import { dexTypeMath, matchupFor, moveFacts } from "../lib/battle/dex-facts";
import { applyLine, createView } from "../lib/battle/protocol";
import { makeLookups } from "../lib/battle/dex-facts";
import { CHART_TYPES, effectiveness } from "../lib/type-chart";
import type { PokemonType } from "../lib/pokemon-types";

const dexFor = (formatId: string) => Dex.forFormat(formatId);
const MODERN: Matchup = matchupFor(dexFor("gen9randombattle"));

const move = (over: Partial<MoveFacts>): MoveFacts => ({
  id: "x",
  type: "normal",
  category: "Special",
  basePower: 80,
  accuracy: 100,
  priority: 0,
  fixedDamage: false,
  ohko: false,
  charge: false,
  recharge: false,
  selfDestruct: false,
  heals: false,
  inflicts: null,
  selfBoost: false,
  hazard: null,
  protects: false,
  ...over,
});
const fighter = (types: string[], over: Partial<FighterFacts> = {}): FighterFacts => ({ types, hpFraction: 1, status: "", boostLevels: 0, ...over });
const score = (m: MoveFacts, me: FighterFacts, foe: FighterFacts, matchup = MODERN) => scoreMove(m, me, foe, [], 1, matchup);

test("a move the target is immune to is never worth using", () => {
  assert.equal(score(move({ type: "ground" }), fighter(["ground"]), fighter(["flying"])), NO_GOOD_MOVE);
  assert.equal(score(move({ type: "normal" }), fighter(["normal"]), fighter(["ghost"])), NO_GOOD_MOVE);
  assert.equal(score(move({ type: "electric" }), fighter(["electric"]), fighter(["ground", "water"])), NO_GOOD_MOVE);
  // The immunity is on the type chart, so a status move of that type is useless too (Thunder Wave on a Ground type).
  assert.equal(score(move({ type: "electric", category: "Status", basePower: 0, inflicts: "par" }), fighter(["water"]), fighter(["ground"])), NO_GOOD_MOVE);
});

test("super effective and same-type moves score higher", () => {
  const foe = fighter(["grass"]);
  const me = fighter(["water"]);
  const fire = score(move({ type: "fire" }), me, foe);
  const water = score(move({ type: "water" }), me, foe);
  const normal = score(move({ type: "normal" }), me, foe);
  assert.ok(fire > normal, "super effective beats neutral");
  assert.ok(normal > water, "resisted (even with STAB) loses to neutral: 0.5 x 1.5 < 1");
  // Same power, same effectiveness: the STAB move wins.
  assert.ok(score(move({ type: "water" }), me, fighter(["normal"])) > score(move({ type: "ice" }), me, fighter(["normal"])));
  // A x4 weakness beats a x2 one.
  assert.ok(score(move({ type: "ice" }), me, fighter(["dragon", "flying"])) > score(move({ type: "ice" }), me, fighter(["dragon"])));
});

test("power, accuracy and the better attacking stat are weighed", () => {
  const me = fighter(["normal"], { atk: 50, spa: 200 });
  const foe = fighter(["normal"]);
  assert.ok(score(move({ category: "Special" }), me, foe) > score(move({ category: "Physical" }), me, foe));
  assert.ok(score(move({ basePower: 120, accuracy: 70 }), fighter(["fire"]), foe) < score(move({ basePower: 100 }), fighter(["fire"]), foe));
  assert.ok(score(move({ category: "Physical" }), fighter(["normal"], { status: "brn" }), foe) < score(move({ category: "Physical" }), fighter(["normal"]), foe));
});

test("healing waits for low HP; status moves skip an already-statused or immune target", () => {
  const heal = move({ category: "Status", basePower: 0, heals: true });
  assert.ok(score(heal, fighter(["normal"], { hpFraction: 0.3 }), fighter(["normal"])) > 50);
  assert.equal(score(heal, fighter(["normal"]), fighter(["normal"])), 0);
  const burn = move({ category: "Status", basePower: 0, type: "fire", inflicts: "brn" });
  assert.equal(score(burn, fighter(["fire"]), fighter(["fire"])), NO_GOOD_MOVE, "fire types can't be burned");
  assert.equal(score(burn, fighter(["fire"]), fighter(["grass"], { status: "par" })), 0, "already has a status");
  assert.ok(score(burn, fighter(["fire"]), fighter(["grass"])) > 0);
});

test("a bad matchup is spotted, and the switch target resists the foe", () => {
  const foe = { types: ["fire"] };
  const me = { types: ["grass"], moveTypes: ["grass"] };
  const math = MODERN.math;
  assert.equal(isBadMatchup(me, foe, math), true);
  assert.equal(isBadMatchup({ types: ["water"], moveTypes: ["water"] }, foe, math), false);
  const bench = [
    { slot: 2, types: ["grass"], moveTypes: ["grass"], hpFraction: 1 },
    { slot: 3, types: ["water"], moveTypes: ["water"], hpFraction: 1 },
    { slot: 4, types: ["fire"], moveTypes: ["fire"], hpFraction: 0 },
  ];
  assert.equal(bestSwitch(bench, foe, matchupScore(me, foe, math), math)?.slot, 3);
  assert.equal(bestSwitch([bench[0]], foe, matchupScore(me, foe, math), math), null, "no one better: stay in");
});

// ---- the generation's own type chart ----------------------------------------------------------------------------------------

test("from Gen 6 on the simulator's chart is the site's chart, for every type and every typing", () => {
  const math = dexTypeMath(dexFor("gen9randombattle"));
  const types = CHART_TYPES;
  for (const attack of types) {
    for (const a of types) {
      assert.equal(math.multiplier(attack, [a]), effectiveness(attack as PokemonType, [a as PokemonType]), `${attack} vs ${a}`);
      for (const b of types) if (a !== b) assert.equal(math.multiplier(attack, [a, b]), effectiveness(attack as PokemonType, [a, b] as PokemonType[]), `${attack} vs ${a}/${b}`);
    }
  }
  assert.equal(math.multiplier("stellar", ["fire"]), 1, "Stellar has no row: neutral");
});

test("Gen 1's chart differs from the modern one where it matters", () => {
  const g1 = dexTypeMath(dexFor("gen1randombattle"));
  const g9 = dexTypeMath(dexFor("gen9randombattle"));
  assert.equal(g1.multiplier("ghost", ["psychic"]), 0, "Gen 1 bug: Ghost does nothing to Psychic");
  assert.equal(g9.multiplier("ghost", ["psychic"]), 2);
  assert.equal(g1.multiplier("bug", ["poison"]), 2);
  assert.equal(g9.multiplier("bug", ["poison"]), 0.5);
  assert.equal(g1.multiplier("poison", ["bug"]), 2);
  assert.equal(g9.multiplier("poison", ["bug"]), 1);
  assert.equal(g1.multiplier("ice", ["fire"]), 1);
  assert.equal(g9.multiplier("ice", ["fire"]), 0.5);
  assert.equal(g1.multiplier("ghost", ["psychic", "water"]), 0, "an immunity on either half is an immunity");
});

test("Gens 2-5 have Steel resisting Ghost and Dark; Gen 6 stops that", () => {
  for (const gen of [2, 3, 4, 5]) {
    const math = dexTypeMath(dexFor(`gen${gen}randombattle`));
    assert.equal(math.multiplier("ghost", ["steel"]), 0.5, `gen ${gen}`);
    assert.equal(math.multiplier("dark", ["steel"]), 0.5, `gen ${gen}`);
  }
  const g6 = dexTypeMath(dexFor("gen6randombattle"));
  assert.equal(g6.multiplier("ghost", ["steel"]), 1);
  assert.equal(g6.multiplier("ghost", ["psychic"]), 2);
});

test("Gen 5 against Steel: the chart makes the CPU prefer the neutral electric move to the resisted Ghost move; Gen 9 reverses it", () => {
  const rank = (formatId: string, ids: string[], me: FighterFacts, foe: FighterFacts) => {
    const dex = dexFor(formatId);
    const matchup = matchupFor(dex);
    return ids
      .map((id) => ({ id, score: score(moveFacts(dex, id), me, foe, matchup) }))
      .sort((a, b) => b.score - a.score)
      .map((r) => r.id);
  };
  const gengar = fighter(["ghost", "poison"], { atk: 100, spa: 200 });
  assert.deepEqual(rank("gen5randombattle", ["shadowball", "thunderbolt"], gengar, fighter(["steel"])), ["thunderbolt", "shadowball"]);
  assert.deepEqual(rank("gen9randombattle", ["shadowball", "thunderbolt"], gengar, fighter(["steel"])), ["shadowball", "thunderbolt"]);
});

test("fixed-damage moves ignore effectiveness and STAB, and only an immunity the simulator enforces can stop them", () => {
  const gen9 = matchupFor(dexFor("gen9randombattle"));
  const gen1 = matchupFor(dexFor("gen1randombattle"));
  const gengar = fighter(["ghost", "poison"], { atk: 100, spa: 200 });
  const nightShade9 = moveFacts(dexFor("gen9randombattle"), "nightshade");
  // The same score against a weakness, a neutral target and a resistance: the damage doesn't change.
  const vs = (types: string[]) => score(nightShade9, gengar, fighter(types), gen9);
  assert.equal(vs(["psychic"]), vs(["water"]));
  assert.equal(vs(["psychic"]), vs(["dark"]), "even a resisted Ghost move does the same fixed damage");
  assert.ok(vs(["psychic"]) > 0);
  assert.equal(vs(["normal"]), NO_GOOD_MOVE, "but the Normal type is immune to Ghost moves, and from Gen 2 that holds for Night Shade too");
  // Gen 1 is the exception: its data marks the fixed-damage moves as ignoring immunities, so they work on Normal, Ghost and Psychic types.
  const dex1 = dexFor("gen1randombattle");
  for (const id of ["nightshade", "seismictoss", "sonicboom", "superfang"]) assert.equal(moveFacts(dex1, id).ignoresTypeImmunity, true, `${id} in Gen 1`);
  assert.ok(score(moveFacts(dex1, "nightshade"), gengar, fighter(["normal"]), gen1) > 0);
  assert.ok(score(moveFacts(dex1, "seismictoss"), fighter(["fighting"]), fighter(["ghost"]), gen1) > 0);
  assert.ok(score(moveFacts(dex1, "superfang"), fighter(["normal"]), fighter(["ghost"]), gen1) > 0);
  // ...while an ordinary Ghost move is still stopped by Gen 1's Ghost-vs-Psychic bug.
  assert.equal(score(moveFacts(dex1, "lick"), gengar, fighter(["psychic"]), gen1), NO_GOOD_MOVE);
  // From Gen 2 on, none of them ignores an immunity.
  for (const gen of [2, 3, 4, 5, 6, 7, 8, 9]) {
    const dex = dexFor(`gen${gen}randombattle`);
    for (const id of ["nightshade", "seismictoss", "dragonrage", "sonicboom", "superfang", "psywave"]) assert.equal(moveFacts(dex, id).ignoresTypeImmunity, false, `${id} in Gen ${gen}`);
  }
  // Moves whose damage is a share of HP or random are fixed-damage too.
  for (const id of ["superfang", "psywave"]) assert.equal(moveFacts(dex1, id).fixedDamage, true, id);
  assert.equal(moveFacts(dex1, "tackle").fixedDamage, false);
  // Status moves ignore immunities unless their data says not to: Confuse Ray (Ghost) works on a Normal type, Thunder Wave does not on Ground.
  const dex5 = dexFor("gen5randombattle");
  const gen5 = matchupFor(dex5);
  assert.ok(score(moveFacts(dex5, "confuseray"), fighter(["normal"]), fighter(["normal"]), gen5) >= 0);
  assert.equal(moveFacts(dex5, "confuseray").ignoresTypeImmunity, true);
  assert.equal(score(moveFacts(dex5, "thunderwave"), fighter(["normal"]), fighter(["ground"]), gen5), NO_GOOD_MOVE);
});

/** Plays one turn in the simulator: does the move damage the target, or is the target immune? The ground truth the CPU's scoring must agree with. */
async function simulatorSaysDamaged(gen: number, move: string, defender: string): Promise<boolean> {
  const streams = BattleStreams.getPlayerStreams(new BattleStreams.BattleStream());
  const lines: string[] = [];
  const done = (async () => {
    for await (const chunk of streams.omniscient) {
      for (const line of chunk.split("\n")) lines.push(line);
      if (lines.some((l) => l.startsWith("|turn|2"))) return;
    }
  })();
  let over = false;
  for (const side of [streams.p1, streams.p2]) {
    void (async () => {
      for await (const chunk of side) if (!over && chunk.includes("|request|")) void side.write("move 1");
    })();
  }
  void streams.omniscient.write(
    `>start ${JSON.stringify({ formatid: `gen${gen}randombattle`, seed: "1,2,3,4" })}\n` +
      `>player p1 ${JSON.stringify({ name: "A", team: Teams.pack([set("Mew", [move])]) })}\n` +
      `>player p2 ${JSON.stringify({ name: "B", team: Teams.pack([set(defender, ["splash"])]) })}`,
  );
  await done;
  over = true;
  void streams.omniscient.writeEnd();
  const turn1 = lines.slice(0, lines.findIndex((l) => l.startsWith("|turn|2")));
  return turn1.some((l) => l.startsWith("|-damage|p2a")) && !turn1.some((l) => l.startsWith("|-immune|p2a"));
}

test("the CPU's idea of what a move can hit matches what the simulator does, for the fixed-damage moves in every generation", async () => {
  // [move, a target the type chart says is immune to it, generations where it exists]
  const cases: [string, string, number[]][] = [
    ["nightshade", "Snorlax", [1, 2, 3, 4, 5, 6, 7, 8, 9]], // Ghost vs Normal
    ["nightshade", "Alakazam", [1, 2, 5, 9]], // Ghost vs Psychic: immune only through Gen 1's chart bug, and then not for Night Shade
    ["seismictoss", "Gengar", [1, 2, 3, 4, 5, 6, 7, 8, 9]], // Fighting vs Ghost
    ["sonicboom", "Gengar", [1, 2, 3, 4, 5, 6, 7, 8, 9]], // Normal vs Ghost
    ["superfang", "Gengar", [1, 2, 3, 4, 5, 6, 7, 8, 9]], // Normal vs Ghost
    ["dragonrage", "Clefable", [6, 7, 8, 9]], // Dragon vs Fairy
    ["psywave", "Umbreon", [2, 3, 4, 5, 6, 7, 8, 9]], // Psychic vs Dark
    ["dragonrage", "Snorlax", [1, 5, 9]], // control: not immune
    ["lick", "Alakazam", [1, 2, 5, 9]], // an ordinary Ghost move against Psychic: Gen 1's bug makes it immune
    ["lick", "Snorlax", [1, 5, 9]], // ordinary Ghost vs Normal: immune in every generation
  ];
  let checked = 0;
  let damaged = 0;
  for (const [moveId, defenderName, gens] of cases) {
    for (const gen of gens) {
      const dex = dexFor(`gen${gen}randombattle`);
      const matchup = matchupFor(dex);
      const mew = fighter(["psychic"]);
      const target = fighter(dex.species.get(defenderName).types.map((t) => t.toLowerCase()));
      const cpuScore = score(moveFacts(dex, moveId), mew, target, matchup);
      const sim = await simulatorSaysDamaged(gen, moveId, defenderName);
      checked++;
      if (sim) damaged++;
      assert.equal(cpuScore !== NO_GOOD_MOVE, sim, `Gen ${gen}: ${moveId} into ${defenderName}: the simulator ${sim ? "deals damage" : "says immune"}, the CPU scores it ${cpuScore}`);
    }
  }
  assert.ok(checked > 50 && damaged > 8 && checked - damaged > 20, `${checked} checks, ${damaged} damaging: both outcomes must be covered`);
});

// ---- abilities that were shown --------------------------------------------------------------------------------------------

test("revealed immunity abilities make the matching moves useless, in the generations where they do that", () => {
  const gen = (n: number): Matchup => ({ math: MODERN.math, gen: n });
  const ground = move({ type: "ground", basePower: 100 });
  const me = fighter(["ground"]);
  const withAbility = (ability: string | null) => fighter(["poison"], { ability }); // Poison is weak to Ground: the chart alone says go
  assert.ok(scoreMove(ground, me, withAbility(null), [], 1, gen(5)) > 100, "unknown ability: the chart rules");
  assert.equal(scoreMove(ground, me, withAbility("Levitate"), [], 1, gen(5)), NO_GOOD_MOVE);
  assert.ok(scoreMove(ground, me, withAbility("Levitate"), [], 1, gen(2)) > 100, "no Levitate before Gen 3");
  assert.equal(scoreMove(ground, me, withAbility("Earth Eater"), [], 1, gen(9)), NO_GOOD_MOVE);
  assert.ok(scoreMove(ground, me, withAbility("Earth Eater"), [], 1, gen(5)) > 100, "Earth Eater is Gen 9");
  const table: [string, string, number][] = [
    ["Flash Fire", "fire", 3],
    ["Water Absorb", "water", 3],
    ["Volt Absorb", "electric", 3],
    ["Dry Skin", "water", 4],
    ["Motor Drive", "electric", 4],
    ["Storm Drain", "water", 5],
    ["Lightning Rod", "electric", 5],
    ["Sap Sipper", "grass", 5],
    ["Well-Baked Body", "fire", 9],
  ];
  for (const [ability, type, from] of table) {
    const m = move({ type, basePower: 90 });
    assert.equal(abilityBlocks(m, ability, from, 1), true, `${ability} vs ${type} in gen ${from}`);
    assert.equal(abilityBlocks(m, ability, from - 1, 1), false, `${ability} in gen ${from - 1}`);
    assert.equal(abilityBlocks(move({ type: type === "fire" ? "water" : "fire" }), ability, from, 1), false, `${ability} only stops ${type}`);
  }
  // Status moves too: Thunder Wave into a Volt Absorber, Will-O-Wisp into Flash Fire.
  const twave = move({ type: "electric", category: "Status", basePower: 0, inflicts: "par" });
  assert.ok(scoreMove(twave, fighter(["normal"]), fighter(["water"]), [], 1, gen(5)) > 0);
  assert.equal(scoreMove(twave, fighter(["normal"]), fighter(["water"], { ability: "Volt Absorb" }), [], 1, gen(5)), NO_GOOD_MOVE);
  // Wonder Guard lets only super effective hits through; Soundproof and Bulletproof stop their move groups.
  assert.equal(abilityBlocks(move({}), "Wonder Guard", 5, 1), true);
  assert.equal(abilityBlocks(move({}), "Wonder Guard", 5, 2), false);
  assert.equal(abilityBlocks(move({ sound: true }), "Soundproof", 5, 1), true);
  assert.equal(abilityBlocks(move({ bullet: true }), "Bulletproof", 6, 1), true);
  assert.equal(abilityBlocks(move({}), "Soundproof", 5, 1), false);
  // An ability-ignoring attacker (Mold Breaker) goes ahead anyway.
  assert.ok(scoreMove(ground, fighter(["ground"], { ignoresAbilities: true }), withAbility("Levitate"), [], 1, gen(5)) > 100);
});

test("an ability is learned from what it does: an immunity, a reflected hit, an absorbed hit, an activation", () => {
  const dex = dexFor("gen5randombattle");
  const lookups = makeLookups(dex);
  const view = createView();
  const feed = (line: string) => applyLine(view, line, "p2", lookups);
  const ability = (side: "p1" | "p2", i: number) => view.sides[side].mons[i].ability;
  feed("|switch|p1a: Weezing|Weezing, L80|100/100");
  feed("|switch|p2a: Rhyperior|Rhyperior, L80|100/100");
  assert.equal(ability("p1", 0), null);
  feed("|move|p2a: Rhyperior|Earthquake|p1a: Weezing");
  assert.equal(ability("p1", 0), null, "using a move reveals nothing");
  feed("|-immune|p1a: Weezing|[from] ability: Levitate");
  assert.equal(ability("p1", 0), "Levitate");
  // A reflected hit belongs to the "[of]" Pokémon, not to the one that took the damage.
  feed("|switch|p1a: Ferrothorn|Ferrothorn, L80|100/100");
  feed("|-damage|p2a: Rhyperior|80/100|[from] ability: Iron Barbs|[of] p1a: Ferrothorn");
  assert.equal(ability("p1", 1), "Iron Barbs");
  assert.equal(ability("p2", 0), null);
  // An absorbed hit and a plain activation.
  feed("|switch|p1a: Heatran|Heatran, L80|100/100");
  feed("|-start|p1a: Heatran|ability: Flash Fire");
  assert.equal(ability("p1", 2), "Flash Fire");
  feed("|-activate|p2a: Rhyperior|ability: Lightning Rod");
  assert.equal(ability("p2", 0), "Lightning Rod");
  feed("|-heal|p1a: Heatran|100/100|[from] ability: Volt Absorb");
  assert.equal(ability("p1", 2), "Volt Absorb");
});

// ---- whole battles with chosen teams: what the CPU actually does -------------------------------------------------------

const set = (species: string, moves: string[], ability = ""): PokemonSet => ({
  name: species,
  species,
  item: "",
  ability,
  moves,
  nature: "",
  gender: "",
  evs: { hp: 252, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
  ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
  level: 100,
});

/** The moves the Normal CPU (side p2) used against a Pokémon that only ever uses its first move, over a fixed number of turns. */
async function cpuMoves(formatId: string, cpuSet: PokemonSet, targetSet: PokemonSet, turns: number): Promise<{ used: string[]; cpu: CpuPlayer }> {
  const dex = dexFor(formatId);
  const streams = BattleStreams.getPlayerStreams(new BattleStreams.BattleStream());
  const cpu = new CpuPlayer(streams.p2, "p2", dex, "normal", 11);
  void cpu.start();
  const used: string[] = [];
  let turn = 0;
  const finished = (async () => {
    for await (const chunk of streams.p1) {
      let request = false;
      for (const line of chunk.split("\n")) {
        const m = /^\|move\|p2a: [^|]+\|([^|]+)\|/.exec(line);
        if (m) used.push(m[1]);
        if (line.startsWith("|turn|")) turn = Number(line.slice(6));
        if (line.startsWith("|request|")) request = true;
        if (line.startsWith("|win|") || line === "|tie") return; // not startsWith("|tie"): "|tier|..." is a header line
      }
      if (turn > turns) return;
      if (request) void streams.p1.write("move 1");
    }
  })();
  void streams.omniscient.write(
    `>start ${JSON.stringify({ formatid: formatId, seed: "1,2,3,4" })}\n` +
      `>player p1 ${JSON.stringify({ name: "Target", team: Teams.pack([targetSet]) })}\n` +
      `>player p2 ${JSON.stringify({ name: "CPU", team: Teams.pack([cpuSet]) })}`,
  );
  await finished;
  void streams.omniscient.writeEnd();
  return { used, cpu };
}

const count = (used: string[], name: string) => used.filter((u) => u === name).length;

test("in Gen 1 the CPU uses Night Shade on a Normal type, as the simulator lets it; from Gen 2 it never does", async () => {
  const cpuSet = set("Gengar", ["nightshade", "bodyslam"]);
  const target = set("Snorlax", ["recover"]);
  const gen1 = await cpuMoves("gen1randombattle", cpuSet, target, 6);
  assert.ok(gen1.used.length >= 4, `only ${gen1.used.length} CPU moves in Gen 1`);
  assert.ok(count(gen1.used, "Night Shade") >= 3, `Gen 1: ${gen1.used.join(", ")}`);
  for (const gen of [2, 5, 9]) {
    const { used } = await cpuMoves(`gen${gen}randombattle`, cpuSet, target, 6);
    assert.ok(used.length >= 4, `only ${used.length} CPU moves in Gen ${gen}`);
    assert.equal(count(used, "Night Shade"), 0, `Gen ${gen}: ${used.join(", ")}`);
  }
});

test("in Gen 1 an ordinary Ghost move is never thrown at a Psychic type (Gen 1's chart bug), though Gen 9 prefers it", async () => {
  const cpuSet = set("Gengar", ["lick", "bodyslam"]);
  const target = set("Alakazam", ["recover"]);
  const gen1 = await cpuMoves("gen1randombattle", cpuSet, target, 6);
  assert.ok(gen1.used.length >= 4);
  assert.equal(count(gen1.used, "Lick"), 0, `Gen 1: ${gen1.used.join(", ")}`);
  const gen9 = await cpuMoves("gen9randombattle", cpuSet, target, 6);
  assert.ok(gen9.used.length >= 4);
  assert.ok(count(gen9.used, "Lick") >= 3, `Gen 9: ${gen9.used.join(", ")}`);
});

test("in Gen 5 the CPU respects Steel resisting Ghost: it goes for the electric move, where Gen 9 prefers Shadow Ball", async () => {
  const cpuSet = set("Gengar", ["shadowball", "discharge"], "Levitate");
  const target = set("Registeel", ["recover"], "Clear Body");
  const gen5 = await cpuMoves("gen5randombattle", cpuSet, target, 8);
  assert.ok(gen5.used.length >= 6, `only ${gen5.used.length} CPU moves`);
  assert.ok(count(gen5.used, "Discharge") >= 5, `Gen 5: ${gen5.used.join(", ")}`);
  const gen9 = await cpuMoves("gen9randombattle", cpuSet, target, 8);
  assert.ok(gen9.used.length >= 6);
  assert.ok(count(gen9.used, "Shadow Ball") >= 5, `Gen 9: ${gen9.used.join(", ")}`);
});

test("after Levitate has stopped an Earthquake the CPU stops using it, and not before", async () => {
  const cpuSet = set("Rhyperior", ["earthquake", "stoneedge"], "Solid Rock");
  const levitating = set("Weezing", ["recover"], "Levitate");
  const { used, cpu } = await cpuMoves("gen5randombattle", cpuSet, levitating, 7);
  assert.ok(used.length >= 5, `only ${used.length} CPU moves`);
  assert.equal(used[0], "Earthquake", "nothing has shown the ability yet: the chart says Ground beats Poison");
  assert.equal(count(used.slice(1), "Earthquake"), 0, `it kept using Earthquake: ${used.join(", ")}`);
  assert.equal(cpu.view.sides.p1.mons[0].ability, "Levitate");
  // The same battle against a Weezing without Levitate (Gen 5 has only Levitate, so use Gen 4's Stench): Earthquake all the way.
  const stench = await cpuMoves("gen5randombattle", cpuSet, set("Weezing", ["recover"], "Stench"), 7);
  assert.ok(count(stench.used, "Earthquake") >= stench.used.length - 1, stench.used.join(", "));
});
