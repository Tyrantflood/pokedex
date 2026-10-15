import assert from "node:assert/strict";
import { test } from "node:test";
import { Dex } from "@pkmn/sim";
import { startLocalBattle, type BattleMessage } from "../lib/battle/engine";
import { FORMATS, RANDOM_FORMATS } from "../lib/battle/formats";
import { spriteIdFor } from "../lib/battle/ids";
import { makeLookups } from "../lib/battle/dex-facts";
import { applyLine, createView, syncRequest, type BattleView, parseCondition, parseDetails, parseIdent, parseRequest } from "../lib/battle/protocol";
import { generateTeam } from "../lib/battle/teams";
import { pokemonSnapshot } from "./fixtures/load";

test("protocol parsing helpers", () => {
  assert.deepEqual(parseIdent("p2a: Mr. Mime"), { side: "p2", position: "a", name: "Mr. Mime" });
  assert.deepEqual(parseIdent("p1: Pikachu"), { side: "p1", position: "", name: "Pikachu" });
  assert.deepEqual(parseCondition("145/200 par"), { hp: 145, maxHp: 200, status: "par", fainted: false });
  assert.equal(parseCondition("0 fnt").fainted, true);
  assert.deepEqual(parseDetails("Charizard, L84, M, shiny"), { species: "Charizard", level: 84, gender: "M" });
  assert.deepEqual(parseDetails("Gengar"), { species: "Gengar", level: 100, gender: "N" });
});

test("a locked-in move (Outrage) has no PP in the request and must stay selectable", () => {
  const request = parseRequest({
    rqid: 3,
    active: [{ moves: [{ move: "Outrage", id: "outrage" }], trapped: true }],
    side: { pokemon: [{ ident: "p1: Dragonite", details: "Dragonite, L80, M", condition: "200/250", active: true, moves: ["outrage"] }] },
  });
  assert.equal(request.active?.moves[0].pp, null);
  assert.equal(request.active?.moves[0].disabled, false);
  assert.equal(request.active?.trapped, true);
  const normal = parseRequest({ rqid: 4, active: [{ moves: [{ move: "Surf", id: "surf", pp: 0, maxpp: 24 }] }], side: { pokemon: [] } });
  assert.equal(normal.active?.moves[0].pp, 0, "an empty move is still empty");
});

test("an Illusion that breaks renames the disguised Pokémon instead of adding a phantom team member", () => {
  const dex = Dex.forFormat("gen9nationaldex");
  const lookups = makeLookups(dex);
  const view = createView();
  const feed = (line: string) => applyLine(view, line, "p1", lookups);
  feed("|switch|p2a: Lucario|Lucario, L80, M|100/100");
  feed("|-damage|p2a: Lucario|40/100");
  feed("|replace|p2a: Zoroark|Zoroark, L80, M");
  assert.equal(view.sides.p2.mons.length, 1, "one team member, not two");
  assert.equal(view.sides.p2.mons[0].species, "Zoroark");
  assert.equal(view.sides.p2.mons[0].hp, 40, "its HP carries over");
  feed("|faint|p2a: Zoroark");
  assert.equal(view.sides.p2.mons[0].fainted, true);
});

test("a silent forme change (Primal Reversion, Mega) keeps the Pokémon's HP and status", () => {
  const view = createView();
  const feed = (line: string) => applyLine(view, line, "p1", makeLookups(Dex.forFormat("gen6randombattle")));
  feed("|switch|p2a: Kyogre|Kyogre, L70|100/100");
  feed("|-damage|p2a: Kyogre|60/100");
  feed("|detailschange|p2a: Kyogre|Kyogre-Primal|[silent]");
  const mon = view.sides.p2.mons[0];
  assert.equal(mon.species, "Kyogre-Primal");
  assert.equal(mon.hp, 60);
  assert.equal(mon.fainted, false);
  assert.ok(Number.isFinite(mon.maxHp));
});

test("sprite ids: base species use the dex number, forms use PokéAPI's id", () => {
  const dex = Dex.forFormat("gen9nationaldex");
  const id = (name: string) => {
    const s = dex.species.get(name);
    return spriteIdFor(s.id, s.num);
  };
  assert.equal(id("Charizard"), 6);
  assert.equal(id("Charizard-Mega-X"), 10034);
  assert.equal(id("Vulpix-Alola"), 10103);
  assert.equal(id("Gholdengo"), 1000);
});

test("every form id the table maps to is a real PokéAPI form of the same species", () => {
  const dex = Dex.forFormat("gen9nationaldex");
  const byId = new Map(pokemonSnapshot.map((p) => [p.id, p.name]));
  let checked = 0;
  for (const species of dex.species.all()) {
    if (species.num <= 0 || !species.forme) continue;
    const id = spriteIdFor(species.id, species.num);
    if (id === species.num) continue;
    const name = byId.get(id);
    assert.ok(name, `${species.name} -> ${id} is not in the PokéAPI snapshot`);
    assert.ok(name.replaceAll("-", "").startsWith(species.baseSpecies.toLowerCase().replace(/[^a-z0-9]/g, "")), `${species.name} -> ${name}`);
    checked++;
  }
  assert.ok(checked > 250, `only ${checked} forms checked`);
});

test("National Dex teams: six Pokémon, from every generation, no duplicate species, holding items (bar Acrobatics sets)", () => {
  const natdex = FORMATS[0];
  const dex = Dex.forFormat("gen9nationaldex");
  const species = new Set<string>();
  const generations = new Set<number>();
  for (let i = 0; i < 120; i++) {
    const team = generateTeam(natdex, `${i},2,3,4`);
    assert.equal(team.length, 6);
    assert.equal(new Set(team.map((m) => dex.species.get(m.species).baseSpecies)).size, 6, "species clause");
    for (const member of team) {
      const s = dex.species.get(member.species);
      species.add(s.id);
      generations.add(s.gen);
      if (!member.item) assert.ok(member.moves.includes("acrobatics"), `${member.species} has no item but no Acrobatics`);
    }
  }
  for (let gen = 1; gen <= 8; gen++) assert.ok(generations.has(gen), `no generation ${gen} Pokémon in 120 teams`);
  assert.ok(species.size > 300, `only ${species.size} distinct species`);
});

test("single-generation formats generate full teams", () => {
  for (const format of RANDOM_FORMATS.slice(1)) assert.equal(generateTeam(format, "1,2,3,4").length, 6, format.key);
});

/** Plays the player's side by hand (first move, first healthy switch) while the real reducer follows the protocol. */
function playOut(formatKey: string, difficulty: "easy" | "normal", turnCap = 200): Promise<{ view: BattleView; turns: number }> {
  const format = FORMATS.find((f) => f.key === formatKey)!;
  const view = createView();
  return new Promise((resolve, reject) => {
    const battle = startLocalBattle({ format, difficulty, playerName: "Tester" }, (message: BattleMessage) => {
      try {
        if (message.error) battle.choose("default");
        for (const line of message.lines) applyLine(view, line, "p1", battle.lookups);
        if (view.winner !== null) {
          battle.destroy();
          return resolve({ view, turns: view.turn });
        }
        const request = message.request;
        if (!request || request.wait) return;
        syncRequest(view, "p1", request, battle.lookups);
        if (view.turn > turnCap) {
          battle.forfeit();
          return;
        }
        if (request.forceSwitch || !request.active) {
          const slot = request.team.findIndex((p) => !p.active && (request.reviving ? p.fainted : !p.fainted));
          battle.choose(slot >= 0 ? `switch ${slot + 1}` : "default");
        } else {
          const index = request.active.moves.findIndex((m) => !m.disabled && m.pp !== 0);
          battle.choose(`move ${index >= 0 ? index + 1 : 1}`);
        }
      } catch (error) {
        battle.destroy();
        reject(error);
      }
    });
  });
}

for (const [key, difficulty] of [
  ["natdex", "normal"],
  ["natdex", "easy"],
  ["gen9", "normal"],
  ["gen8", "normal"],
  ["gen7", "normal"],
  ["gen6", "easy"],
  ["gen4", "normal"],
  ["gen2", "normal"],
  ["gen1", "easy"],
] as const) {
  test(`a ${difficulty} CPU battle in ${key} plays to a result and the reducer follows it`, async () => {
    const { view } = await playOut(key, difficulty);
    assert.notEqual(view.winner, null);
    assert.ok(view.log.length > 10);
    assert.equal(view.sides.p2.name.startsWith("CPU"), true);
    assert.equal(view.sides.p1.mons.length, 6, "the whole own team is known from the request");
    const loser = view.winner === "Tester" ? view.sides.p2 : view.sides.p1;
    if (view.winner) assert.ok(loser.mons.every((m) => m.fainted) || view.turn > 200, `the losing side is all fainted (turn ${view.turn}, ${loser.mons.map((m) => m.species + ":" + m.fainted + ":" + m.hp).join(" ")})`);
    for (const side of Object.values(view.sides)) for (const mon of side.mons) assert.ok(mon.spriteId > 0, `${mon.species} has a sprite id`);
  });
}

test("every format carries the Endless Battle Clause: Gens 1-3 and National Dex by themselves, Gens 4-9 by our added rule", () => {
  for (const format of RANDOM_FORMATS) {
    const hasItself = ["natdex", "gen3", "gen2", "gen1"].includes(format.key);
    assert.equal(format.formatId.includes("@@@Endless Battle Clause"), !hasItself, `${format.key}: ${format.formatId}`);
    assert.ok(!format.formatId.includes("@@@!Endless"), "never switched off");
  }
});

test("Revival Blessing asks for a fainted Pokémon: the request says so, and a revive choice is a switch to a fainted slot", () => {
  const request = parseRequest({
    forceSwitch: [true],
    side: {
      id: "p1",
      pokemon: [
        { ident: "p1: Pawmot", details: "Pawmot, L80", condition: "200/250", active: true, reviving: true, moves: ["revivalblessing"] },
        { ident: "p1: Gengar", details: "Gengar, L80", condition: "0 fnt", active: false, moves: [] },
        { ident: "p1: Snorlax", details: "Snorlax, L80", condition: "300/300", active: false, moves: [] },
      ],
    },
  });
  assert.equal(request.reviving, true);
  assert.equal(request.forceSwitch, true);
  const reviveSlot = request.team.findIndex((p) => !p.active && (request.reviving ? p.fainted : !p.fainted));
  assert.equal(reviveSlot, 1, "the fainted Gengar, not the healthy Snorlax");
  assert.equal(parseRequest({ forceSwitch: [true], side: { id: "p1", pokemon: [{ ident: "p1: A", details: "Pawmot, L80", condition: "0 fnt", active: true }, { ident: "p1: B", details: "Gengar, L80", condition: "10/10", active: false }] } }).reviving, false, "an ordinary forced switch is not a revive");
});
