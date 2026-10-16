import assert from "node:assert/strict";
import { test } from "node:test";
import { BattleStreams, Teams } from "@pkmn/sim";
import type { PokemonSet } from "@pkmn/sets";
import { moveChoice, type Special } from "../lib/battle/move-choice";
import { parseRequest, type ParsedRequest } from "../lib/battle/protocol";

/**
 * A Pokémon that CAN Mega Evolve, use a Z-Move, Dynamax or Terastallize must not do it until the player turns the toggle on: the panel's choice
 * is built by moveChoice(slot, toggle), and the simulator then acts on exactly that. Each case plays several ordinary turns against a wall that
 * only heals (so nothing faints), checking the option stays on offer and nothing happens, then uses the toggle once and checks it happens once.
 */
const set = (species: string, item: string, moves: string[], extra: Partial<PokemonSet> = {}): PokemonSet => ({
  name: species,
  species,
  item,
  ability: "",
  moves,
  nature: "Bold",
  gender: "",
  evs: { hp: 252, atk: 0, def: 252, spa: 0, spd: 4, spe: 0 },
  ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
  level: 100,
  ...extra,
});

interface Case {
  name: string;
  formatId: string;
  special: Special;
  mine: PokemonSet;
  /** Whether the request offers it, and the protocol line it causes. */
  offered: (request: ParsedRequest) => boolean;
  line: RegExp;
}

const WALL = set("Blissey", "Leftovers", ["Soft-Boiled", "Soft-Boiled", "Soft-Boiled", "Soft-Boiled"]);
const CASES: Case[] = [
  { name: "Mega Evolution", formatId: "gen7customgame", special: "mega", mine: set("Venusaur", "Venusaurite", ["Synthesis", "Giga Drain", "Sleep Powder", "Sludge Bomb"]), offered: (r) => !!r.active?.canMega, line: /^\|-mega\|/ },
  { name: "a Z-Move", formatId: "gen7customgame", special: "z", mine: set("Tapu Fini", "Waterium Z", ["Surf", "Recover", "Moonblast", "Calm Mind"]), offered: (r) => !!r.active?.zMoves.some(Boolean), line: /^\|-zpower\|/ },
  { name: "Dynamax", formatId: "gen8customgame", special: "dynamax", mine: set("Blissey", "Leftovers", ["Soft-Boiled", "Seismic Toss", "Toxic", "Protect"]), offered: (r) => !!r.active?.canDynamax, line: /^\|-start\|p1a: [^|]+\|Dynamax/ },
  { name: "Terastallization", formatId: "gen9customgame", special: "tera", mine: set("Blissey", "Leftovers", ["Soft-Boiled", "Seismic Toss", "Toxic", "Protect"], { teraType: "Fairy" }), offered: (r) => !!r.active?.canTera, line: /^\|-terastallize\|/ },
];

/** Plays `plainTurns` ordinary turns, then one with the toggle; returns every protocol line p1 saw, with the turn each came in. */
async function play(c: Case, plainTurns: number) {
  let over = false; // nothing is written once the battle has been shut down
  const battleStream = new BattleStreams.BattleStream();
  const streams = BattleStreams.getPlayerStreams(battleStream);
  void streams.omniscient.write(
    `>start ${JSON.stringify({ formatid: c.formatId, seed: [1, 2, 3, 4] })}\n` +
      `>player p1 ${JSON.stringify({ name: "Me", team: Teams.pack([c.mine]) })}\n` +
      `>player p2 ${JSON.stringify({ name: "Wall", team: Teams.pack([WALL]) })}`,
  );
  void (async () => {
    for await (const chunk of streams.omniscient) void chunk;
  })();
  void (async () => {
    for await (const chunk of streams.p2) {
      if (!chunk.includes("|request|") || chunk.includes('"wait"')) continue;
      if (!over) void streams.p2.write(chunk.includes('"teamPreview"') ? "default" : "move 1");
    }
  })();

  const seen: { turn: number; line: string }[] = [];
  const offers: boolean[] = [];
  let turn = 0;
  let asked = 0;
  for await (const chunk of streams.p1) {
    for (const line of chunk.split("\n")) {
      if (line.startsWith("|turn|")) turn = Number(line.slice(6));
      else if (line.startsWith("|request|")) {
        const request = parseRequest(JSON.parse(line.slice(9)));
        if (request.teamPreview) {
          void streams.p1.write("default");
          continue;
        }
        if (request.wait || !request.active) continue;
        offers.push(c.offered(request));
        asked++;
        // The first `plainTurns` questions are answered exactly as the panel does with the toggle off; the next with it on.
        void streams.p1.write(moveChoice(1, asked <= plainTurns ? null : c.special));
      } else if (line) seen.push({ turn, line });
    }
    if (asked > plainTurns && turn >= plainTurns + 2) break;
  }
  over = true;
  void streams.omniscient.writeEnd();
  return { seen, offers, plainTurns };
}

for (const c of CASES) {
  test(`${c.name} is never used on its own across several turns, only when its toggle is on`, async () => {
    const { seen, offers, plainTurns } = await play(c, 4);
    assert.ok(offers.slice(0, plainTurns).every(Boolean), `${c.name} stayed on offer every plain turn`);
    const hits = seen.filter((s) => c.line.test(s.line));
    assert.equal(hits.length, 1, `${c.name} happened ${hits.length} times (${hits.map((h) => h.line).join(" / ")})`);
    assert.ok(hits[0].turn > plainTurns, `it happened on turn ${hits[0].turn}, after the ${plainTurns} plain ones`);
    const species = seen.filter((s) => s.turn <= plainTurns && /^\|(detailschange|-formechange)\|/.test(s.line));
    assert.deepEqual(species, [], "nothing changed form before the toggle was used");
  });
}

test("the panel's choice: toggle off gives a plain move, in every slot, however many turns it is asked", () => {
  for (let turn = 0; turn < 20; turn++) for (const slot of [1, 2, 3, 4]) assert.equal(moveChoice(slot, null), `move ${slot}`);
});
