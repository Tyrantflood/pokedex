import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startLocalBattle } from "../lib/battle/engine";
import { FORMATS, RANDOM_FORMATS } from "../lib/battle/formats";
import { adjudicate, normalizeTurnLimit, TURN_LIMITS, type SideTally } from "../lib/battle/turn-limit";
import { applyLine, createView, syncRequest } from "../lib/battle/protocol";

const side = (name: string, mons: [hp: number, max: number][]): SideTally => ({ name, pokemon: mons.map(([hp, maxHp]) => ({ hp, maxHp, fainted: hp <= 0 })) });

test("the offered limits are Off, 30, 50 and 100; anything else is Off", () => {
  assert.deepEqual([...TURN_LIMITS], [0, 30, 50, 100]);
  for (const ok of [0, 30, 50, 100]) assert.equal(normalizeTurnLimit(ok), ok);
  for (const bad of [10, -5, "50", null, undefined, 1000, NaN]) assert.equal(normalizeTurnLimit(bad), 0);
});

test("at the limit, more Pokémon left wins, whatever the HP", () => {
  const v = adjudicate(side("You", [[10, 100], [10, 100], [10, 100]]), side("CPU", [[100, 100], [100, 100], [0, 100]]), 50);
  assert.equal(v.winner, "p1");
  assert.equal(v.reason, "pokemon");
  assert.deepEqual(v.remaining, [3, 2]);
  assert.match(v.message, /^Turn limit reached \(50\)\. You has 3 Pokémon left to CPU's 2, so You wins\.$/);
  assert.equal(adjudicate(side("You", [[100, 100]]), side("CPU", [[1, 100], [1, 100]]), 30).winner, "p2");
});

test("level on Pokémon: the higher total HP percentage wins, summed across the team with fainted ones counting 0", () => {
  // 2 left each. You: 100% + 50% = 150. CPU: 80% + 60% = 140 (the maximums differ: percentages, not raw HP).
  const v = adjudicate(side("You", [[300, 300], [50, 100], [0, 100]]), side("CPU", [[40, 50], [6, 10], [0, 80]]), 100);
  assert.equal(v.reason, "hp");
  assert.equal(v.winner, "p1");
  assert.deepEqual(v.hpPercent.map((n) => Math.round(n)), [150, 140]);
  assert.match(v.message, /Both sides have 2 Pokémon left; You has more total HP \(150% to CPU's 140%\)/);
  // The other way round, and raw HP must not decide it: a huge Pokémon at 10 % is worth 10, not its 1000 HP.
  const w = adjudicate(side("You", [[100, 1000]]), side("CPU", [[20, 100]]), 50);
  assert.equal(w.winner, "p2");
});

test("level on both: a draw", () => {
  const v = adjudicate(side("You", [[50, 100], [100, 100]]), side("CPU", [[100, 100], [25, 50]]), 30);
  assert.equal(v.winner, null);
  assert.equal(v.reason, "draw");
  assert.match(v.message, /draw/);
  assert.equal(adjudicate(side("A", []), side("B", []), 30).winner, null);
});

test("a Pokémon with 0 HP counts as fainted even if the flag lags, and bad maximums can't poison the total", () => {
  const odd: SideTally = { name: "You", pokemon: [{ hp: 0, maxHp: 100, fainted: false }, { hp: 50, maxHp: 0, fainted: false }] };
  const v = adjudicate(odd, side("CPU", [[1, 100]]), 30);
  assert.ok(Number.isFinite(v.hpPercent[0]));
  assert.deepEqual(v.remaining, [1, 1], "0 HP is not standing; 50/0 is counted as standing but adds nothing");
});

/** Plays one battle with a limit, the player always using its first move, and returns the log lines. */
async function play(formatKey: string, turnLimit: number) {
  const format = FORMATS.find((f) => f.key === formatKey)!;
  const view = createView();
  const lines: string[] = [];
  await new Promise<void>((resolve, reject) => {
    const battle = startLocalBattle({ format, difficulty: "easy", playerName: "Tester", turnLimit }, (message) => {
      try {
        lines.push(...message.lines);
        for (const line of message.lines) applyLine(view, line, "p1", battle.lookups);
        if (view.winner !== null) {
          battle.destroy();
          return resolve();
        }
        const request = message.request;
        if (!request || request.wait) return;
        syncRequest(view, "p1", request, battle.lookups);
        if (request.forceSwitch || !request.active) {
          const slot = request.team.findIndex((p) => !p.active && (request.reviving ? p.fainted : !p.fainted));
          battle.choose(slot >= 0 ? `switch ${slot + 1}` : "default");
        } else {
          battle.choose(`move ${Math.max(1, request.active.moves.findIndex((m) => !m.disabled && m.pp !== 0) + 1)}`);
        }
      } catch (error) {
        battle.destroy();
        reject(error);
      }
    });
  });
  return { view, lines };
}

test("a battle with a limit ends after that many turns, never showing the next one, and says why", async () => {
  let ended = 0;
  for (const [key, limit] of [["natdex", 2], ["gen9", 3], ["gen4", 2], ["gen1", 2], ["natdex", 3]] as const) {
    const { view, lines } = await play(key, limit);
    const turns = lines.filter((l) => /^\|turn\|\d+$/.test(l)).map((l) => Number(l.slice(6)));
    assert.ok(Math.max(...turns) <= limit, `${key}: turn ${Math.max(...turns)} was shown with a limit of ${limit}`);
    assert.ok(view.winner !== null);
    const message = lines.find((l) => l.startsWith("|-message|Turn limit reached"));
    if (message) {
      ended++;
      assert.equal(view.turn, limit, "it ended at the limit");
      assert.ok(view.log.some((e) => e.text.startsWith("Turn limit reached")), "the log says why");
      if (view.winner === "") assert.match(message, /draw/);
      else assert.ok(message.includes(`${view.winner} wins`), `message "${message}" vs winner ${view.winner}`);
    } else {
      assert.ok(turns.length === 0 || Math.max(...turns) <= limit, "won outright before the limit");
    }
  }
  assert.ok(ended >= 3, `only ${ended} of 5 battles reached their limit`);
});

test("without a limit nothing is cut short, and every format keeps the Endless Battle Clause when a limit is set", async () => {
  const none = await play("gen9", 0);
  assert.ok(!none.lines.some((l) => l.includes("Turn limit reached")));
  // The clause is part of every format (Gens 4-9 get it from formats.ts, the rest have it already), and a turn limit of ours must not remove it.
  for (const format of RANDOM_FORMATS) {
    const { lines } = await play(format.key, 2);
    assert.ok(lines.some((l) => l.startsWith("|rule|Endless Battle Clause")), `${format.key} has no Endless Battle Clause with a turn limit set`);
  }
});

test("the simulator's own 1000-turn backstop is still there (it is always on, with or without a limit of ours)", () => {
  // Not played out (1000 turns): this only checks that the installed simulator still contains the rule we rely on as a last resort.
  const entry = fileURLToPath(import.meta.resolve("@pkmn/sim"));
  const source = readFileSync(path.join(path.dirname(entry), "battle.mjs"), "utf8");
  assert.match(source, /if \(this\.turn > 1000\)[\s\S]{0,200}hit the turn limit[\s\S]{0,80}this\.tie\(\)/, "the 1000-turn tie is gone from the simulator");
});
