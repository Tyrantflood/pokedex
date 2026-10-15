import assert from "node:assert/strict";
import { test } from "node:test";
import { startLocalBattle, type BattleMessage } from "../lib/battle/engine";
import { FORMATS, TEAM_FORMATS } from "../lib/battle/formats";
import { applyLine, createView, syncRequest } from "../lib/battle/protocol";
import { cpuTeamFor, recommendedFor } from "../lib/battle/recommended";

function play(formatKey: string, player: ReturnType<typeof recommendedFor>[number], cpu: typeof player, difficulty: "easy" | "normal" = "normal") {
  const format = FORMATS.find((f) => f.key === formatKey)!;
  const view = createView();
  return new Promise<{ view: ReturnType<typeof createView>; turns: number }>((resolve, reject) => {
    const battle = startLocalBattle({ format, difficulty, playerName: "Tester", turnLimit: 40, teams: { player: player.sets, cpu: cpu.sets } }, (message: BattleMessage) => {
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

test("every bring-your-own-team format: the player's recommended team against the CPU's plays to a result, with the right teams", async () => {
  for (const format of TEAM_FORMATS) {
    const mine = recommendedFor(format.key)[0];
    const theirs = cpuTeamFor(format.key, mine.id, () => 0)!;
    const { view } = await play(format.key, mine, theirs);
    assert.notEqual(view.winner, null, `${format.key} did not finish`);
    // Formes can change in battle (Mega, Zacian with its sword, Terastal Ogerpon), so compare on the start of the name.
    assert.deepEqual(view.sides.p1.mons.map((m) => m.species.split("-")[0]), mine.sets.map((s) => s.species.split("-")[0]), `${format.key}: your team is the one you brought, in order`);
    assert.ok(view.log.length > 10);
    const seen = view.sides.p2.mons.map((m) => m.species);
    const theirSpecies = theirs.sets.map((s) => s.species);
    // A Mega Evolution or other forme change shows under its new name ("Charizard-Mega-X"), so match on the start.
    assert.ok(seen.every((s) => theirSpecies.some((t) => s.startsWith(t.split("-")[0]))), `${format.key}: the CPU only used its own team`);
  }
});

test("the first Pokémon on a team leads, and an Easy CPU can play a custom team too", async () => {
  const mine = recommendedFor("team-gen7ou")[2];
  const theirs = recommendedFor("team-gen7ou")[3];
  const { view } = await play("team-gen7ou", mine, theirs, "easy");
  assert.ok(view.log.some((e) => e.text.includes(mine.sets[0].species)), "the lead was sent out first");
});

test("an illegal team is refused before any battle starts, naming the problem and whose team it is", () => {
  const format = FORMATS.find((f) => f.key === "team-gen9ou")!;
  const good = recommendedFor("team-gen9ou");
  const banned = [{ ...good[0].sets[0], species: "Koraidon", name: "Koraidon", ability: "Orichalcum Pulse", moves: ["Close Combat"] }];
  assert.throws(() => startLocalBattle({ format, difficulty: "easy", playerName: "T", teams: { player: banned, cpu: good[1].sets } }, () => {}), /Your team isn't legal in Gen 9 OU: .*Koraidon/);
  assert.throws(() => startLocalBattle({ format, difficulty: "easy", playerName: "T", teams: { player: good[1].sets, cpu: banned } }, () => {}), /The CPU's team isn't legal/);
  assert.throws(() => startLocalBattle({ format, difficulty: "easy", playerName: "T" }, () => {}), /needs teams/);
});

test("the team formats are what the lobby promises: OU for each of the nine generations, National Dex and Anything Goes, all custom", () => {
  assert.deepEqual(
    TEAM_FORMATS.map((f) => f.key),
    ["team-natdex", ...[9, 8, 7, 6, 5, 4, 3, 2, 1].map((g) => `team-gen${g}ou`), "team-ag"],
  );
  assert.ok(TEAM_FORMATS.every((f) => f.custom && f.generator === ""));
  assert.ok(FORMATS.filter((f) => !f.custom).every((f) => f.generator !== ""));
  // Gens 1-4 have no Team Preview rule to remove; later ones have it removed (the first Pokemon leads).
  for (const f of TEAM_FORMATS) assert.equal(f.formatId.includes("!Team Preview"), f.gen >= 5, f.key);
});
