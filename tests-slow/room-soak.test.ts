import assert from "node:assert/strict";
import { test } from "node:test";
import { FORMATS } from "../lib/battle/formats";
import { parseRequest, type ParsedRequest } from "../lib/battle/protocol";
import { recommendedFor } from "../lib/battle/recommended";
import { newRoomCode, type ClientMessage, type ServerMessage } from "../lib/battle/room-protocol";
import { packSets } from "../lib/battle/team-check";
import { chooseFor, mulberry } from "./policy";

// Slow: a full friend battle in every format against a real room server. `BATTLE_HOST=<host> npm run test:room-soak` (the deployed Worker or a local
// `npm run room:dev`). ROOM_SOAK_FORMATS limits it to some keys. Two players per room choose like the screen would (leads, switches, gimmick toggles); the
// test fails on any refused choice, any server error, a disagreement about the result, a stall, or a battle that does not end.

const HOST = process.env.BATTLE_HOST;
const secure = !!HOST && !/^(localhost|127\.|\[::1\])/.test(HOST);
const ONLY = process.env.ROOM_SOAK_FORMATS?.split(",");
const options = { skip: HOST ? false : "set BATTLE_HOST to run against a live room server", timeout: 15 * 60_000 };

class Player {
  readonly messages: ServerMessage[] = [];
  request: ParsedRequest | null = null;
  refusals: string[] = [];
  errors: string[] = [];
  gimmicks: Record<string, number> = {};
  private socket!: WebSocket;
  private readonly rnd: () => number;
  lastActivity = Date.now();
  over = false;
  result = "";

  readonly code: string;
  readonly clientId: string;
  readonly name: string;

  constructor(code: string, clientId: string, name: string, seed: number) {
    this.code = code;
    this.clientId = clientId;
    this.name = name;
    this.rnd = mulberry(seed);
  }

  connect() {
    this.socket = new WebSocket(`${secure ? "wss" : "ws"}://${HOST}/parties/battle-room/${this.code}`);
    this.socket.onmessage = (event) => this.handle(JSON.parse(String(event.data)) as ServerMessage);
    return new Promise<void>((resolve, reject) => {
      this.socket.onopen = () => resolve();
      this.socket.onerror = () => reject(new Error(`could not connect to ${HOST}`));
    });
  }

  send(message: ClientMessage) {
    this.socket.send(JSON.stringify(message));
  }

  private handle(message: ServerMessage) {
    this.lastActivity = Date.now();
    this.messages.push(message);
    if (message.type === "error") this.errors.push(`${message.code}: ${message.message}`);
    if (message.type !== "battle") return;
    if (message.error) this.refusals.push(message.error);
    for (const line of message.lines) {
      if (line.startsWith("|win|")) {
        this.over = true;
        this.result = line;
      } else if (line === "|tie") {
        this.over = true;
        this.result = "|tie";
      }
    }
    if (message.request && !this.over) {
      const request = parseRequest(message.request);
      if (request.wait) return;
      this.request = request;
      // answered at once, like a quick player; the server numbers the request
      const choice = chooseFor(request, this.rnd, this.gimmicks);
      this.send({ type: "choose", choice, rqid: request.rqid });
    }
  }

  close() {
    this.socket?.close();
  }
}

const formats = FORMATS.filter((f) => !ONLY || ONLY.includes(f.key));

async function room(formatKey: string, index: number) {
  const format = FORMATS.find((f) => f.key === formatKey)!;
  const code = newRoomCode();
  const a = new Player(code, `soak-${index}-aaaaaaaa`, "Prince", index * 2 + 1);
  const b = new Player(code, `soak-${index}-bbbbbbbb`, "Friend", index * 2 + 2);
  await a.connect();
  a.send({ type: "hello", clientId: a.clientId, name: a.name, config: { formatKey, turnLimit: 0 } });
  await b.connect();
  b.send({ type: "hello", clientId: b.clientId, name: b.name });
  if (format.custom) {
    const teams = recommendedFor(formatKey);
    a.send({ type: "team", packed: packSets(teams[index % teams.length].sets) });
    b.send({ type: "team", packed: packSets(teams[(index + 1) % teams.length].sets) });
  }
  const started = Date.now();
  while (!(a.over && b.over)) {
    await new Promise((r) => setTimeout(r, 250));
    if (Date.now() - started > 240_000) break;
    if (Date.now() - Math.max(a.lastActivity, b.lastActivity) > 30_000) break; // nothing for 30 s: stalled
  }
  const problems: string[] = [];
  if (!(a.over && b.over)) problems.push(`did not end (a ${a.over}, b ${b.over}) after ${Math.round((Date.now() - started) / 1000)} s`);
  if (a.result !== b.result) problems.push(`the players disagree about the result: "${a.result}" / "${b.result}"`);
  for (const p of [a, b]) {
    problems.push(...p.refusals.map((r) => `${p.name}: refused an offered choice: ${r}`));
    problems.push(...p.errors.map((e) => `${p.name}: server error ${e}`));
  }
  const turns = a.messages.flatMap((m) => (m.type === "battle" ? m.lines : [])).filter((l) => l.startsWith("|turn|")).length;
  const gimmicks = { ...a.gimmicks };
  for (const [k, v] of Object.entries(b.gimmicks)) gimmicks[k] = (gimmicks[k] ?? 0) + v;
  a.close();
  b.close();
  return { problems, turns, ms: Date.now() - started, gimmicks, result: a.result };
}

test("a full friend battle in every format against a real room server", options, async () => {
  const outcomes = await Promise.all(formats.map(async (f, i) => ({ key: f.key, ...(await room(f.key, i)) })));
  for (const o of outcomes) console.log(`${o.key.padEnd(14)} ${o.problems.length ? "PROBLEMS" : "ok"} ${o.turns} turns, ${(o.ms / 1000).toFixed(1)} s, ${o.result.slice(0, 30)}, gimmicks ${JSON.stringify(o.gimmicks)}${o.problems.length ? ` :: ${o.problems.slice(0, 3).join(" | ")}` : ""}`);
  assert.deepEqual(outcomes.flatMap((o) => o.problems.map((p) => `${o.key}: ${p}`)), []);
});
