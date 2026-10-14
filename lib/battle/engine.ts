/**
 * The in-browser battle: runs `@pkmn/sim` locally with the player on side p1 and a CPU on side p2. This is the ONLY module the
 * UI imports the simulator through, and it does so with a dynamic `import()` from /battle, so the Pokédex never downloads it
 * (about 7.6 MB minified, 1.2 MB gzip).
 */
import { BattleStreams, Dex, Teams } from "@pkmn/sim";
import type { ModdedDex } from "@pkmn/sim";
import { CpuPlayer, type Difficulty } from "./cpu-player";
import { makeLookups } from "./dex-facts";
import type { BattleFormat } from "./formats";
import { parseRequest, type Lookups, type ParsedRequest } from "./protocol";
import { generateTeam, randomSeed } from "./teams";
import { adjudicate } from "./turn-limit";

export type { Difficulty } from "./cpu-player";

export interface BattleMessage {
  /** Protocol lines for the player (everything except the request and error lines). */
  lines: string[];
  /** What the player may do next, if this chunk carried a request. */
  request: ParsedRequest | null;
  /** The simulator refused the last choice. */
  error: string | null;
  /** The whole log so far, delivered after a reconnect: rebuild the view from it without playing the animations. */
  instant?: boolean;
}

export interface MoveDetails {
  name: string;
  type: string;
  category: string;
  basePower: number;
  accuracy: number | true;
  description: string;
}

/** Where a battle comes from: the in-browser simulator (against the CPU) or a friend's room on the server. The screen doesn't care which. */
export interface LocalBattle {
  lookups: Lookups;
  moveDetails(name: string): MoveDetails;
  itemText(name: string): string;
  abilityText(name: string): string;
  /** `rqid` is the question being answered (the room server refuses answers to an old one); the local simulator ignores it. */
  choose(choice: string, rqid?: number): void;
  /** Ends the battle as a loss for the player. */
  forfeit(): void;
  destroy(): void;
}

export interface LocalBattleOptions {
  format: BattleFormat;
  difficulty: Difficulty;
  playerName: string;
  /** End the battle after this many turns and decide it (see turn-limit.ts); 0 or absent for no limit. The simulator's own protections stay on either way. */
  turnLimit?: number;
}

export function startLocalBattle(options: LocalBattleOptions, onMessage: (message: BattleMessage) => void): LocalBattle {
  const { format, difficulty, playerName } = options;
  const turnLimit = options.turnLimit ?? 0;
  const dex: ModdedDex = Dex.forFormat(format.formatId.split("@@@")[0]);
  const lookups = makeLookups(dex);
  const battleStream = new BattleStreams.BattleStream();
  const streams = BattleStreams.getPlayerStreams(battleStream);
  const cpuNameFor = difficulty === "easy" ? "CPU (Easy)" : "CPU (Normal)";

  const cpuSeed = Math.floor(Math.random() * 0xffffffff);
  const cpu = new CpuPlayer(streams.p2, "p2", dex, difficulty, cpuSeed);
  void cpu.start();

  let closed = false;
  void (async () => {
    for await (const chunk of streams.p1) {
      if (closed) break;
      const lines: string[] = [];
      let request: ParsedRequest | null = null;
      let error: string | null = null;
      let limitReached = false;
      for (const line of chunk.split("\n")) {
        // The turn after the limit never starts: this is where the limit ends the battle.
        if (turnLimit > 0 && line === `|turn|${turnLimit + 1}`) limitReached = true;
        else if (line.startsWith("|request|")) request = parseRequest(JSON.parse(line.slice("|request|".length)));
        else if (line.startsWith("|error|")) error = line.slice("|error|".length);
        else if (line) lines.push(line);
      }
      if (limitReached) {
        const sides = battleStream.battle?.sides;
        if (sides) {
          const tally = (i: number, name: string) => ({ name, pokemon: sides[i].pokemon.map((p) => ({ hp: p.hp, maxHp: p.maxhp, fainted: p.fainted })) });
          const verdict = adjudicate(tally(0, playerName), tally(1, cpuNameFor), turnLimit);
          lines.push(`|-message|${verdict.message}`);
          void streams.omniscient.write(verdict.winner ? `>forcewin ${verdict.winner}` : ">forcetie");
          request = null; // the battle is over: no more choices
        }
      }
      onMessage({ lines, request, error });
    }
  })();
  // The omniscient stream isn't shown, but must be read so it can't back up.
  void (async () => {
    for await (const chunk of streams.omniscient) void chunk;
  })();

  const spec = { formatid: format.formatId, seed: randomSeed() };
  const packedTeam = () => Teams.pack(generateTeam(format, randomSeed()));
  const cpuName = cpuNameFor;
  void streams.omniscient.write(
    `>start ${JSON.stringify(spec)}\n` +
      `>player p1 ${JSON.stringify({ name: playerName, team: packedTeam() })}\n` +
      `>player p2 ${JSON.stringify({ name: cpuName, team: packedTeam() })}`,
  );

  return {
    lookups,
    moveDetails(name) {
      const move = dex.moves.get(name);
      return {
        name: move.name,
        type: move.exists ? move.type.toLowerCase() : "normal",
        category: move.category,
        basePower: move.basePower,
        accuracy: move.accuracy,
        description: move.shortDesc || move.desc || "",
      };
    },
    itemText: (name) => dex.items.get(name).shortDesc || "",
    abilityText: (name) => dex.abilities.get(name).shortDesc || "",
    choose(choice) {
      if (!closed) void streams.p1.write(choice);
    },
    forfeit() {
      if (!closed) void streams.omniscient.write(">forcelose p1");
    },
    destroy() {
      if (closed) return;
      closed = true;
      // Ending the write side shuts the battle and all three streams down cleanly; destroy() would leave the battle pushing into them.
      void streams.omniscient.writeEnd();
    },
  };
}
