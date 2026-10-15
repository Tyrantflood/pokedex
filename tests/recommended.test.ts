import assert from "node:assert/strict";
import { test } from "node:test";
import { Dex } from "@pkmn/sim";
import { TEAM_FORMATS, formatByKey } from "../lib/battle/formats";
import { cpuTeamFor, CREDIT, recommendedFor, recommendedFormat, toSavedTeam } from "../lib/battle/recommended";
import { exportText, importText, packSets, toolsFor, unpackSets, validateSets } from "../lib/battle/team-check";
import { describeTeam } from "../lib/battle/team-style";

const TAGS = new Set(["Offense", "Bulky offense", "Balance", "Stall", "Weather", "Trick Room"]);

test("every recommended team passes the simulator's team validator for the format it is offered in", () => {
  let checked = 0;
  for (const format of TEAM_FORMATS) {
    const tools = toolsFor(format.formatId);
    for (const team of recommendedFor(format.key)) {
      const verdict = validateSets(tools, team.sets);
      assert.deepEqual(verdict.errors, [], `${format.key}: ${team.name}`);
      assert.ok(team.sets.length >= 1 && team.sets.length <= 6);
      // And it survives being packed for the battle and read back, still legal.
      const back = unpackSets(packSets(verdict.sets))!;
      assert.equal(validateSets(tools, back).ok, true, `${format.key}: ${team.name} after packing`);
      checked++;
    }
  }
  assert.ok(checked >= 100, `only ${checked} teams checked`);
});

test("each format offers at most 20 teams, every one with a name, a tag, a reason and its poster, and no two alike", () => {
  for (const format of TEAM_FORMATS) {
    const teams = recommendedFor(format.key);
    assert.ok(teams.length >= 1, `${format.key} has no recommended team, so the CPU could not play it`);
    assert.ok(teams.length <= 20, format.key);
    const ids = new Set(teams.map((t) => t.id));
    assert.equal(ids.size, teams.length, `${format.key}: duplicate ids`);
    const lineups = new Set(teams.map((t) => t.sets.map((s) => `${s.species}/${s.item}/${s.moves.join(",")}`).join("|")));
    assert.equal(lineups.size, teams.length, `${format.key}: the same team twice`);
    for (const team of teams) {
      assert.ok(team.name.trim().length > 0 && team.name.length <= 60);
      assert.ok(TAGS.has(team.tag), `${team.name}: tag ${team.tag}`);
      assert.ok(team.why.length > 30 && team.why.length < 400 && team.why.endsWith("."), `${team.name}: ${team.why}`);
      assert.ok(team.author.length > 0);
      assert.equal(team.icons.length, team.sets.length);
      assert.ok(team.id.startsWith(`${format.key}-`));
    }
    const info = recommendedFormat(format.key)!;
    assert.ok(info.valid >= teams.length && info.published >= info.valid);
  }
});

test("the formats with the most to offer are capped at 20; the thin ones simply have fewer (nothing is padded)", () => {
  assert.equal(recommendedFor("team-gen7ou").length, 20);
  assert.ok(recommendedFor("team-gen9ou").length < 20);
  const info = recommendedFormat("team-gen9ou")!;
  assert.equal(recommendedFor("team-gen9ou").length, info.valid, "all the valid ones, no more");
});

test("the credit names Smogon and the source project", () => {
  assert.match(CREDIT.url, /smogon\.com/);
  assert.match(CREDIT.via, /pkmn\/smogon/);
});

test("the CPU's team is a recommended one of the format, and avoids the player's when it can", () => {
  const all = recommendedFor("team-gen8ou");
  const avoid = all[0].id;
  for (let i = 0; i < 40; i++) {
    const pick = cpuTeamFor("team-gen8ou", avoid, () => i / 40)!;
    assert.ok(all.some((t) => t.id === pick.id));
    assert.notEqual(pick.id, avoid);
  }
  assert.equal(cpuTeamFor("team-nope"), null);
  assert.ok(cpuTeamFor("team-gen9ou", "x")!.sets.length > 0);
});

test("a recommended team copied into My Teams is legal, independent and labelled with its format", () => {
  const team = recommendedFor("team-natdex")[0];
  const saved = toSavedTeam(team, "copy00001", 7);
  assert.equal(saved.formatKey, "team-natdex");
  assert.equal(saved.check?.ok, true);
  assert.equal(saved.check?.formatId, formatByKey("team-natdex").formatId);
  saved.sets[0].moves[0] = "Changed";
  assert.notEqual(recommendedFor("team-natdex")[0].sets[0].moves[0], "Changed");
});

test("Showdown text round-trips: export then import gives back a legal team with the same moves and items", () => {
  for (const key of ["team-gen9ou", "team-gen7ou", "team-gen4ou", "team-gen1ou", "team-natdex"]) {
    const format = formatByKey(key);
    const tools = toolsFor(format.formatId);
    const team = recommendedFor(key)[0];
    const back = importText(exportText(team.sets), format.gen)!;
    assert.equal(back.sets.length, team.sets.length);
    back.sets.forEach((s, i) => {
      assert.equal(s.species, team.sets[i].species);
      assert.deepEqual([...s.moves].sort(), [...team.sets[i].moves].sort());
      assert.equal(s.item, team.sets[i].item);
    });
    assert.equal(validateSets(tools, back.sets).ok, true, key);
  }
  const headed = importText("=== [gen9ou] Folder/My team ===\n\nGreat Tusk @ Leftovers\nAbility: Protosynthesis\nEVs: 252 HP / 4 Atk / 252 Def\nImpish Nature\n- Rapid Spin\n");
  assert.equal(headed?.name, "My team");
  assert.equal(headed?.formatId, "gen9ou");
  assert.equal(importText("this is not a team at all, just words"), null);
  assert.equal(importText(""), null);
});

test("the validator refuses what it should: a banned Pokémon, an illegal move, the 510 EV cap, a duplicate", () => {
  const ou = toolsFor("gen9ou@@@!Team Preview");
  const base = recommendedFor("team-gen9ou")[0].sets;
  const withBanned = [{ ...base[0], species: "Koraidon", name: "Koraidon", ability: "Orichalcum Pulse", moves: ["Close Combat"] }, ...base.slice(1)];
  assert.equal(validateSets(ou, withBanned).ok, false, "an Uber in OU");
  assert.equal(validateSets(toolsFor("gen9anythinggoes@@@!Team Preview"), withBanned.slice(0, 1)).errors.some((e) => /Koraidon/.test(e) && /banned/.test(e)), false, "Anything Goes bans nothing");
  const illegalMove = [{ ...base[0], moves: ["Spore", ...base[0].moves.slice(1)] }, ...base.slice(1)];
  assert.equal(validateSets(ou, illegalMove).ok, false, "a move the Pokémon can't learn");
  const overEv = [{ ...base[0], evs: { hp: 252, atk: 252, def: 252, spa: 252, spd: 252, spe: 252 } }, ...base.slice(1)];
  assert.equal(validateSets(ou, overEv).ok, false, "over 510 EVs");
  assert.equal(validateSets(ou, [base[0], base[0]]).ok, false, "the same Pokémon twice");
  assert.equal(validateSets(ou, []).ok, false, "an empty team");
});

test("playstyle: a rain team is Weather, a team of walls is Stall, with sentences made from the team", () => {
  const dex = Dex.forFormat("gen9ou");
  const mon = (species: string, ability: string, moves: string[], item = "Leftovers") => ({ name: species, species, item, ability, moves, nature: "Serious", gender: "", evs: {}, ivs: {}, level: 100 }) as never;
  const rain = describeTeam(dex, [
    mon("Pelipper", "Drizzle", ["Scald", "U-turn", "Roost", "Hurricane"]),
    mon("Barraskewda", "Swift Swim", ["Liquidation", "Close Combat", "Flip Turn", "Psychic Fangs"]),
    mon("Kingdra", "Swift Swim", ["Waterfall", "Dragon Dance", "Outrage", "Hydro Pump"]),
  ]);
  assert.equal(rain.tag, "Weather");
  assert.match(rain.why, /Pelipper brings rain/);
  const walls = describeTeam(dex, [
    mon("Blissey", "Natural Cure", ["Soft-Boiled", "Toxic", "Seismic Toss", "Stealth Rock"]),
    mon("Corviknight", "Pressure", ["Roost", "Defog", "Body Press", "Brave Bird"]),
    mon("Toxapex", "Regenerator", ["Recover", "Toxic", "Haze", "Scald"]),
    mon("Clefable", "Magic Guard", ["Moonlight", "Wish", "Protect", "Moonblast"]),
  ]);
  assert.equal(walls.tag, "Stall");
  assert.ok(walls.score > 0);
  const rush = describeTeam(dex, [
    mon("Dragapult", "Clear Body", ["Dragon Darts", "U-turn", "Shadow Ball", "Thunderbolt"], "Choice Specs"),
    mon("Iron Valiant", "Quark Drive", ["Swords Dance", "Close Combat", "Knock Off", "Spirit Break"], "Booster Energy"),
    mon("Roaring Moon", "Protosynthesis", ["Dragon Dance", "Earthquake", "Acrobatics", "Knock Off"], "Booster Energy"),
  ]);
  assert.equal(rush.tag, "Offense");
});
