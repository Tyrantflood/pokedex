import assert from "node:assert/strict";
import { test } from "node:test";
import { BattleStreams, Dex, Teams } from "@pkmn/sim";
import { CpuPlayer, type Difficulty } from "../lib/battle/cpu-player";
import { bestSwitch, isBadMatchup, matchupScore, NO_GOOD_MOVE, scoreMove, type FighterFacts, type MoveFacts } from "../lib/battle/cpu-logic";
import { FORMATS } from "../lib/battle/formats";
import { generateTeam } from "../lib/battle/teams";

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
const score = (m: MoveFacts, me: FighterFacts, foe: FighterFacts) => scoreMove(m, me, foe, [], 1);

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
  assert.equal(isBadMatchup(me, foe), true);
  assert.equal(isBadMatchup({ types: ["water"], moveTypes: ["water"] }, foe), false);
  const bench = [
    { slot: 2, types: ["grass"], moveTypes: ["grass"], hpFraction: 1 },
    { slot: 3, types: ["water"], moveTypes: ["water"], hpFraction: 1 },
    { slot: 4, types: ["fire"], moveTypes: ["fire"], hpFraction: 0 },
  ];
  assert.equal(bestSwitch(bench, foe, matchupScore(me, foe))?.slot, 3);
  assert.equal(bestSwitch([bench[0]], foe, matchupScore(me, foe)), null, "no one better: stay in");
});

/** One battle between two CPUs; resolves to the winning side. */
async function battle(format: (typeof FORMATS)[number], p1: Difficulty, p2: Difficulty, seed: number): Promise<"p1" | "p2" | "tie"> {
  const dex = Dex.forFormat(format.formatId.split("@@@")[0]);
  const streams = BattleStreams.getPlayerStreams(new BattleStreams.BattleStream());
  void new CpuPlayer(streams.p1, "p1", dex, p1, seed * 2 + 1).start();
  void new CpuPlayer(streams.p2, "p2", dex, p2, seed * 2 + 2).start();
  const result = (async () => {
    for await (const chunk of streams.omniscient) {
      for (const line of chunk.split("\n")) {
        if (line.startsWith("|win|")) return line.slice(5) === "A" ? "p1" : "p2";
        if (line === "|tie") return "tie"; // not "|tier|", which is a header line
        if (line.startsWith("|turn|") && Number(line.slice(6)) > 300) return "tie";
      }
    }
    return "tie";
  })();
  void streams.omniscient.write(
    `>start ${JSON.stringify({ formatid: format.formatId, seed: `${seed},2,3,4` })}\n` +
      `>player p1 ${JSON.stringify({ name: "A", team: Teams.pack(generateTeam(format, `${seed},5,6,7`)) })}\n` +
      `>player p2 ${JSON.stringify({ name: "B", team: Teams.pack(generateTeam(format, `${seed},8,9,10`)) })}`,
  );
  const winner = await result;
  void streams.omniscient.writeEnd();
  return winner;
}

test("the Normal CPU beats the Easy CPU clearly, from either side of the table", async () => {
  const format = FORMATS[0];
  let normalWins = 0;
  let decided = 0;
  for (let seed = 1; seed <= 12; seed++) {
    // Same two teams, swapped sides, so team luck is shared.
    const asP1 = await battle(format, "normal", "easy", seed);
    const asP2 = await battle(format, "easy", "normal", seed);
    if (asP1 !== "tie") {
      decided++;
      if (asP1 === "p1") normalWins++;
    }
    if (asP2 !== "tie") {
      decided++;
      if (asP2 === "p2") normalWins++;
    }
  }
  assert.ok(decided >= 20, `only ${decided} of 24 battles had a winner`);
  assert.ok(normalWins / decided >= 0.65, `Normal won only ${normalWins} of ${decided}`);
});

