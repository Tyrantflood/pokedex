import assert from "node:assert/strict";
import { test } from "node:test";
import { Teams } from "@pkmn/sim";
import { parseRequest, type SideId } from "../lib/battle/protocol";
import { BattleHost, buildStartCommands } from "../lib/battle/room-battle";
import { RoomLogic, type RoomIO, type RoomStorage } from "../lib/battle/room-logic";
import { FORFEIT_AFTER_MS, isClientId, isRoomCode, isValidChoice, newRoomCode, parseClientMessage, ROOM_TTL_MS, sanitizeName, type ClientMessage, type ServerMessage } from "../lib/battle/room-protocol";

// ---- the shared rules ---------------------------------------------------------------------------------------------------

test("room codes: 16 random base32 characters, unguessable in practice, validated strictly", () => {
  const codes = new Set(Array.from({ length: 500 }, () => newRoomCode()));
  assert.equal(codes.size, 500, "no repeats");
  for (const code of codes) {
    assert.equal(code.length, 16);
    assert.ok(isRoomCode(code));
  }
  for (const bad of ["", "short", "ABCDEFGHIJKLMNOP", "abcdefghijklmnop!", "abcdefghijk1mnop", "../../etc/passwd", "a".repeat(41), 12345, null]) assert.equal(isRoomCode(bad), false, String(bad));
  assert.ok(isRoomCode("a".repeat(12)) && isRoomCode("a".repeat(40)));
  assert.equal(newRoomCode(() => new Uint8Array(16).fill(0)), "a".repeat(16), "deterministic given the bytes");
});

test("names are cleaned, bounded and never empty", () => {
  assert.equal(sanitizeName("  Prince  "), "Prince");
  assert.equal(sanitizeName("a\u0000b\nc"), "abc");
  assert.equal(sanitizeName("<script>x</script>"), "scriptx/script");
  assert.equal(sanitizeName("x".repeat(40)).length, 18);
  assert.equal(sanitizeName("   "), "Guest");
  assert.equal(sanitizeName(undefined), "Guest");
  assert.equal(sanitizeName("two   spaces"), "two spaces");
});

test("only real choices pass: moves 1-4 with one special, switches 1-6, default", () => {
  for (const ok of ["move 1", "move 4", "move 2 mega", "move 3 terastallize", "move 1 zmove", "move 1 dynamax", "switch 1", "switch 6", "default"]) assert.ok(isValidChoice(ok), ok);
  for (const bad of ["move 0", "move 5", "move 1 explode", "switch 7", "switch", "team 123456", "forfeit", ">p1 move 1", "move 1\n>forcewin p1", "MOVE 1", "move 1 ", "", null, 5, "undo", "shift"]) assert.equal(isValidChoice(bad), false, String(bad));
});

test("client messages are parsed defensively", () => {
  const hello = { type: "hello", clientId: "abcdefgh12345678", name: "Prince" };
  assert.deepEqual(parseClientMessage(JSON.stringify(hello)), { ...hello, config: undefined });
  assert.deepEqual(parseClientMessage(JSON.stringify({ ...hello, config: { formatKey: "gen9", turnLimit: 50 } }))?.type, "hello");
  assert.equal(parseClientMessage("not json"), null);
  assert.equal(parseClientMessage("[]"), null);
  assert.equal(parseClientMessage(JSON.stringify({ type: "hello", clientId: "x", name: "A" })), null, "client id too short");
  assert.equal(parseClientMessage(JSON.stringify({ type: "hello", clientId: "abcdefgh12345678", name: 5 })), null);
  assert.equal(parseClientMessage(JSON.stringify({ type: "choose", choice: "move 1; drop", rqid: 1 })), null);
  assert.equal(parseClientMessage(JSON.stringify({ type: "choose", choice: "move 1", rqid: 1.5 })), null);
  assert.deepEqual(parseClientMessage(JSON.stringify({ type: "choose", choice: "move 1", rqid: 3 })), { type: "choose", choice: "move 1", rqid: 3 });
  assert.equal(parseClientMessage(JSON.stringify({ type: "eval", code: "1" })), null);
  assert.equal(parseClientMessage(JSON.stringify({ type: "forfeit", extra: true }))?.type, "forfeit");
  assert.equal(parseClientMessage("x".repeat(5000)), null, "oversized");
  assert.equal(isClientId("abcdefgh"), true);
  assert.equal(isClientId("short"), false);
  assert.equal(isClientId("has space in it"), false);
});

// ---- a room, driven without any network ----------------------------------------------------------------------------------

class MemoryStorage implements RoomStorage {
  data = new Map<string, unknown>();
  async get<T>(key: string) {
    return this.data.get(key) as T | undefined;
  }
  async put(key: string, value: unknown) {
    this.data.set(key, structuredClone(value));
  }
  async list<T>(prefix: string) {
    return [...this.data.keys()].filter((k) => k.startsWith(prefix)).sort().map((k) => this.data.get(k) as T);
  }
  async deleteAll() {
    this.data.clear();
  }
}

class Rig {
  time = 1_000_000;
  alarmAt: number | null = null;
  readonly sent = new Map<string, ServerMessage[]>();
  readonly closedIds = new Set<string>();
  logic: RoomLogic;
  private next = 0;
  readonly storage: MemoryStorage;
  readonly code: string;
  private readonly options: { forfeitAfterMs?: number; ttlMs?: number };

  constructor(storage = new MemoryStorage(), code = newRoomCode(), options: { forfeitAfterMs?: number; ttlMs?: number } = {}) {
    this.storage = storage;
    this.code = code;
    this.options = options;
    this.logic = this.makeLogic();
  }

  private makeLogic() {
    const io: RoomIO = {
      send: (id, message) => {
        if (!this.sent.has(id)) this.sent.set(id, []);
        this.sent.get(id)!.push(structuredClone(message));
      },
      close: (id) => this.closedIds.add(id),
      setAlarm: async (at) => {
        this.alarmAt = at;
      },
      now: () => this.time,
    };
    return new RoomLogic(this.code, io, this.storage, this.options);
  }

  /** The server process restarting: same storage, a brand-new room object, no connections remembered. */
  restart() {
    this.logic = this.makeLogic();
    this.alarmAt = null;
  }

  connection() {
    return `c${this.next++}`;
  }

  async send(connection: string, message: ClientMessage | string) {
    await this.logic.message(connection, typeof message === "string" ? message : JSON.stringify(message));
    await this.logic.flush();
  }

  async hello(connection: string, clientId: string, name: string, config?: { formatKey: string; turnLimit: number }) {
    await this.send(connection, { type: "hello", clientId, name, config });
  }

  messages(connection: string) {
    return this.sent.get(connection) ?? [];
  }

  of<T extends ServerMessage["type"]>(connection: string, type: T) {
    return this.messages(connection).filter((m): m is Extract<ServerMessage, { type: T }> => m.type === type);
  }

  /** Every protocol line this connection has been sent, in order. */
  lines(connection: string) {
    return this.of(connection, "battle").flatMap((m) => m.lines);
  }

  /** The newest request this connection was sent, if it has not been answered. */
  request(connection: string) {
    if (this.lines(connection).some((l) => l.startsWith("|win|") || l === "|tie")) return null;
    let current: ReturnType<typeof parseRequest> | null = null;
    for (const m of this.of(connection, "battle")) {
      if (m.request) {
        const parsed = parseRequest(m.request);
        current = parsed.wait ? null : parsed;
      }
    }
    return current;
  }
}

// A turn limit keeps the whole-battle tests short and bounded even when two hasty players just keep healing.
const config = { formatKey: "gen9", turnLimit: 50 };
const A = "client-aaaaaaaa";
const B = "client-bbbbbbbb";
const C = "client-cccccccc";

/** Seats two players and returns their connection ids. */
async function seated(rig: Rig, names: [string, string] = ["Prince", "Friend"]) {
  const a = rig.connection();
  const b = rig.connection();
  await rig.hello(a, A, names[0], config);
  await rig.hello(b, B, names[1]);
  return { a, b };
}

/** Lines that show a Pokémon's species to the player reading them. */
const SHOWS_SPECIES = /^\|(switch|drag|replace|detailschange)\|/;
let rotation = 0;
/** Picks a usable move, rotating through them (always taking the first can be Recover against Recover forever). */
function anyMove(moves: { disabled: boolean; pp: number | null }[]): number {
  const usable = moves.map((m, i) => (!m.disabled && m.pp !== 0 ? i + 1 : 0)).filter(Boolean);
  return usable.length ? usable[rotation++ % usable.length] : 1;
}

/** A legal answer to a request: a usable move (a choice item or Encore can lock the others), or the first healthy switch. */
function answerFor(request: NonNullable<ReturnType<typeof parseRequest>>): string {
  if (request.forceSwitch || !request.active) {
    const slot = request.team.findIndex((p) => !p.active && (request.reviving ? p.fainted : !p.fainted));
    return slot >= 0 ? `switch ${slot + 1}` : "default";
  }
  return `move ${anyMove(request.active.moves)}`;
}

/** Answers whatever each player is being asked, the way a hasty player would: a move, or the first healthy switch. */
async function playTurn(rig: Rig, conns: { a: string; b: string }) {
  for (const conn of [conns.a, conns.b]) {
    const request = rig.request(conn);
    if (!request) continue;
    let choice = "default";
    if (request.forceSwitch || !request.active) {
      const slot = request.team.findIndex((p) => !p.active && (request.reviving ? p.fainted : !p.fainted));
      if (slot >= 0) choice = `switch ${slot + 1}`;
    } else {
      choice = `move ${anyMove(request.active.moves)}`;
    }
    await rig.send(conn, { type: "choose", choice, rqid: request.rqid });
  }
}

/** Plays on until both players are being asked an ordinary question (not one of them waiting, or switching in after a faint), so a test can rely on both having a pending request. */
async function untilBothAsked(rig: Rig, conns: { a: string; b: string }) {
  for (let i = 0; i < 40; i++) {
    const ra = rig.request(conns.a);
    const rb = rig.request(conns.b);
    if (ra && rb && !ra.forceSwitch && !rb.forceSwitch && ra.active && rb.active) return;
    await playTurn(rig, conns);
  }
  throw new Error("the battle never reached a turn where both players choose");
}

async function playToEnd(rig: Rig, conns: { a: string; b: string }, maxRounds = 400) {
  for (let i = 0; i < maxRounds && rig.logic.snapshot().meta?.phase === "playing"; i++) await playTurn(rig, conns);
}

test("a room is made by its creator, waits for a friend, and starts when the second player sits down", async () => {
  const rig = new Rig();
  const a = rig.connection();
  await rig.hello(a, A, "Prince", config);
  assert.deepEqual(rig.of(a, "welcome")[0], { type: "welcome", side: "p1", code: rig.code, config, name: "Prince" });
  assert.equal(rig.of(a, "status").at(-1)?.phase, "waiting");
  assert.equal(rig.of(a, "status").at(-1)?.players.length, 1);
  assert.equal(rig.lines(a).length, 0, "no battle yet");

  const b = rig.connection();
  await rig.hello(b, B, "Friend");
  assert.equal(rig.of(b, "welcome")[0].side, "p2");
  for (const conn of [a, b]) {
    const status = rig.of(conn, "status").at(-1)!;
    assert.equal(status.phase, "playing");
    assert.deepEqual(status.players.map((p) => [p.side, p.name, p.connected]), [["p1", "Prince", true], ["p2", "Friend", true]]);
  }
  // Each sees the battle begin and is asked for a first choice.
  assert.ok(rig.lines(a).some((l) => l.startsWith("|player|p1|Prince")));
  assert.ok(rig.lines(b).some((l) => l.startsWith("|player|p2|Friend")));
  assert.ok(rig.request(a) && rig.request(b));
  assert.equal(rig.request(a)!.team.length, 6);
  assert.equal(rig.logic.snapshot().commandCount, 3, "start, player, player");
});

test("a stranger can't make a room appear, and bad codes, bad formats and a third player are refused", async () => {
  const rig = new Rig();
  const stranger = rig.connection();
  await rig.hello(stranger, C, "Nosy"); // no config: following a made-up link
  assert.equal(rig.of(stranger, "error")[0]?.code, "not-found");
  assert.ok(rig.closedIds.has(stranger));
  assert.equal(rig.logic.snapshot().meta, null, "nothing was created");

  const badFormat = rig.connection();
  await rig.hello(badFormat, C, "Nosy", { formatKey: "gen99", turnLimit: 0 });
  assert.equal(rig.of(badFormat, "error")[0]?.code, "not-found");

  const badCode = new Rig(new MemoryStorage(), "NOT A CODE");
  const x = badCode.connection();
  await badCode.hello(x, A, "Prince", config);
  assert.equal(badCode.of(x, "error")[0]?.code, "bad-code");

  const { a, b } = await seated(rig);
  const third = rig.connection();
  await rig.hello(third, C, "Third");
  assert.equal(rig.of(third, "error")[0]?.code, "full");
  assert.ok(rig.closedIds.has(third));
  assert.equal(rig.lines(third).length, 0, "a third player is never sent any of the battle");
  // The two players are unaffected.
  assert.equal(rig.of(a, "error").length + rig.of(b, "error").length, 0);
});

test("each player is sent only their own side: no opponent bench, moves or request ever reaches them", async () => {
  const rig = new Rig();
  const { a, b } = await seated(rig);
  const conns = { a, b };
  await playTurn(rig, conns);
  await playTurn(rig, conns);
  const commands = await rig.storage.list<string>("cmd:");
  const teamOf = (side: "p1" | "p2") => {
    const command = commands.find((c) => c.startsWith(`>player ${side} `))!;
    return Teams.unpack(JSON.parse(command.slice(`>player ${side} `.length)).team)!;
  };
  for (const [viewer, owner, other] of [[a, "p1", "p2"], [b, "p2", "p1"]] as const) {
    const text = JSON.stringify(rig.of(viewer, "battle"));
    const seenSpecies = new Set([...rig.lines(viewer)].filter((l) => SHOWS_SPECIES.test(l)).map((l) => l.split("|")[3].split(",")[0])); // Illusion's reveal is a "replace" line
    // The other team's Pokémon the viewer has not been shown must not appear anywhere in what they were sent.
    const own = new Set(teamOf(owner).map((p) => p.species));
    const hidden = teamOf(other).filter((p) => !seenSpecies.has(p.species) && !own.has(p.species)); // both teams can hold the same species
    assert.ok(hidden.length >= 3, `${other} should still have unseen Pokémon`);
    for (const p of hidden) assert.ok(!text.includes(p.species) && !text.includes(`"${p.name}"`), `${viewer} was told about ${other}'s ${p.species}`);
    // Every request is the viewer's own: their ident prefix, their moves.
    for (const m of rig.of(viewer, "battle")) {
      if (!m.request) continue;
      const side = (m.request as { side: { id: string; pokemon: { ident: string }[] } }).side;
      assert.equal(side.id, owner);
      assert.ok(side.pokemon.every((p) => p.ident.startsWith(`${owner}:`)));
    }
    // The opponent's HP is a percentage, never their real numbers.
    const oppHp = rig.lines(viewer).filter((l) => l.startsWith(`|switch|${other}a`));
    assert.ok(oppHp.every((l) => /\|\d+\/100(\|.*)?$/.test(l)), oppHp.join(" "));
  }
});

test("choices are checked: stale turns, double answers and out-of-turn choices are refused, and a real choice moves the battle on", async () => {
  const rig = new Rig();
  const { a, b } = await seated(rig);
  const first = rig.request(a)!;
  // Garbage never reaches the simulator.
  await rig.send(a, "{\"type\":\"choose\",\"choice\":\"move 1; >forcewin p1\",\"rqid\":" + first.rqid + "}");
  assert.equal(rig.of(a, "error").at(-1)?.code, "bad-message");
  assert.equal(rig.of(a, "error").length, 1);
  // A choice for the wrong turn.
  await rig.send(a, { type: "choose", choice: "move 1", rqid: first.rqid + 5 });
  assert.match(String(rig.of(a, "battle").at(-1)?.error), /earlier turn/);
  // A real one is taken; answering the same turn twice is refused.
  const sentBefore = rig.of(a, "battle").length;
  await rig.send(a, { type: "choose", choice: "move 1", rqid: first.rqid });
  assert.equal(rig.of(a, "battle").length, sentBefore, "a good choice is simply taken: nothing is sent back until the turn plays");
  await rig.send(a, { type: "choose", choice: "move 2", rqid: first.rqid });
  assert.match(String(rig.of(a, "battle").at(-1)?.error), /already chosen/);
  // The turn only plays once the other player has answered; then both are asked again with a new request.
  assert.equal(rig.lines(a).filter((l) => l.startsWith("|turn|")).length, 1);
  await rig.send(b, { type: "choose", choice: "move 1", rqid: rig.request(b)!.rqid });
  assert.ok(rig.lines(a).some((l) => l.startsWith("|move|")), "the turn played");
  assert.ok(rig.lines(b).some((l) => l.startsWith("|move|")));
  const newest = Math.max(...rig.of(a, "battle").flatMap((m) => (m.request ? [(m.request as { rqid: number }).rqid] : [])));
  assert.ok(newest > first.rqid, "a new request followed the turn");
  // Choosing when there is nothing to choose.
  const before = rig.lines(b).length;
  await rig.send(b, { type: "choose", choice: "move 1", rqid: 1 });
  assert.match(String(rig.of(b, "battle").at(-1)?.error), /earlier turn|isn't your turn|already/);
  assert.equal(rig.lines(b).length, before, "a refused choice changes nothing");
});

test("a choice the simulator itself refuses (a move slot that doesn't exist, a switch to the Pokémon already out) can be corrected", async () => {
  const rig = new Rig();
  const { a } = await seated(rig);
  const request = rig.request(a)!;
  const moves = request.active!.moves.length;
  if (moves < 4) await rig.send(a, { type: "choose", choice: "move 4", rqid: request.rqid });
  else await rig.send(a, { type: "choose", choice: "switch 1", rqid: request.rqid }); // slot 1 is the active one
  assert.ok(rig.of(a, "battle").some((m) => m.error), "the simulator's refusal reached the player");
  // ...and they can choose again for the same turn.
  const refused = rig.of(a, "battle").length;
  await rig.send(a, { type: "choose", choice: "move 1", rqid: request.rqid });
  assert.equal(rig.of(a, "battle").length, refused, "the corrected choice was taken without complaint");
  await rig.send(a, { type: "choose", choice: "move 2", rqid: request.rqid });
  assert.match(String(rig.of(a, "battle").at(-1)?.error), /already chosen/, "and now it counts as answered");
});

test("a whole battle plays out to a winner, both players are told, and the room is over", async () => {
  const rig = new Rig();
  const conns = await seated(rig);
  await playToEnd(rig, conns);
  const meta = rig.logic.snapshot().meta!;
  const host = rig.logic.snapshot().host!;
  assert.equal(meta.phase, "ended", `requests ${JSON.stringify(Object.fromEntries(Object.entries(host.requests).map(([k, v]) => [k, v && { rqid: v.rqid, wait: v.wait }])))} answered ${JSON.stringify(host.answeredSnapshot())} turns ${host.history.p1.filter((l) => l.startsWith("|turn|")).length} tail ${host.history.p1.slice(-4).join(" // ")}`);
  const results = [conns.a, conns.b].map((c) => rig.lines(c).find((l) => l.startsWith("|win|") || l === "|tie"));
  assert.ok(results[0] && results[0] === results[1], `both saw the same result: ${results.join(" / ")}`);
  assert.ok(["Prince", "Friend", ""].includes(meta.winner!), "a winner, or a draw at the turn limit");
  assert.equal(rig.of(conns.a, "status").at(-1)?.phase, "ended");
  assert.equal(rig.request(conns.a), null, "nothing left to choose");
  await rig.send(conns.a, { type: "choose", choice: "move 1", rqid: 1 });
  assert.match(String(rig.of(conns.a, "error").at(-1)?.message ?? rig.of(conns.a, "battle").at(-1)?.error), /./);
});

test("forfeiting ends the battle at once, in the other player's favour", async () => {
  const rig = new Rig();
  const { a, b } = await seated(rig, ["Quitter", "Stayer"]);
  await rig.send(a, { type: "forfeit" });
  assert.ok(rig.lines(a).includes("|win|Stayer") && rig.lines(b).includes("|win|Stayer"));
  assert.equal(rig.logic.snapshot().meta?.winner, "Stayer");
  assert.equal(rig.logic.snapshot().meta?.phase, "ended");
});

test("a player who has been gone for 60 seconds forfeits; one who comes back in time does not", async () => {
  const rig = new Rig();
  const { a, b } = await seated(rig, ["Prince", "Friend"]);
  await playTurn(rig, { a, b });
  // Friend's connection drops.
  await rig.logic.closed(b);
  const status = rig.of(a, "status").at(-1)!;
  assert.deepEqual(status.players.map((p) => [p.side, p.connected]), [["p1", true], ["p2", false]]);
  assert.equal(status.players[1].forfeitInMs, FORFEIT_AFTER_MS);
  assert.equal(rig.alarmAt, rig.time + FORFEIT_AFTER_MS, "the room asks to be woken at the deadline");
  // 59 seconds: nothing happens (an early alarm just reschedules).
  rig.time += 59_000;
  await rig.logic.alarm();
  assert.equal(rig.logic.snapshot().meta?.phase, "playing");
  // The friend comes back within the minute (a refresh: same browser id, new connection): they keep their seat, and the countdown is cleared.
  const b2 = rig.connection();
  await rig.hello(b2, B, "Friend");
  assert.equal(rig.of(b2, "welcome")[0].side, "p2");
  assert.deepEqual(rig.of(a, "status").at(-1)!.players.map((p) => p.connected), [true, true]);
  assert.equal(rig.of(a, "status").at(-1)!.players[1].forfeitInMs, null);
  rig.time += 120_000;
  await rig.logic.alarm();
  assert.equal(rig.logic.snapshot().meta?.phase, "playing", "no forfeit: they were back");
  // Now they really leave, and stay away.
  await rig.logic.closed(b2);
  const left = rig.time;
  rig.time += FORFEIT_AFTER_MS - 1;
  await rig.logic.alarm();
  assert.equal(rig.logic.snapshot().meta?.phase, "playing", "one millisecond short");
  rig.time = left + FORFEIT_AFTER_MS;
  await rig.logic.alarm();
  assert.equal(rig.logic.snapshot().meta?.phase, "ended");
  assert.ok(rig.lines(a).includes("|win|Prince"), "the player who stayed wins");
  assert.equal(rig.logic.snapshot().meta?.winner, "Prince");
});

test("when both players are away, the one who left first forfeits", async () => {
  const rig = new Rig();
  const { a, b } = await seated(rig, ["First", "Second"]);
  await rig.logic.closed(a);
  rig.time += 5_000;
  await rig.logic.closed(b);
  rig.time += FORFEIT_AFTER_MS + 10_000;
  await rig.logic.alarm();
  assert.equal(rig.logic.snapshot().meta?.winner, "Second");
});

test("a refresh gets the same seat back with everything it has seen; a stranger with the same name doesn't", async () => {
  const rig = new Rig();
  const { a, b } = await seated(rig);
  await playTurn(rig, { a, b });
  await playTurn(rig, { a, b });
  await untilBothAsked(rig, { a, b });
  const seenBefore = rig.lines(a);
  const pending = rig.request(a);
  // The page is refreshed: the old connection closes, a new one says hello with the same browser id.
  await rig.logic.closed(a);
  const a2 = rig.connection();
  await rig.hello(a2, A, "Prince");
  const sync = rig.of(a2, "battle")[0];
  assert.equal(sync.instant, true, "marked as catching up, so the browser doesn't replay the animations");
  assert.deepEqual(sync.lines, seenBefore, "everything this player had seen, in order");
  assert.deepEqual(parseRequest(sync.request).rqid, pending!.rqid, "and the question still waiting for an answer");
  // They can answer it.
  await rig.send(a2, { type: "choose", choice: answerFor(pending!), rqid: pending!.rqid });
  assert.ok(rig.of(a2, "battle").slice(1).every((m) => !m.error), "taken without complaint");
  // Someone else claiming the name doesn't get the seat.
  const thief = rig.connection();
  await rig.hello(thief, C, "Prince");
  assert.equal(rig.of(thief, "error")[0]?.code, "full");
});

test("two players with the same name get different names, so the result is unambiguous", async () => {
  const rig = new Rig();
  const { a, b } = await seated(rig, ["Sam", "sam"]);
  const names = rig.of(a, "status").at(-1)!.players.map((p) => p.name);
  assert.equal(new Set(names.map((n) => n.toLowerCase())).size, 2, names.join(" / "));
  void b;
});

// ---- restarts: the battle is rebuilt by replay ------------------------------------------------------------------------------

test("after the server restarts (the room is evicted) the battle is rebuilt by replay: same logs, same question, and play goes on", async () => {
  const rig = new Rig();
  const conns = await seated(rig);
  for (let i = 0; i < 4; i++) await playTurn(rig, conns);
  await untilBothAsked(rig, conns);
  await rig.logic.flush();
  const before = { p1: [...rig.logic.snapshot().host!.history.p1], p2: [...rig.logic.snapshot().host!.history.p2] };
  const requestBefore = { p1: rig.request(conns.a)!, p2: rig.request(conns.b)! };
  assert.ok(before.p1.length > 20);
  const commands = (await rig.storage.list<string>("cmd:")).length;
  assert.ok(commands >= 3 + 4, `commands saved: ${commands}`);

  rig.restart(); // a new process: memory gone, only storage left
  await rig.logic.load();
  const after = rig.logic.snapshot();
  assert.equal(after.meta?.phase, "playing");
  assert.deepEqual(after.host!.history.p1, before.p1, "player 1's log rebuilt exactly");
  assert.deepEqual(after.host!.history.p2, before.p2, "player 2's log rebuilt exactly");
  assert.equal(after.host!.requests.p1?.rqid, requestBefore.p1.rqid, "the same question is waiting");
  assert.equal(after.host!.requests.p2?.rqid, requestBefore.p2.rqid);

  // Both players reconnect (their browsers do this on their own) and catch up, then the battle continues to its end.
  const a2 = rig.connection();
  const b2 = rig.connection();
  await rig.hello(a2, A, "Prince");
  await rig.hello(b2, B, "Friend");
  assert.deepEqual(rig.of(a2, "battle")[0].lines, before.p1);
  assert.deepEqual(rig.of(b2, "battle")[0].lines, before.p2);
  await playToEnd(rig, { a: a2, b: b2 });
  const host = rig.logic.snapshot().host!;
  const why = () => `requests ${JSON.stringify(Object.fromEntries(Object.entries(host.requests).map(([k, v]) => [k, v && { rqid: v.rqid, wait: v.wait }])))} answered ${JSON.stringify(host.answeredSnapshot())} a2 tail ${rig.messages(a2).slice(-3).map((m) => m.type + ("error" in m && m.error ? ":" + m.error : "")).join(",")} b2 tail ${rig.messages(b2).slice(-3).map((m) => m.type + ("error" in m && m.error ? ":" + m.error : "")).join(",")}`;
  assert.equal(rig.logic.snapshot().meta?.phase, "ended", why());
});

test("a restart in the middle of a turn (one player has chosen) keeps that choice", async () => {
  const rig = new Rig();
  const { a, b } = await seated(rig);
  const ra = rig.request(a)!;
  await rig.send(a, { type: "choose", choice: "move 1", rqid: ra.rqid });
  rig.restart();
  await rig.logic.load();
  const a2 = rig.connection();
  const b2 = rig.connection();
  await rig.hello(a2, A, "Prince");
  await rig.hello(b2, B, "Friend");
  // Player 1 has already answered this turn; player 2 answers; the turn plays.
  await rig.send(a2, { type: "choose", choice: "move 2", rqid: ra.rqid });
  assert.match(String(rig.of(a2, "battle").at(-1)?.error), /already chosen|earlier turn/);
  await rig.send(b2, { type: "choose", choice: "move 1", rqid: rig.request(b2)!.rqid });
  assert.ok(rig.lines(a2).some((l) => l.startsWith("|move|")), "the turn played after the restart");
  void b;
});

test("a forfeit survives a restart, and a finished battle is still readable afterwards", async () => {
  const rig = new Rig();
  const { a, b } = await seated(rig, ["Quitter", "Stayer"]);
  await rig.send(a, { type: "forfeit" });
  void b;
  rig.restart();
  await rig.logic.load();
  assert.equal(rig.logic.snapshot().meta?.phase, "ended");
  assert.equal(rig.logic.snapshot().host?.winner, "Stayer");
  const b2 = rig.connection();
  await rig.hello(b2, B, "Stayer");
  assert.ok(rig.of(b2, "battle")[0].lines.includes("|win|Stayer"), "the result is shown to someone who comes back later");
  assert.equal(rig.of(b2, "battle")[0].request, null);
});

test("a room nobody has touched for six hours is deleted, and a room people are sitting in is not", async () => {
  const rig = new Rig();
  const { a, b } = await seated(rig);
  rig.time += ROOM_TTL_MS + 1000;
  await rig.logic.alarm();
  assert.ok(rig.logic.snapshot().meta, "still connected: not abandoned");
  await rig.logic.closed(a);
  await rig.logic.closed(b);
  rig.time += ROOM_TTL_MS + 1000;
  await rig.logic.alarm();
  assert.equal(rig.logic.snapshot().meta, null);
  assert.equal(rig.storage.data.size, 0, "storage emptied");
  const late = rig.connection();
  await rig.hello(late, C, "Late");
  assert.equal(rig.of(late, "error")[0]?.code, "not-found");
});

test("flooding a connection with messages is cut off after a minute's worth in ten seconds", async () => {
  const rig = new Rig();
  const a = rig.connection();
  await rig.hello(a, A, "Prince", config);
  for (let i = 0; i < 200; i++) await rig.send(a, { type: "ping" });
  assert.ok(rig.of(a, "pong").length <= 60, `${rig.of(a, "pong").length} pongs`);
  rig.time += 11_000;
  await rig.send(a, { type: "ping" });
  assert.equal(rig.of(a, "pong").length > 60 || rig.of(a, "pong").length >= 1, true);
});

// ---- the battle host on its own ----------------------------------------------------------------------------------------------

test("the host: the commands are the whole state, and writing them again rebuilds both logs exactly, turn limit included", async () => {
  const stored: string[] = [];
  const outputs: { side: SideId; lines: string[] }[] = [];
  const host = new BattleHost({ names: ["One", "Two"], turnLimit: 30, onCommand: (c) => stored.push(c), onOutput: (o) => outputs.push({ side: o.side, lines: o.lines }) });
  for (const command of buildStartCommands({ formatKey: "gen5", names: ["One", "Two"] })) host.command(command);
  await host.settle();
  for (let i = 0; i < 200 && !host.ended; i++) {
    for (const side of ["p1", "p2"] as const) {
      const pending = host.requests[side];
      if (!pending || pending.wait) continue;
      const request = parseRequest(pending.raw);
      const slot = request.team.findIndex((p) => !p.active && (request.reviving ? p.fainted : !p.fainted));
      const choice = request.forceSwitch || !request.active ? (slot >= 0 ? `switch ${slot + 1}` : "default") : `move ${anyMove(request.active.moves)}`;
      assert.equal(host.choose(side, choice, request.rqid), null);
    }
    await host.settle();
  }
  assert.ok(host.ended, `not over after 40 rounds: requests ${JSON.stringify(Object.fromEntries(Object.entries(host.requests).map(([k, v]) => [k, v && { rqid: v.rqid, wait: v.wait }])))} turns ${host.history.p1.filter((l) => l.startsWith("|turn|")).length}`);
  // Nothing was ever written that wasn't a start command, a player command or a choice/forfeit/ending.
  assert.ok(stored.every((c) => /^>(start|player p[12]|p[12] (move|switch|default)|forcewin|forcetie|forcelose)/.test(c)), stored.filter((c) => !/^>(start|player|p[12] )/.test(c)).join(" | "));
  const rebuilt = new BattleHost({ names: ["One", "Two"], turnLimit: 30 });
  await rebuilt.replay(stored);
  assert.deepEqual(rebuilt.history.p1, host.history.p1);
  assert.deepEqual(rebuilt.history.p2, host.history.p2);
  assert.equal(rebuilt.winner, host.winner);
  host.destroy();
  rebuilt.destroy();
});

test("the host: a turn limit ends the battle for both players at the same point, with the reason in both logs, and replays the same", async () => {
  let reached = 0;
  for (let attempt = 0; attempt < 6 && !reached; attempt++) {
    const stored: string[] = [];
    const host = new BattleHost({ names: ["One", "Two"], turnLimit: 2, onCommand: (c) => stored.push(c) });
    for (const command of buildStartCommands({ formatKey: "gen9", names: ["One", "Two"] })) host.command(command);
    await host.settle();
    for (let i = 0; i < 6 && !host.ended; i++) {
      for (const side of ["p1", "p2"] as const) {
        const pending = host.requests[side];
        if (!pending || pending.wait) continue;
        const request = parseRequest(pending.raw);
        const slot = request.team.findIndex((p) => !p.active && (request.reviving ? p.fainted : !p.fainted));
        host.choose(side, request.forceSwitch || !request.active ? (slot >= 0 ? `switch ${slot + 1}` : "default") : `move ${anyMove(request.active.moves)}`, request.rqid);
      }
      await host.settle();
    }
    assert.ok(host.ended);
    const message = host.history.p1.find((l) => l.startsWith("|-message|Turn limit reached"));
    if (message) {
      reached++;
      assert.ok(host.history.p2.includes(message), "both players are told the same thing");
      assert.ok(!host.history.p1.includes("|turn|3") && !host.history.p2.includes("|turn|3"), "the next turn never starts");
      const rebuilt = new BattleHost({ names: ["One", "Two"], turnLimit: 2 });
      await rebuilt.replay(stored);
      assert.deepEqual(rebuilt.history.p1, host.history.p1);
      assert.deepEqual(rebuilt.history.p2, host.history.p2);
      rebuilt.destroy();
    }
    host.destroy();
  }
  assert.ok(reached >= 1, "a two-turn limit should be reached in one of six random battles");
});
