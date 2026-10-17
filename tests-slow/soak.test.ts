import assert from "node:assert/strict";
import { test } from "node:test";
import { startLocalBattle, type BattleMessage } from "../lib/battle/engine";
import { FORMATS, type BattleFormat } from "../lib/battle/formats";
import { chooseFor, mulberry, viewProblems } from "./policy";
import { applyLine, createView, syncRequest } from "../lib/battle/protocol";
import { cpuTeamFor, recommendedFor } from "../lib/battle/recommended";

// Slow (a few minutes): plays full battles against the CPU in every format with a player who uses everything the screen offers (leads, switches,
// Mega/Z/Dynamax/Tera toggles). Run with `npm run test:soak`; SOAK_N sets battles per format (default 4), SOAK_FORMATS a comma list of keys.
// It fails on any simulator refusal of a choice the screen offered, any exception, any stall, or a battle that does not end.

const NL = String.fromCharCode(10);
const N = Number(process.env.SOAK_N || 4);
const ONLY = process.env.SOAK_FORMATS?.split(",");
const MAX_MS = 90_000;
const STALL_MS = 20_000;

interface Outcome {
  format: string;
  difficulty: string;
  ended: boolean;
  turns: number;
  ms: number;
  refusals: string[];
  exceptions: string[];
  gimmicks: Record<string, number>;
  stalled: boolean;
  /** Impossible things the drawn view got into (NaN, HP outside its range, a log line saying undefined), each kind once. */
  invariants: string[];
}

function play(format: BattleFormat, difficulty: "easy" | "normal", seed: number): Promise<Outcome> {
  const rnd = mulberry(seed);
  const out: Outcome = { format: format.key, difficulty, ended: false, turns: 0, ms: 0, refusals: [], exceptions: [], gimmicks: {}, stalled: false, invariants: [] };
  const view = createView();
  const started = Date.now();
  let teams: { player: never[]; cpu: never[] } | undefined;
  if (format.custom) {
    const all = recommendedFor(format.key);
    const mine = all[Math.floor(rnd() * all.length)];
    const theirs = cpuTeamFor(format.key, mine.id, rnd)!;
    teams = { player: mine.sets as never[], cpu: theirs.sets as never[] };
  }
  return new Promise((resolve) => {
    let finished = false;
    let last = Date.now();
    const finish = (stalled = false) => {
      if (finished) return;
      finished = true;
      clearInterval(watch);
      out.stalled = stalled;
      out.ms = Date.now() - started;
      out.turns = view.turn;
      out.ended = view.winner !== null;
      try {
        battle.destroy();
      } catch {
        /* already closed */
      }
      resolve(out);
    };
    const battle = startLocalBattle({ format, difficulty, playerName: "Soak", turnLimit: Number(process.env.SOAK_TURN_LIMIT || 0), teams }, (message: BattleMessage) => {
      last = Date.now();
      try {
        if (message.error) {
          out.refusals.push(message.error);
          battle.choose("default");
          return;
        }
        for (const line of message.lines) {
          try {
            applyLine(view, line, "p1", battle.lookups);
          } catch (error) {
            throw new Error(`${error instanceof Error ? error.message : error} on line: ${line}`);
          }
        }
        for (const problem of viewProblems(view)) if (!out.invariants.includes(problem) && out.invariants.length < 5) out.invariants.push(problem);
        if (view.winner !== null) return finish();
        const request = message.request;
        if (!request || request.wait) return;
        syncRequest(view, "p1", request, battle.lookups);
        battle.choose(chooseFor(request, rnd, out.gimmicks));
      } catch (error) {
        out.exceptions.push(error instanceof Error ? `${error.message} @ ${(error.stack ?? "").split(NL).slice(1, 5).map((l) => l.trim()).join(" <- ")}` : String(error));
        finish();
      }
    });
    const watch = setInterval(() => {
      if (Date.now() - started > MAX_MS) finish(true);
      else if (Date.now() - last > STALL_MS) finish(true);
    }, 500);
  });
}

const formats = FORMATS.filter((f) => !ONLY || ONLY.includes(f.key));
const report: Outcome[] = [];

for (const format of formats) {
  test(`${format.label}: ${N} full battles against the CPU, using every option the screen offers`, { timeout: (MAX_MS + 5000) * N }, async () => {
    const outcomes: Outcome[] = [];
    for (let i = 0; i < N; i++) outcomes.push(await play(format, i % 2 === 0 ? "normal" : "easy", 1000 + i * 7 + format.key.length));
    report.push(...outcomes);
    const problems = outcomes.flatMap((o) => [
      ...(o.ended ? [] : [`did not end (${o.stalled ? "stalled" : "?"} after ${o.turns} turns, ${(o.ms / 1000).toFixed(0)} s)`]),
      ...o.refusals.map((r) => `the simulator refused an offered choice: ${r}`),
      ...o.exceptions.map((e) => `exception: ${e}`),
      ...o.invariants.map((p) => `the view went wrong: ${p}`),
    ]);
    const avg = Math.round(outcomes.reduce((s, o) => s + o.turns, 0) / outcomes.length);
    const gimmicks = outcomes.reduce<Record<string, number>>((acc, o) => ({ ...acc, ...Object.fromEntries(Object.entries(o.gimmicks).map(([k, v]) => [k, (acc[k] ?? 0) + v])) }), {});
    console.log(`${format.key.padEnd(14)} ${outcomes.filter((o) => o.ended).length}/${N} ended, avg ${avg} turns, ${(outcomes.reduce((s, o) => s + o.ms, 0) / 1000).toFixed(1)} s, gimmicks ${JSON.stringify(gimmicks)}${problems.length ? ` PROBLEMS: ${problems.slice(0, 3).join(" | ")}` : ""}`);
    assert.deepEqual(problems, []);
  });
}
