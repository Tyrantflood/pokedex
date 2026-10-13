import assert from "node:assert/strict";
import { test } from "node:test";
import { BattleStreams, Dex, Teams } from "@pkmn/sim";
import { CpuPlayer, type Difficulty } from "../lib/battle/cpu-player";
import { FORMATS } from "../lib/battle/formats";
import { generateTeam } from "../lib/battle/teams";

// Slow (about 15 s): plays dozens of full CPU-vs-CPU battles. Not part of `npm test`; run it with `npm run test:strength`.

type Format = (typeof FORMATS)[number];

/** One battle between two CPUs; resolves to the winning side. */
async function battle(format: Format, p1: Difficulty, p2: Difficulty, seed: number): Promise<"p1" | "p2" | "tie"> {
  const dex = Dex.forFormat(format.formatId.split("@@@")[0]);
  const streams = BattleStreams.getPlayerStreams(new BattleStreams.BattleStream());
  void new CpuPlayer(streams.p1, "p1", dex, p1, seed * 2 + 1).start();
  void new CpuPlayer(streams.p2, "p2", dex, p2, seed * 2 + 2).start();
  const result = (async () => {
    for await (const chunk of streams.omniscient) {
      for (const line of chunk.split("\n")) {
        if (line.startsWith("|win|")) return line.slice(5) === "A" ? "p1" : "p2";
        if (line === "|tie") return "tie"; // not startsWith("|tie"): "|tier|..." is a header line
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

/** Normal against Easy over the same two teams with the sides swapped; returns Normal's wins and how many battles had a winner. */
async function normalVsEasy(format: Format, seeds: number) {
  let normalWins = 0;
  let decided = 0;
  for (let seed = 1; seed <= seeds; seed++) {
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
  return { normalWins, decided };
}

test("the Normal CPU beats the Easy CPU clearly in National Dex, from either side of the table", async () => {
  const { normalWins, decided } = await normalVsEasy(FORMATS[0], 12);
  console.log(`National Dex: Normal beat Easy in ${normalWins} of ${decided} battles`);
  assert.ok(decided >= 20, `only ${decided} of 24 battles had a winner`);
  assert.ok(normalWins / decided >= 0.65, `Normal won only ${normalWins} of ${decided}`);
});

test("and in the older generations, where it now uses each generation's own type chart", async () => {
  for (const key of ["gen1", "gen3", "gen5"]) {
    const format = FORMATS.find((f) => f.key === key)!;
    const { normalWins, decided } = await normalVsEasy(format, 6);
    console.log(`${key}: Normal beat Easy in ${normalWins} of ${decided} battles`);
    assert.ok(decided >= 8, `${key}: only ${decided} of 12 battles had a winner`);
    assert.ok(normalWins / decided >= 0.55, `${key}: Normal won only ${normalWins} of ${decided}`);
  }
});
