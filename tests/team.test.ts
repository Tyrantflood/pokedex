import assert from "node:assert/strict";
import test from "node:test";
import type { PokemonType } from "../lib/pokemon-types";
import {
  addMember,
  analyseTeam,
  emptyTeam,
  memberCount,
  parseTeam,
  removeMember,
  serializeTeam,
  slotOf,
  suggestCoverage,
  TEAM_SIZE,
  TEAM_VERSION,
  teamMembers,
  type Candidate,
  type Team,
} from "../lib/team";
import { effectiveness } from "../lib/type-chart";
import { pokemonNamed, pokemonSnapshot } from "./fixtures/load";

const typesOf = (...names: string[]) => names.map((name) => pokemonNamed(name).types);
const idOf = (name: string) => pokemonNamed(name).id;
const teamOf = (...names: string[]): Team => names.reduce((team, name) => {
  const result = addMember(team, { pokemonId: idOf(name) });
  assert.ok(result.ok, `${name} fits`);
  return result.team;
}, emptyTeam());

// ---- storing the team ----

test("an empty team has six empty slots and a version", () => {
  const team = emptyTeam();
  assert.equal(team.version, TEAM_VERSION);
  assert.equal(team.slots.length, TEAM_SIZE);
  assert.ok(team.slots.every((slot) => slot === null));
  assert.equal(memberCount(team), 0);
});

test("members go to the first empty slot, or to the slot asked for (replacing whoever is there)", () => {
  let team = emptyTeam();
  const first = addMember(team, { pokemonId: 6 });
  assert.ok(first.ok && first.slot === 0);
  team = first.ok ? first.team : team;
  const third = addMember(team, { pokemonId: 9 }, 2);
  assert.ok(third.ok && third.slot === 2);
  team = third.ok ? third.team : team;
  const next = addMember(team, { pokemonId: 25 });
  assert.ok(next.ok && next.slot === 1, "the first empty slot is 1, not the end");
  team = next.ok ? next.team : team;
  const replaced = addMember(team, { pokemonId: 150 }, 0);
  assert.ok(replaced.ok);
  assert.equal(replaced.ok && replaced.team.slots[0]?.pokemonId, 150);
  assert.equal(team.slots[0]?.pokemonId, 6, "the original team is not mutated");
});

test("a full team, a duplicate and a bad slot are refused with a reason", () => {
  let team = emptyTeam();
  for (let id = 1; id <= TEAM_SIZE; id++) {
    const result = addMember(team, { pokemonId: id });
    assert.ok(result.ok);
    team = result.ok ? result.team : team;
  }
  assert.deepEqual(addMember(team, { pokemonId: 99 }), { ok: false, reason: "full" });
  assert.deepEqual(addMember(team, { pokemonId: 3 }), { ok: false, reason: "duplicate" });
  assert.deepEqual(addMember(emptyTeam(), { pokemonId: 3 }, 6), { ok: false, reason: "bad-slot" });
  assert.deepEqual(addMember(emptyTeam(), { pokemonId: 3 }, -1), { ok: false, reason: "bad-slot" });
});

test("removing a member empties just that slot", () => {
  const team = teamOf("charizard", "dragonite", "gligar");
  const smaller = removeMember(team, 1);
  assert.deepEqual(smaller.slots.map((s) => s?.pokemonId ?? null), [idOf("charizard"), null, idOf("gligar"), null, null, null]);
  assert.equal(removeMember(team, 5), team, "removing from an empty slot changes nothing");
  assert.equal(slotOf(smaller, idOf("dragonite")), -1);
  assert.equal(slotOf(smaller, idOf("gligar")), 2);
});

test("a team survives a save and load unchanged, including its gaps", () => {
  const team = removeMember(teamOf("charizard", "dragonite", "gligar"), 1);
  const loaded = parseTeam(JSON.parse(serializeTeam(team)));
  assert.deepEqual(loaded, team);
});

test("a damaged or foreign save never throws: it becomes a valid team", () => {
  const blank = emptyTeam();
  for (const bad of [null, undefined, 5, "team", [], {}, { version: 99, slots: [] }, { version: 1 }, { version: 1, slots: "nope" }]) {
    assert.deepEqual(parseTeam(bad), blank, `garbage ${JSON.stringify(bad)}`);
  }
  const messy = parseTeam({
    version: 1,
    slots: [{ pokemonId: 6 }, { pokemonId: 6 }, { pokemonId: "9" }, null, { pokemonId: -4 }, { pokemonId: 1.5 }, { pokemonId: 25 }, { pokemonId: 150 }],
  });
  assert.equal(messy.slots.length, TEAM_SIZE, "extra slots are cut off");
  assert.deepEqual(messy.slots.map((s) => s?.pokemonId ?? null), [6, null, null, null, null, null], "duplicates, non-numbers, bad ids and everything past slot six are dropped");
});

test("Pokémon that no longer exist are dropped on load", () => {
  const saved = { version: 1, slots: [{ pokemonId: 6 }, { pokemonId: 424242 }, { pokemonId: 25 }] };
  const loaded = parseTeam(saved, (id) => id < 10_000);
  assert.deepEqual(loaded.slots.map((s) => s?.pokemonId ?? null), [6, null, 25, null, null, null]);
});

test("members are objects, so more can be stored on them later without changing the team's shape", () => {
  const team = teamOf("charizard");
  assert.deepEqual(team.slots[0], { pokemonId: idOf("charizard") });
  assert.equal(typeof team.slots[0], "object");
  assert.equal(JSON.parse(serializeTeam(team)).version, TEAM_VERSION);
});

// ---- what the team is weak to ----

test("a single member: counts per type, with dual typing combined", () => {
  const analysis = analyseTeam(typesOf("dragonite"));
  const ice = analysis.exposures.find((e) => e.type === "ice")!;
  assert.deepEqual([ice.weak, ice.resist, ice.immune, ice.worst], [1, 0, 0, 4]);
  const ground = analysis.exposures.find((e) => e.type === "ground")!;
  assert.deepEqual([ground.weak, ground.resist, ground.immune, ground.worst], [0, 0, 1, 0]);
  assert.deepEqual(analysis.flagged, [], "one Pokémon is not 'the whole team'");
});

test("combining members: a weakness and a resistance on different members do not cancel, they are both counted", () => {
  const analysis = analyseTeam(typesOf("charizard", "blastoise", "venusaur"));
  const electric = analysis.exposures.find((e) => e.type === "electric")!;
  assert.deepEqual([electric.weak, electric.resist, electric.immune], [2, 1, 0], "charizard and blastoise are weak, venusaur resists");
  assert.deepEqual(electric.perMember, [2, 2, 0.5]);
  const fire = analysis.exposures.find((e) => e.type === "fire")!;
  assert.deepEqual([fire.weak, fire.resist], [1, 2], "venusaur is weak; charizard (fire) and blastoise (water) resist");
});

test("the whole team weak to a type is flagged (needs two members), worst first", () => {
  // Charizard (fire/flying), Dragonite (dragon/flying), Aerodactyl (rock/flying): all take x2 or more from rock
  const team = typesOf("charizard", "dragonite", "aerodactyl");
  const analysis = analyseTeam(team);
  assert.ok(analysis.flagged.includes("rock"));
  for (const type of analysis.flagged) assert.ok(team.every((types) => effectiveness(type, types) > 1), `${type}: every member is weak`);
  assert.equal(analyseTeam(team.slice(0, 1)).flagged.length, 0);
  assert.deepEqual(analyseTeam([]).flagged, []);
});

test("gaps are the types somebody is weak to and nobody resists", () => {
  const analysis = analyseTeam(typesOf("charizard", "dragonite"));
  for (const type of analysis.gaps) {
    const e = analysis.exposures.find((x) => x.type === type)!;
    assert.ok(e.weak > 0 && e.resist + e.immune === 0, `${type} is a gap`);
  }
  // water is hit by a weakness on charizard but dragonite resists it, so it is not a gap
  assert.ok(!analysis.gaps.includes("water"));
  assert.ok(analysis.gaps.includes("rock"));
  // every flagged type is a gap too
  for (const type of analysis.flagged) assert.ok(analysis.gaps.includes(type));
});

test("weaknesses and resistances are listed most members first, and only types that apply", () => {
  const analysis = analyseTeam(typesOf("charizard", "dragonite", "gligar", "volcanion"));
  const weakCounts = analysis.weaknesses.map((e) => e.weak);
  assert.deepEqual(weakCounts, [...weakCounts].sort((a, b) => b - a));
  assert.ok(analysis.weaknesses.every((e) => e.weak > 0));
  const resistCounts = analysis.resistances.map((e) => e.resist + e.immune);
  assert.deepEqual(resistCounts, [...resistCounts].sort((a, b) => b - a));
  assert.ok(analysis.resistances.every((e) => e.resist + e.immune > 0));
  assert.equal(analysis.exposures.length, 18);
});

// ---- who would cover the gaps ----

const candidates: Candidate[] = pokemonSnapshot
  .filter((p) => p.id <= 1025) // one entry per species: the default forms
  .map((p) => ({ id: p.id, species: p.name, name: p.name, types: p.types, total: Object.values(p.stats).reduce((a, b) => a + b, 0) }));

const noOne = { ids: new Set<number>(), species: new Set<string>() };
const membersOf = (...names: string[]) => ({ ids: new Set(names.map(idOf)), species: new Set(names) });

test("suggestions answer the gaps: each one resists at least one gap, and none is already on the team", () => {
  const names = ["charizard", "dragonite", "aerodactyl"];
  const analysis = analyseTeam(typesOf(...names));
  assert.ok(analysis.gaps.length > 0);
  const suggestions = suggestCoverage(analysis, candidates, membersOf(...names));
  assert.equal(suggestions.length, 5);
  for (const s of suggestions) {
    assert.ok(s.covers.length > 0);
    for (const type of s.covers) {
      assert.ok(analysis.gaps.includes(type), `${s.candidate.name}: ${type} is a gap`);
      assert.ok(effectiveness(type, s.candidate.types) < 1, `${s.candidate.name} really resists ${type}`);
    }
    assert.ok(!names.includes(s.candidate.name));
  }
  const scores = suggestions.map((s) => s.score);
  assert.deepEqual(scores, [...scores].sort((a, b) => b - a), "best first");
});

test("the top suggestion for a rock-weak team resists rock", () => {
  const names = ["charizard", "dragonite", "aerodactyl"];
  const analysis = analyseTeam(typesOf(...names));
  assert.ok(analysis.flagged.includes("rock"));
  const [best] = suggestCoverage(analysis, candidates, membersOf(...names));
  assert.ok(effectiveness("rock", best.candidate.types) < 1, `${best.candidate.name} (${best.candidate.types.join("/")}) should resist rock`);
});

test("a Pokémon that is itself weak to the flagged type scores worse than one that resists it", () => {
  const analysis = analyseTeam(typesOf("charizard", "dragonite", "aerodactyl"));
  const make = (name: string): Candidate => ({ id: idOf(name), species: name, name, types: pokemonNamed(name).types, total: 500 });
  // steelix (steel/ground) resists rock; rhydon (ground/rock) is weak to water/grass/ground... and is itself rock: compare to something weak to rock
  const resists = suggestCoverage(analysis, [make("steelix")], noOne);
  assert.equal(resists.length, 1);
  const weakToRock = suggestCoverage(analysis, [make("moltres")], noOne); // fire/flying: x4 from rock
  assert.ok(weakToRock.length === 0 || weakToRock[0].score < resists[0].score);
});

test("no gaps, no suggestions; an empty or one-member team still works", () => {
  assert.deepEqual(suggestCoverage(analyseTeam([]), candidates, noOne), []);
  const solo = analyseTeam(typesOf("dragonite"));
  const suggestions = suggestCoverage(solo, candidates, membersOf("dragonite"));
  assert.ok(suggestions.length > 0);
  for (const s of suggestions) assert.ok(s.covers.every((type) => (solo.gaps as PokemonType[]).includes(type)));
});

test("suggestions are deterministic and respect the limit", () => {
  const analysis = analyseTeam(typesOf("charizard", "dragonite"));
  const a = suggestCoverage(analysis, candidates, noOne, 3);
  const b = suggestCoverage(analysis, candidates, noOne, 3);
  assert.equal(a.length, 3);
  assert.deepEqual(a.map((s) => s.candidate.id), b.map((s) => s.candidate.id));
});

test("a species already on the team is not suggested even as another form", () => {
  const analysis = analyseTeam(typesOf("charizard", "dragonite"));
  const forms: Candidate[] = [{ id: 99999, species: "steelix", name: "steelix-mega", types: ["steel", "ground"], total: 700 }];
  assert.equal(suggestCoverage(analysis, forms, { ids: new Set(), species: new Set(["steelix"]) }).length, 0);
  assert.equal(suggestCoverage(analysis, forms, noOne).length, 1);
});

test("the team helpers read members in slot order", () => {
  const team = removeMember(teamOf("charizard", "dragonite", "gligar"), 0);
  assert.deepEqual(teamMembers(team).map((m) => m.pokemonId), [idOf("dragonite"), idOf("gligar")]);
  assert.equal(memberCount(team), 2);
});

// ---- cases found by deliberately breaking the code (a mutant that survived means a missing test) ----

test("an immunity counts as an answer: a type one member is weak to and another is immune to is not a gap", () => {
  // Charizard (fire/flying) is weak to electric; Gligar (ground/flying) is immune to it.
  const analysis = analyseTeam(typesOf("charizard", "gligar"));
  const electric = analysis.exposures.find((e) => e.type === "electric")!;
  assert.deepEqual([electric.weak, electric.resist, electric.immune], [1, 0, 1]);
  assert.ok(!analysis.gaps.includes("electric"), "the immune member answers it");
  assert.ok(analysis.resistances.some((e) => e.type === "electric"), "and it is listed among the resistances");
});

test("a save from another version is ignored even when its slots look fine", () => {
  assert.deepEqual(parseTeam({ version: 2, slots: [{ pokemonId: 6 }] }), emptyTeam());
  assert.deepEqual(parseTeam({ slots: [{ pokemonId: 6 }] }), emptyTeam());
  assert.equal(parseTeam({ version: TEAM_VERSION, slots: [{ pokemonId: 6 }] }).slots[0]?.pokemonId, 6);
});

test("a Pokémon that covers none of the gaps is never suggested, however strong it is", () => {
  const analysis = analyseTeam(typesOf("charizard", "dragonite", "aerodactyl"));
  const psychic: Candidate = { id: 1, species: "psychic-mon", name: "psychic-mon", types: ["psychic"], total: 900 };
  for (const gap of analysis.gaps) assert.ok(effectiveness(gap, psychic.types) >= 1, `psychic is not special against ${gap}`);
  assert.deepEqual(suggestCoverage(analysis, [psychic], noOne), []);
});

test("a candidate that is itself weak to a gap ranks below one that is not, even when it is stronger", () => {
  const analysis = analyseTeam(typesOf("charizard", "dragonite", "aerodactyl"));
  assert.ok(analysis.gaps.includes("ice"));
  const steel: Candidate = { id: 1, species: "steel-mon", name: "steel-mon", types: ["steel"], total: 500 }; // resists rock, ice and dragon
  const ground: Candidate = { id: 2, species: "ground-mon", name: "ground-mon", types: ["ground"], total: 1500 }; // resists rock, immune to electric, but weak to ice; its huge total would win if the weakness did not count
  assert.ok(effectiveness("ice", ground.types) > 1);
  const ranked = suggestCoverage(analysis, [ground, steel], noOne, 2).map((s) => s.candidate.name);
  assert.deepEqual(ranked, ["steel-mon", "ground-mon"]);
});
