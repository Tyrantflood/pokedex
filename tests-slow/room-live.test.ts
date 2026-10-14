import assert from "node:assert/strict";
import { test } from "node:test";
import { parseRequest, type ParsedRequest } from "../lib/battle/protocol";
import { newRoomCode, type ClientMessage, type ServerMessage } from "../lib/battle/room-protocol";

// A real room server over real WebSockets: run `npm run dev` in party/ (workerd, port 8787) and then
//   BATTLE_HOST=localhost:8787 npm run test:room-live
// or point BATTLE_HOST at the deployed Worker (pokedex-battle.<account>.workers.dev). Without BATTLE_HOST every test here is skipped.
// BATTLE_SLOW=1 adds the 60-second forfeit test (a real minute; locally the server can be started with FORFEIT_AFTER_MS to shorten it).

const HOST = process.env.BATTLE_HOST;
const secure = !!HOST && !/^(localhost|127\.|\[::1\])/.test(HOST);
const options = { skip: HOST ? false : "set BATTLE_HOST to run against a live room server" };

class Client {
  readonly messages: ServerMessage[] = [];
  private socket!: WebSocket;
  private waiters: (() => void)[] = [];
  closed = false;
  readonly clientId: string;
  readonly code: string;
  request: ParsedRequest | null = null;

  constructor(code: string, clientId: string) {
    this.code = code;
    this.clientId = clientId;
  }

  connect(): Promise<void> {
    this.closed = false;
    this.socket = new WebSocket(`${secure ? "wss" : "ws"}://${HOST}/parties/battle-room/${this.code}`);
    this.socket.onmessage = (event) => {
      const message = JSON.parse(String(event.data)) as ServerMessage;
      this.messages.push(message);
      if (message.type === "battle" && message.request) {
        const parsed = parseRequest(message.request);
        this.request = parsed.wait ? null : parsed;
      }
      this.waiters.splice(0).forEach((w) => w());
    };
    this.socket.onclose = () => {
      this.closed = true;
      this.waiters.splice(0).forEach((w) => w());
    };
    return new Promise((resolve, reject) => {
      this.socket.onopen = () => resolve();
      this.socket.onerror = () => reject(new Error(`could not connect to ${HOST}`));
    });
  }

  send(message: ClientMessage) {
    this.socket.send(JSON.stringify(message));
  }

  hello(name: string, config?: { formatKey: string; turnLimit: number }) {
    this.send({ type: "hello", clientId: this.clientId, name, config });
  }

  drop() {
    this.socket.close();
  }

  /** Resolves when `predicate` holds, checking after every message (or throws after `ms`). */
  async until(predicate: () => boolean, ms = 15000, what = "a condition") {
    const deadline = Date.now() + ms;
    while (!predicate()) {
      if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
      await new Promise<void>((resolve) => {
        this.waiters.push(resolve);
        setTimeout(resolve, 200);
      });
    }
  }

  of<T extends ServerMessage["type"]>(type: T) {
    return this.messages.filter((m): m is Extract<ServerMessage, { type: T }> => m.type === type);
  }

  lines() {
    return this.of("battle").flatMap((m) => m.lines);
  }

  get over() {
    return this.lines().some((l) => l.startsWith("|win|") || l === "|tie");
  }
}

let rotation = 0;
function answer(request: ParsedRequest): string {
  if (request.forceSwitch || !request.active) {
    const slot = request.team.findIndex((p) => !p.active && (request.reviving ? p.fainted : !p.fainted));
    return slot >= 0 ? `switch ${slot + 1}` : "default";
  }
  const usable = request.active.moves.map((m, i) => (!m.disabled && m.pp !== 0 ? i + 1 : 0)).filter(Boolean);
  return `move ${usable.length ? usable[rotation++ % usable.length] : 1}`;
}

/** Both players answer whatever they are asked until the battle is over. */
async function playOut(a: Client, b: Client, rounds = 400) {
  for (let i = 0; i < rounds && !(a.over && b.over); i++) {
    let acted = false;
    for (const c of [a, b]) {
      const request = c.request;
      if (!request) continue;
      c.request = null;
      c.send({ type: "choose", choice: answer(request), rqid: request.rqid });
      acted = true;
    }
    if (!acted) await a.until(() => !!a.request || !!b.request || (a.over && b.over), 10000, "someone to be asked");
    else await new Promise((r) => setTimeout(r, 15));
  }
}

const config = { formatKey: "gen9", turnLimit: 30 };

test("two players meet in a room, play a battle to its end, and are told the same result", options, async () => {
  const code = newRoomCode();
  const a = new Client(code, "live-client-aaaa");
  const b = new Client(code, "live-client-bbbb");
  await a.connect();
  a.hello("Prince", config);
  await a.until(() => a.of("welcome").length > 0 && a.of("status").length > 0, 10000, "the creator's welcome");
  assert.equal(a.of("welcome")[0].side, "p1");
  assert.equal(a.of("status").at(-1)?.phase, "waiting");
  await b.connect();
  b.hello("Friend");
  await b.until(() => b.of("welcome").length > 0, 10000, "the friend's welcome");
  assert.equal(b.of("welcome")[0].side, "p2");
  await a.until(() => !!a.request && !!b.request, 15000, "both players being asked for a first move");
  await playOut(a, b);
  await a.until(() => a.over && b.over, 15000, "the result");
  const result = (c: Client) => c.lines().find((l) => l.startsWith("|win|") || l === "|tie");
  assert.equal(result(a), result(b));
  assert.equal(a.of("status").at(-1)?.phase, "ended");
  a.drop();
  b.drop();
});

test("a stranger can't conjure a room, and a third player is turned away", options, async () => {
  const stranger = new Client(newRoomCode(), "live-client-nosy");
  await stranger.connect();
  stranger.hello("Nosy"); // no config: following a made-up link
  await stranger.until(() => stranger.of("error").length > 0, 10000, "an error");
  assert.equal(stranger.of("error")[0].code, "not-found");

  const code = newRoomCode();
  const [a, b, c] = [new Client(code, "live-client-aaaa"), new Client(code, "live-client-bbbb"), new Client(code, "live-client-cccc")];
  await a.connect();
  a.hello("One", config);
  await b.connect();
  b.hello("Two");
  await a.until(() => !!a.request && !!b.request, 15000, "the battle starting");
  await c.connect();
  c.hello("Three");
  await c.until(() => c.of("error").length > 0, 10000, "the third player's refusal");
  assert.equal(c.of("error")[0].code, "full");
  assert.equal(c.lines().length, 0, "nothing of the battle reached the third player");
  for (const x of [a, b]) x.drop();

  const bad = await new Promise<number>((resolve) => {
    const ws = new WebSocket(`${secure ? "wss" : "ws"}://${HOST}/parties/battle-room/NOT-A-VALID-CODE`);
    ws.onerror = () => resolve(0);
    ws.onclose = () => resolve(1);
    ws.onopen = () => resolve(2);
  });
  assert.notEqual(bad, 2, "a malformed room code never opens a socket");
});

test("a refresh gets the seat back, with everything the player had seen, and play goes on", options, async () => {
  const code = newRoomCode();
  const a = new Client(code, "live-client-aaaa");
  const b = new Client(code, "live-client-bbbb");
  await a.connect();
  a.hello("Prince", config);
  await b.connect();
  b.hello("Friend");
  await a.until(() => !!a.request && !!b.request, 15000, "the battle starting");
  for (let i = 0; i < 3; i++) {
    for (const c of [a, b]) {
      const r = c.request;
      if (r) {
        c.request = null;
        c.send({ type: "choose", choice: answer(r), rqid: r.rqid });
      }
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  await a.until(() => !!a.request, 10000, "a question for the first player");
  const seen = a.lines();
  const pending = a.request!;
  a.drop(); // the server is told when the socket goes, whether or not this side waits for the closing handshake
  await b.until(() => b.of("status").at(-1)?.players.some((p) => p.side === "p1" && !p.connected) === true, 10000, "the friend noticing they left");
  const countdown = b.of("status").at(-1)!.players.find((p) => p.side === "p1")!.forfeitInMs!;
  assert.ok(countdown > 0 && countdown <= 60_000, `a countdown is shown: ${countdown} ms`);

  const again = new Client(code, "live-client-aaaa");
  await again.connect();
  again.hello("Prince");
  await again.until(() => again.of("battle").length > 0, 10000, "the catch-up");
  const sync = again.of("battle")[0];
  assert.equal(sync.instant, true);
  assert.deepEqual(sync.lines, seen, "the same log as before the refresh");
  assert.equal(parseRequest(sync.request).rqid, pending.rqid, "and the same question");
  await b.until(() => b.of("status").at(-1)?.players.every((p) => p.connected) === true, 10000, "the friend seeing them return");
  await playOut(again, b);
  await again.until(() => again.over && b.over, 20000, "the result");
  again.drop();
  b.drop();
});

test("a player who stays away for a minute forfeits (set BATTLE_SLOW=1; takes a real minute)", { skip: HOST && process.env.BATTLE_SLOW ? false : "set BATTLE_HOST and BATTLE_SLOW=1" }, async () => {
  const code = newRoomCode();
  const a = new Client(code, "live-client-aaaa");
  const b = new Client(code, "live-client-bbbb");
  await a.connect();
  a.hello("Stayer", config);
  await b.connect();
  b.hello("Leaver");
  await a.until(() => !!a.request && !!b.request, 15000, "the battle starting");
  b.drop();
  const started = Date.now();
  await a.until(() => a.over, 75_000, "the forfeit");
  const waited = Date.now() - started;
  assert.ok(a.lines().includes("|win|Stayer"), "the player who stayed wins");
  assert.ok(waited >= 55_000 && waited <= 70_000, `forfeited after ${(waited / 1000).toFixed(1)} s`);
  a.drop();
});
