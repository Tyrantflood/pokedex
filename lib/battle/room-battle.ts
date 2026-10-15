/**
 * One battle on the server: the simulator, authoritative, with each player seeing only their own side's stream.
 *
 * Everything that changes the battle is a command written to the simulator ("start", "player", a choice, a forfeit), and the list of
 * commands is the whole state: the simulator is deterministic from its seed, so writing the same commands again rebuilds the battle
 * exactly, with every player's log (this is how a restarted room recovers). Imports the simulator.
 */
import { BattleStreams, Teams } from "@pkmn/sim";
import type { PRNGSeed } from "@pkmn/sim";
import { formatByKey } from "./formats";
import type { SideId } from "./protocol";
import { generateTeam, randomSeed } from "./teams";
import { adjudicate, type Verdict } from "./turn-limit";

export interface HostOutput {
  side: SideId;
  /** Protocol lines for this player only. */
  lines: string[];
  /** The simulator's raw request JSON for this player, if the chunk carried one. */
  request: unknown | null;
  /** The simulator refused the last choice. */
  error: string | null;
}

export interface BattleHostOptions {
  /** Player names, as the simulator knows them ("|win|Name"). */
  names: [string, string];
  /** End the battle after this many turns and decide it; 0 for no limit. */
  turnLimit: number;
  /** Called for every new command (not for replayed ones), before it is written: store it. */
  onCommand?: (command: string) => void;
  /** Called with what each player should be sent (not during a replay). */
  onOutput?: (output: HostOutput) => void;
}

export interface PendingRequest {
  rqid: number;
  /** A request that only says "wait for the opponent". */
  wait: boolean;
  raw: unknown;
}

/** The three commands that start a battle: the simulator's rules and seed, and each player's team. The teams are packed into the commands, so a replay needs no generator. */
export function buildStartCommands(options: { formatKey: string; names: [string, string]; seed?: PRNGSeed; teamSeeds?: [PRNGSeed, PRNGSeed]; teams?: [string, string] }): string[] {
  const format = formatByKey(options.formatKey);
  if (format.custom && !options.teams) throw new Error(`${format.label} needs both teams.`);
  const seed = options.seed ?? randomSeed();
  const seeds = options.teamSeeds ?? [randomSeed(), randomSeed()];
  // "Bring your own team" formats use the packed teams the players handed in (already checked); random ones are generated from the seeds.
  const pack = (i: 0 | 1) => (format.custom ? options.teams![i] : Teams.pack(generateTeam(format, seeds[i])));
  return [
    `>start ${JSON.stringify({ formatid: format.formatId, seed })}`,
    `>player p1 ${JSON.stringify({ name: options.names[0], team: pack(0) })}`,
    `>player p2 ${JSON.stringify({ name: options.names[1], team: pack(1) })}`,
  ];
}

export class BattleHost {
  /** Everything each player has been shown so far. */
  readonly history: Record<SideId, string[]> = { p1: [], p2: [] };
  readonly requests: Record<SideId, PendingRequest | null> = { p1: null, p2: null };
  /** The request each side has already answered (so a second answer to it is refused). */
  private answered: Record<SideId, number | null> = { p1: null, p2: null };
  private readonly requestCount: Record<SideId, number> = { p1: 0, p2: 0 };
  ended = false;
  /** The winner's name, "" for a tie, null while the battle goes on. */
  winner: string | null = null;
  private readonly battleStream = new BattleStreams.BattleStream();
  private readonly streams = BattleStreams.getPlayerStreams(this.battleStream);
  private readonly options: BattleHostOptions;
  private replaying = false;
  private verdict: Verdict | null = null;
  private destroyed = false;
  /** Counts what the readers have handled, so `settle` can tell when everything pending has been delivered. */
  private activity = 0;

  constructor(options: BattleHostOptions) {
    this.options = options;
    // The omniscient stream is never sent to anyone, but must be read so it cannot back up.
    void (async () => {
      for await (const chunk of this.streams.omniscient) void chunk;
    })();
    for (const side of ["p1", "p2"] as const) void this.read(side);
  }

  private async read(side: SideId) {
    for await (const chunk of this.streams[side]) {
      if (this.destroyed) return;
      this.handle(side, chunk);
    }
  }

  private handle(side: SideId, chunk: string) {
    this.activity++;
    const lines: string[] = [];
    let request: unknown | null = null;
    let error: string | null = null;
    const limit = this.options.turnLimit;
    let limitReached = false;
    for (const line of chunk.split("\n")) {
      if (limit > 0 && line === `|turn|${limit + 1}`) limitReached = true; // the turn after the limit never starts
      else if (line.startsWith("|request|")) request = JSON.parse(line.slice("|request|".length));
      else if (line.startsWith("|error|")) error = line.slice("|error|".length);
      else if (line.startsWith("|t:|")) continue; // a wall-clock stamp: differs on every run, so a replay could never match it
      else if (line) lines.push(line);
    }
    if (limitReached) {
      this.verdict ??= this.decide(limit);
      lines.push(`|-message|${this.verdict.message}`);
      request = null; // the battle is over: no more choices
    }
    for (const line of lines) {
      if (line.startsWith("|win|")) this.finish(line.slice(5));
      else if (line === "|tie") this.finish(""); // not startsWith("|tie"): "|tier|..." is a header line
    }
    if (request) {
      // The simulator's own rqid is not usable here (it is the same on every request), so each request is numbered by the order it arrived
      // in for this player. A replay sees the same requests in the same order, so the numbers come out the same.
      const raw = request as { rqid?: number; wait?: boolean };
      const rqid = ++this.requestCount[side];
      raw.rqid = rqid;
      this.requests[side] = { rqid, wait: !!raw.wait, raw };
      this.answered[side] = null;
    }
    if (this.ended) this.requests[side] = null;
    if (error) this.answered[side] = null; // the simulator refused the choice: the player may choose again
    this.history[side].push(...lines);
    if (!this.replaying) this.options.onOutput?.({ side, lines, request: this.ended ? null : request, error });
  }

  /** Decides a battle that reached its turn limit, and ends it (once, whichever player's stream noticed first). */
  private decide(limit: number): Verdict {
    const sides = this.battleStream.battle?.sides;
    const tally = (i: number) => ({ name: this.options.names[i], pokemon: (sides?.[i].pokemon ?? []).map((p) => ({ hp: p.hp, maxHp: p.maxhp, fainted: p.fainted })) });
    const verdict = adjudicate(tally(0), tally(1), limit);
    // During a replay the ending is already among the commands being replayed.
    if (!this.replaying) this.command(verdict.winner ? `>forcewin ${verdict.winner}` : ">forcetie");
    return verdict;
  }

  private finish(winner: string) {
    if (this.ended) return;
    this.ended = true;
    this.winner = winner;
    this.requests.p1 = null;
    this.requests.p2 = null;
  }

  /** Writes a command to the simulator (and hands it to `onCommand` first, unless replaying, so it is stored before it has any effect). */
  command(command: string) {
    if (this.destroyed) return;
    if (!this.replaying) this.options.onCommand?.(command);
    void this.streams.omniscient.write(command);
  }

  /** Rebuilds the battle by writing its stored commands again, and waits until every player's log is rebuilt. */
  async replay(commands: string[]) {
    this.replaying = true;
    for (const command of commands) void this.streams.omniscient.write(command);
    await this.settle();
    this.replaying = false;
  }

  /**
   * Lets the streams deliver what is pending. Everything in the simulator and its streams moves by promises, so a run of microtask turns with
   * nothing new handled means it has all arrived (no timers: they are slow and not needed).
   */
  async settle() {
    let quiet = 0;
    let seen = this.activity;
    while (quiet < 50) {
      await Promise.resolve();
      if (this.activity === seen) quiet++;
      else {
        quiet = 0;
        seen = this.activity;
      }
    }
  }

  /** Why a choice can't be taken right now, or null if it can be passed to the simulator (which still has the last word). */
  refusal(side: SideId, rqid: number): string | null {
    if (this.ended) return "The battle is over.";
    const pending = this.requests[side];
    if (!pending || pending.wait) return "It isn't your turn to choose.";
    if (pending.rqid !== rqid) return "That choice was for an earlier turn.";
    if (this.answered[side] === rqid) return "You have already chosen this turn.";
    return null;
  }

  /** Passes a (pre-validated, see room-protocol.ts) choice to the simulator. Returns a reason if it can't be taken. */
  choose(side: SideId, choice: string, rqid: number): string | null {
    const reason = this.refusal(side, rqid);
    if (reason) return reason;
    this.answered[side] = rqid;
    this.command(`>${side} ${choice}`);
    return null;
  }

  /** Which request each side has already answered, for saving (a restart must not let a player answer a turn twice). */
  answeredSnapshot(): { p1: number | null; p2: number | null } {
    return { ...this.answered };
  }

  restoreAnswered(answered: { p1: number | null; p2: number | null }) {
    this.answered = { ...answered };
  }

  /** A choice the simulator turned out to refuse can be made again. */
  reopen(side: SideId) {
    this.answered[side] = null;
  }

  forfeit(side: SideId) {
    if (!this.ended) this.command(`>forcelose ${side}`);
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    void this.streams.omniscient.writeEnd();
  }
}
