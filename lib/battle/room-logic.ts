/**
 * The rules of a friend-battle room, with no Cloudflare in it: who may sit down, when a battle starts, what each player is told, what
 * is saved, when a missing player forfeits. The Durable Object in party/src/index.ts is a thin adapter around this, and the tests drive
 * it directly with an in-memory store, scripted connections and a fake clock.
 *
 * What is saved: `meta` (config, players, phase) and the numbered commands that built the battle (see room-battle.ts). After a restart
 * `load()` replays the commands and the battle, and each player's log, is back as it was.
 */
import { FORMATS, formatByKey } from "./formats";
import { BattleHost, buildStartCommands, type HostOutput } from "./room-battle";
import {
  FORFEIT_AFTER_MS,
  isRoomCode,
  MAX_CLIENT_MESSAGE_CHARS,
  parseClientMessage,
  ROOM_TTL_MS,
  sanitizeName,
  type ErrorCode,
  type PlayerStatus,
  type RoomConfig,
  type RoomPhase,
  type ServerMessage,
} from "./room-protocol";
import type { SideId } from "./protocol";
import { packSets, toolsFor, unpackSets, validateSets } from "./team-check";
import { normalizeTurnLimit } from "./turn-limit";

export interface RoomStorage {
  get<T>(key: string): Promise<T | undefined>;
  put(key: string, value: unknown): Promise<void>;
  /** Every value whose key starts with `prefix`, in key order. */
  list<T>(prefix: string): Promise<T[]>;
  deleteAll(): Promise<void>;
}

export interface RoomIO {
  send(connectionId: string, message: ServerMessage): void;
  /** Close a connection (after an error that ends the conversation). */
  close(connectionId: string): void;
  /** Wake the room at this time (ms since epoch), or never (null). */
  setAlarm(at: number | null): Promise<void>;
  now(): number;
  /** A connection has been seated: keep where, so that it survives the room being evicted from memory and restored (`restoreConnection`). */
  remember?(connectionId: string, seat: { clientId: string; side: SideId }): void;
}

export interface PlayerInfo {
  clientId: string;
  name: string;
}

export interface RoomMeta {
  config: RoomConfig;
  players: { p1: PlayerInfo | null; p2: PlayerInfo | null };
  phase: RoomPhase;
  createdAt: number;
  lastActivity: number;
  /** When each player's last connection closed during a battle. */
  disconnectedAt: { p1: number | null; p2: number | null };
  /** The winner's name once it is over ("" for a tie). */
  winner: string | null;
  /** The request each player has already answered. */
  answered?: { p1: number | null; p2: number | null };
  /** "Bring your own team" battles: each player's checked team in packed form, until the battle starts. Never sent to anyone. */
  teams?: { p1: string | null; p2: string | null };
}

export interface RoomOptions {
  forfeitAfterMs?: number;
  ttlMs?: number;
}

interface Seat {
  clientId: string;
  side: SideId;
}

const META = "meta";
const CMD = "cmd:";
const cmdKey = (n: number) => `${CMD}${String(n).padStart(6, "0")}`;

/** At most this many messages from one connection in a ten-second window. */
const RATE_LIMIT = 60;
const RATE_WINDOW_MS = 10_000;

export class RoomLogic {
  readonly code: string;
  private readonly io: RoomIO;
  private readonly storage: RoomStorage;
  private readonly forfeitAfterMs: number;
  private readonly ttlMs: number;
  private meta: RoomMeta | null = null;
  private host: BattleHost | null = null;
  private commandCount = 0;
  /** Connections that have said hello, and where they sit. */
  private readonly seats = new Map<string, Seat>();
  private readonly rates = new Map<string, { windowStart: number; count: number }>();
  private writes: Promise<unknown> = Promise.resolve();
  private loaded = false;

  constructor(code: string, io: RoomIO, storage: RoomStorage, options: RoomOptions = {}) {
    this.code = code;
    this.io = io;
    this.storage = storage;
    this.forfeitAfterMs = options.forfeitAfterMs ?? FORFEIT_AFTER_MS;
    this.ttlMs = options.ttlMs ?? ROOM_TTL_MS;
  }

  // ---- lifecycle -------------------------------------------------------------------------------------------------------

  /** Reads what was saved and, if a battle was under way, replays it. Call once after every (re)start, before anything else. */
  async load() {
    if (this.loaded) return;
    this.loaded = true;
    this.meta = (await this.storage.get<RoomMeta>(META)) ?? null;
    if (this.meta && (this.meta.phase === "playing" || this.meta.phase === "ended")) {
      const commands = await this.storage.list<string>(CMD);
      this.commandCount = commands.length;
      this.host = this.newHost(this.meta);
      await this.host.replay(commands);
      if (this.meta.answered) this.host.restoreAnswered(this.meta.answered);
      if (this.host.ended && this.meta.phase !== "ended") await this.endBattle();
    }
  }

  /** After a restart: a connection that was open before it is still seated where it was (the adapter keeps this in the connection's state). */
  restoreConnection(connectionId: string, seat: Seat | null) {
    if (seat) this.seats.set(connectionId, seat);
  }

  private newHost(meta: RoomMeta): BattleHost {
    return new BattleHost({
      names: [meta.players.p1?.name ?? "Player 1", meta.players.p2?.name ?? "Player 2"],
      turnLimit: meta.config.turnLimit,
      onCommand: (command) => this.saveCommand(command),
      onOutput: (output) => this.deliver(output),
    });
  }

  private saveCommand(command: string) {
    const key = cmdKey(this.commandCount++);
    this.writes = this.writes.then(() => this.storage.put(key, command));
  }

  private async saveMeta() {
    if (!this.meta) return;
    this.meta.lastActivity = this.io.now();
    const snapshot = structuredClone(this.meta);
    this.writes = this.writes.then(() => this.storage.put(META, snapshot));
    await this.writes;
  }

  // ---- messages --------------------------------------------------------------------------------------------------------

  async message(connectionId: string, raw: string) {
    await this.load();
    const now = this.io.now();
    const rate = this.rates.get(connectionId);
    if (!rate || now - rate.windowStart > RATE_WINDOW_MS) this.rates.set(connectionId, { windowStart: now, count: 1 });
    else if (++rate.count > RATE_LIMIT) return;

    const message = parseClientMessage(raw);
    if (!message) return this.fail(connectionId, raw.length > MAX_CLIENT_MESSAGE_CHARS ? "too-big" : "bad-message", "That message wasn't understood.", false);
    switch (message.type) {
      case "ping":
        return this.io.send(connectionId, { type: "pong" });
      case "hello":
        return this.hello(connectionId, message.clientId, message.name, message.config);
      case "choose":
        return this.choose(connectionId, message.choice, message.rqid);
      case "team":
        return this.submitTeam(connectionId, message.packed);
      case "unready":
        return this.withdrawTeam(connectionId);
      case "forfeit":
        return this.forfeitBy(connectionId);
    }
  }

  private fail(connectionId: string, code: ErrorCode, message: string, close = true) {
    this.io.send(connectionId, { type: "error", code, message });
    if (close) this.io.close(connectionId);
  }

  private async hello(connectionId: string, clientId: string, rawName: string, config: RoomConfig | undefined) {
    if (this.seats.has(connectionId)) return; // already seated: one hello per connection
    if (!isRoomCode(this.code)) return this.fail(connectionId, "bad-code", "That isn't a valid room code.");
    const now = this.io.now();

    if (!this.meta) {
      // Only whoever creates a room (and so says what kind of battle it is) can make it exist; a stranger following a made-up link finds nothing.
      if (!config || !FORMATS.some((f) => f.key === config.formatKey)) return this.fail(connectionId, "not-found", "There's no battle here. The link may be wrong, or the battle expired.");
      this.meta = {
        config: { formatKey: config.formatKey, turnLimit: normalizeTurnLimit(config.turnLimit) },
        players: { p1: null, p2: null },
        phase: "waiting",
        createdAt: now,
        lastActivity: now,
        disconnectedAt: { p1: null, p2: null },
        winner: null,
      };
    }
    const meta = this.meta;
    const name = sanitizeName(rawName);

    // Find the seat: the one this browser already has, else a free one.
    let side: SideId | null = meta.players.p1?.clientId === clientId ? "p1" : meta.players.p2?.clientId === clientId ? "p2" : null;
    let joined = false;
    if (!side) {
      if (!meta.players.p1) side = "p1";
      else if (!meta.players.p2) side = "p2";
      else return this.fail(connectionId, "full", "This battle already has two players.");
      const taken = meta.players.p1 && side === "p2" && meta.players.p1.name.toLowerCase() === name.toLowerCase();
      meta.players[side] = { clientId, name: taken ? `${name.slice(0, 15)} (2)` : name };
      joined = true;
    }
    meta.disconnectedAt[side] = null;
    this.seats.set(connectionId, { clientId, side });
    this.io.remember?.(connectionId, { clientId, side });

    this.io.send(connectionId, { type: "welcome", side, code: this.code, config: meta.config, name: meta.players[side]!.name });

    if (joined && side === "p2") {
      // Both seats are taken. Random teams: the battle starts now. Bring-your-own-team: it starts when both have handed in a team.
      if (formatByKey(meta.config.formatKey).custom) meta.phase = "teams";
      else this.startBattle(meta);
      if (meta.phase === "teams") this.maybeStart(meta);
    } else if (!joined && this.host) {
      // Coming back: catch up on everything this player has seen, in one go.
      this.io.send(connectionId, { type: "battle", lines: [...this.host.history[side]], request: this.host.requests[side]?.raw ?? null, error: null, instant: true });
    }
    await this.saveMeta();
    this.broadcastStatus();
    await this.reschedule();
  }

  /** Starts the battle: the commands are saved as they are written, and replaying them rebuilds it. */
  private startBattle(meta: RoomMeta) {
    meta.phase = "playing";
    this.host = this.newHost(meta);
    const names: [string, string] = [meta.players.p1!.name, meta.players.p2!.name];
    const teams = meta.teams && meta.teams.p1 && meta.teams.p2 ? ([meta.teams.p1, meta.teams.p2] as [string, string]) : undefined;
    for (const command of buildStartCommands({ formatKey: meta.config.formatKey, names, teams })) this.host.command(command);
    delete meta.teams; // the teams now live in the saved commands; the lobby copy is not kept
  }

  /** Both seated and both teams in: go. */
  private maybeStart(meta: RoomMeta) {
    if (meta.phase !== "teams" || !meta.players.p1 || !meta.players.p2 || !meta.teams?.p1 || !meta.teams?.p2) return;
    this.startBattle(meta);
  }

  private async submitTeam(connectionId: string, packed: string) {
    const seat = this.seats.get(connectionId);
    const meta = this.meta;
    if (!seat || !meta) return this.fail(connectionId, "bad-message", "Say hello first.", false);
    const format = formatByKey(meta.config.formatKey);
    if (!format.custom) return this.io.send(connectionId, { type: "team-result", ok: false, errors: ["This battle uses random teams."] });
    if (meta.phase !== "waiting" && meta.phase !== "teams") return this.io.send(connectionId, { type: "team-result", ok: false, errors: ["The battle has already started."] });
    const sets = unpackSets(packed);
    if (!sets) return this.io.send(connectionId, { type: "team-result", ok: false, errors: ["That team couldn't be read."] });
    // The server decides: the same validator the team builder uses, run against this format's rules. What is kept is the validator's own
    // version of the team (defaults filled in, nicknames removed).
    const verdict = validateSets(toolsFor(format.formatId), sets);
    if (!verdict.ok) return this.io.send(connectionId, { type: "team-result", ok: false, errors: verdict.errors.slice(0, 20) });
    meta.teams = { p1: meta.teams?.p1 ?? null, p2: meta.teams?.p2 ?? null };
    meta.teams[seat.side] = packSets(verdict.sets);
    this.io.send(connectionId, { type: "team-result", ok: true, errors: [] });
    this.maybeStart(meta);
    await this.saveMeta();
    this.broadcastStatus();
    await this.reschedule();
  }

  private async withdrawTeam(connectionId: string) {
    const seat = this.seats.get(connectionId);
    const meta = this.meta;
    if (!seat || !meta?.teams || (meta.phase !== "waiting" && meta.phase !== "teams")) return;
    meta.teams[seat.side] = null;
    await this.saveMeta();
    this.broadcastStatus();
  }

  private async choose(connectionId: string, choice: string, rqid: number) {
    const seat = this.seats.get(connectionId);
    if (!seat || !this.host || this.meta?.phase !== "playing") return this.fail(connectionId, "bad-message", "There's no battle to choose in.", false);
    const reason = this.host.choose(seat.side, choice, rqid);
    if (reason) {
      const pending = this.host.requests[seat.side];
      this.io.send(connectionId, { type: "battle", lines: [], request: pending && !pending.wait && rqid !== pending.rqid ? pending.raw : null, error: `[Refused] ${reason}` });
    } else {
      await this.touch();
    }
  }

  private async forfeitBy(connectionId: string) {
    const seat = this.seats.get(connectionId);
    if (!seat || !this.host || this.meta?.phase !== "playing") return;
    this.host.forfeit(seat.side);
    await this.host.settle();
    await this.touch();
  }

  private async touch() {
    if (this.meta && this.host) this.meta.answered = this.host.answeredSnapshot();
    await this.saveMeta();
    await this.reschedule();
  }

  // ---- what the host says ----------------------------------------------------------------------------------------------

  private deliver(output: HostOutput) {
    if (output.lines.length || output.request || output.error) {
      for (const [id, seat] of this.seats) {
        if (seat.side === output.side) this.io.send(id, { type: "battle", lines: output.lines, request: output.request, error: output.error });
      }
    }
    if (this.host?.ended && this.meta && this.meta.phase !== "ended") void this.endBattle();
  }

  private async endBattle() {
    if (!this.meta || !this.host) return;
    this.meta.phase = "ended";
    this.meta.winner = this.host.winner;
    this.meta.disconnectedAt = { p1: null, p2: null };
    await this.saveMeta();
    this.broadcastStatus();
    await this.reschedule();
  }

  // ---- presence --------------------------------------------------------------------------------------------------------

  private connectedSides(): Set<SideId> {
    return new Set([...this.seats.values()].map((s) => s.side));
  }

  private statuses(): PlayerStatus[] {
    const meta = this.meta;
    if (!meta) return [];
    const connected = this.connectedSides();
    const now = this.io.now();
    return (["p1", "p2"] as const).flatMap((side) => {
      const player = meta.players[side];
      if (!player) return [];
      const since = meta.disconnectedAt[side];
      return [{ side, name: player.name, connected: connected.has(side), ready: !!meta.teams?.[side] || meta.phase === "playing" || meta.phase === "ended", forfeitInMs: meta.phase === "playing" && since !== null ? Math.max(0, since + this.forfeitAfterMs - now) : null }];
    });
  }

  private broadcastStatus() {
    if (!this.meta) return;
    const message: ServerMessage = { type: "status", phase: this.meta.phase, players: this.statuses() };
    for (const id of this.seats.keys()) this.io.send(id, message);
  }

  async closed(connectionId: string) {
    await this.load();
    const seat = this.seats.get(connectionId);
    this.seats.delete(connectionId);
    this.rates.delete(connectionId);
    if (!seat || !this.meta) return;
    if (!this.connectedSides().has(seat.side) && this.meta.phase === "playing") {
      this.meta.disconnectedAt[seat.side] = this.io.now();
      await this.saveMeta();
      this.broadcastStatus();
      await this.reschedule();
    }
  }

  /** The next time the room needs to wake: a missing player's deadline, or the end of the room's life. */
  private async reschedule() {
    const meta = this.meta;
    if (!meta) return this.io.setAlarm(null);
    const times = [meta.lastActivity + this.ttlMs];
    if (meta.phase === "playing") for (const side of ["p1", "p2"] as const) if (meta.disconnectedAt[side] !== null) times.push(meta.disconnectedAt[side]! + this.forfeitAfterMs);
    await this.io.setAlarm(Math.min(...times));
  }

  /** The alarm: someone has been away too long, or the room is old. */
  async alarm() {
    await this.load();
    const meta = this.meta;
    if (!meta) return;
    const now = this.io.now();
    if (now - meta.lastActivity >= this.ttlMs && this.connectedSides().size > 0) {
      // Somebody is still sitting in it (an idle result screen): not abandoned yet.
      await this.touch();
      return;
    }
    if (now - meta.lastActivity >= this.ttlMs) {
      this.host?.destroy();
      this.host = null;
      this.meta = null;
      this.commandCount = 0;
      await this.writes;
      await this.storage.deleteAll();
      return this.io.setAlarm(null);
    }
    if (meta.phase === "playing" && this.host) {
      // Whoever has been gone longest (past the limit) forfeits; if both are, the one who left first.
      const away = (["p1", "p2"] as const)
        .filter((side) => meta.disconnectedAt[side] !== null && now - meta.disconnectedAt[side]! >= this.forfeitAfterMs)
        .sort((a, b) => meta.disconnectedAt[a]! - meta.disconnectedAt[b]!);
      if (away.length) {
        this.host.forfeit(away[0]);
        await this.host.settle();
        await this.touch();
        return;
      }
    }
    await this.reschedule();
  }

  /** For tests and the adapter: what the room currently knows. */
  snapshot() {
    return { meta: this.meta ? structuredClone(this.meta) : null, host: this.host, commandCount: this.commandCount };
  }

  /** Waits for pending saves (so a restart in a test sees everything). */
  async flush() {
    await this.host?.settle();
    await this.writes;
  }
}
