import assert from "node:assert/strict";
import { test } from "node:test";
import { parseRequest, type ParsedRequest } from "../lib/battle/protocol";
import { recommendedFor } from "../lib/battle/recommended";
import { packSets } from "../lib/battle/team-check";
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
  if (request.teamPreview) return `team ${1 + (rotation++ % request.team.length)}`;
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

test("a bring-your-own-team room: the server checks each team, starts when both are in, and the battle plays out", options, async () => {
  const code = newRoomCode();
  const a = new Client(code, "live-client-cccc");
  const b = new Client(code, "live-client-dddd");
  const teams = recommendedFor("team-gen8ou");
  await a.connect();
  a.hello("Prince", { formatKey: "team-gen8ou", turnLimit: 30 });
  await a.until(() => a.of("welcome").length > 0, 10000, "the creator's welcome");
  // An illegal team (an Uber in OU) is refused with a reason; the same Worker then accepts a legal one.
  const uber = [{ ...teams[0].sets[0], species: "Zacian", name: "Zacian", ability: "Intrepid Sword", item: "Rusted Sword", moves: ["Behemoth Blade"] }];
  a.send({ type: "team", packed: packSets(uber) });
  await a.until(() => a.of("team-result").length === 1, 10000, "the verdict on the illegal team");
  assert.equal(a.of("team-result")[0].ok, false);
  assert.ok(a.of("team-result")[0].errors.some((e) => /Zacian/.test(e)));
  a.send({ type: "team", packed: packSets(teams[0].sets) });
  await a.until(() => a.of("team-result").length === 2, 10000, "the verdict on the legal team");
  assert.equal(a.of("team-result")[1].ok, true);
  await b.connect();
  b.hello("Friend");
  await b.until(() => b.of("status").at(-1)?.phase === "teams", 10000, "the teams phase");
  assert.equal(b.of("status").at(-1)?.players.find((p) => p.side === "p1")?.ready, true);
  b.send({ type: "team", packed: packSets(teams[1].sets) });
  await a.until(() => !!a.request && !!b.request, 20000, "both players being asked for a first move");
  assert.deepEqual(a.request!.team.map((m) => m.species), teams[0].sets.map((s) => s.species));
  await playOut(a, b);
  await a.until(() => a.over && b.over, 15000, "the result");
  assert.equal(a.of("status").at(-1)?.phase, "ended");
  a.drop();
  b.drop();
});

test("Team Preview and rematch on the live server: both see both teams and choose leads, then a rematch in the same room starts a new battle", options, async () => {
  const code = newRoomCode();
  const a = new Client(code, "live-client-eeee");
  const b = new Client(code, "live-client-ffff");
  const teams = recommendedFor("team-gen8ou");
  await a.connect();
  a.hello("Prince", { formatKey: "team-gen8ou", turnLimit: 30 });
  await a.until(() => a.of("welcome").length > 0, 10000, "the creator's welcome");
  a.send({ type: "team", packed: packSets(teams[0].sets) });
  await b.connect();
  b.hello("Friend");
  await b.until(() => b.of("status").at(-1)?.phase === "teams", 10000, "the teams phase");
  b.send({ type: "team", packed: packSets(teams[1].sets) });
  await a.until(() => !!a.request && !!b.request, 20000, "both players being asked for a lead");
  assert.equal(a.request!.teamPreview, true, "Team Preview is on");
  assert.equal(a.lines().filter((l) => l.startsWith("|poke|")).length, 12, "all twelve Pokemon are on show");
  a.send({ type: "choose", choice: "team 3", rqid: a.request!.rqid });
  b.send({ type: "choose", choice: "team 2", rqid: b.request!.rqid });
  await a.until(() => a.lines().filter((l) => l.startsWith("|switch|")).length === 2, 15000, "both leads out");
  assert.ok(a.lines().find((l) => l.startsWith("|switch|p1a"))!.includes(teams[0].sets[2].species), "the chosen lead went out first");
  // End it, then agree to a rematch.
  a.send({ type: "forfeit" });
  await a.until(() => a.over && b.over, 15000, "the result");
  a.send({ type: "rematch" });
  await b.until(() => b.of("status").at(-1)?.players.some((p) => p.rematch) === true, 10000, "the friend to see the request");
  assert.equal(b.of("status").at(-1)?.phase, "ended", "one is not enough");
  a.request = null;
  b.request = null;
  b.send({ type: "rematch" });
  await b.until(() => b.of("status").at(-1)?.phase === "teams", 15000, "the room to go back to choosing teams");
  b.send({ type: "team", packed: packSets(teams[2].sets) });
  a.send({ type: "team", packed: packSets(teams[3].sets) });
  await a.until(() => !!a.request && a.request.teamPreview && !!b.request, 20000, "the second battle's Team Preview");
  assert.deepEqual(a.request!.team.map((m) => m.species), teams[3].sets.map((s) => s.species), "the new team is the one in the new battle");
  a.drop();
  b.drop();
});

test("the turn timer: after 90 seconds a random legal choice is made for a player who has not chosen (set BATTLE_SLOW=1; takes a real minute and a half)", { skip: HOST && process.env.BATTLE_SLOW ? false : "set BATTLE_HOST and BATTLE_SLOW=1" }, async () => {
  const code = newRoomCode();
  const a = new Client(code, "live-client-gggg");
  const b = new Client(code, "live-client-hhhh");
  await a.connect();
  a.hello("Prince", { formatKey: "gen9", turnLimit: 30 });
  await a.until(() => a.of("welcome").length > 0, 10000, "the creator's welcome");
  await b.connect();
  b.hello("Friend");
  await a.until(() => !!a.request && !!b.request, 20000, "both players being asked for a first move");
  const clock = a.of("status").at(-1)!.players.find((p) => p.side === "p1")!.turnInMs;
  assert.ok(clock !== null && clock > 85_000 && clock <= 90_000, `the clock starts at about 90 s (${clock})`);
  // a answers, b does not.
  a.send({ type: "choose", choice: answer(a.request!), rqid: a.request!.rqid });
  const started = Date.now();
  await a.until(() => a.of("timeout").length > 0 && b.of("timeout").length > 0, 110_000, "the timeout notice");
  const waited = (Date.now() - started) / 1000;
  assert.ok(waited > 60 && waited < 100, `it fired after about 90 s, not ${waited.toFixed(0)}`);
  assert.deepEqual(a.of("timeout")[0], { type: "timeout", side: "p2", name: "Friend" });
  await a.until(() => a.lines().some((l) => l.startsWith("|turn|2")), 15000, "the turn to be played with the random choice");
  assert.ok(a.lines().some((l) => l.includes("ran out of time")));
  a.drop();
  b.drop();
});

test("a battle goes on correctly when the room sits idle between turns long enough to be evicted and rebuilt (set BATTLE_SLOW=1; about 80 s)", { skip: HOST && process.env.BATTLE_SLOW ? false : "set BATTLE_HOST and BATTLE_SLOW=1" }, async () => {
  const code = newRoomCode();
  const a = new Client(code, "live-client-iiii");
  const b = new Client(code, "live-client-jjjj");
  await a.connect();
  a.hello("Prince", { formatKey: "gen9", turnLimit: 0 });
  await a.until(() => a.of("welcome").length > 0, 10000, "the creator's welcome");
  await b.connect();
  b.hello("Friend");
  for (let turn = 1; turn <= 3; turn++) {
    await a.until(() => !!a.request && !!b.request, 30000, `both being asked on turn ${turn}`);
    // Nobody says anything for 25 s: the Durable Object is evicted from memory (hibernation) and rebuilt by replay on the next message.
    await new Promise((r) => setTimeout(r, 25_000));
    for (const c of [a, b]) {
      const request = c.request!;
      c.request = null;
      c.send({ type: "choose", choice: answer(request), rqid: request.rqid });
    }
    // A faint in the turn asks one side for a switch before the next turn can start: answer whatever is asked, at once, until it does.
    const deadline = Date.now() + 30000;
    while (!a.lines().some((l) => l.startsWith(`|turn|${turn + 1}`)) && !a.over) {
      if (Date.now() > deadline) {
        const tail = (c: Client) => c.messages.slice(-5).map((m) => (m.type === "battle" ? `battle(lines ${m.lines.length}, request ${m.request ? "yes" : "no"}, error ${m.error ?? "none"})` : m.type === "status" ? `status(${m.phase})` : m.type)).join(", ");
        throw new Error(`timed out waiting for turn ${turn + 1} to start. A saw: ${tail(a)}. B saw: ${tail(b)}. A request ${JSON.stringify(a.request && { rqid: a.request.rqid, forceSwitch: a.request.forceSwitch })}, B request ${JSON.stringify(b.request && { rqid: b.request.rqid, forceSwitch: b.request.forceSwitch })}`);
      }
      for (const c of [a, b]) {
        const request = c.request;
        if (!request || (!request.forceSwitch && request.active && c.lines().filter((l) => l.startsWith("|turn|")).length > turn)) continue;
        if (!request.forceSwitch && request.active) continue; // an ordinary question belongs to the next turn
        c.request = null;
        c.send({ type: "choose", choice: answer(request), rqid: request.rqid });
      }
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  assert.ok(!a.of("battle").some((m) => m.error) && !b.of("battle").some((m) => m.error), "no choice was refused after the idle gaps");
  assert.equal(a.lines().filter((l) => l.startsWith("|turn|")).length >= 3, true);
  a.drop();
  b.drop();
});
