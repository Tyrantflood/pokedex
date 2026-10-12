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

export type { Difficulty } from "./cpu-player";

export interface BattleMessage {
  /** Protocol lines for the player (everything except the request and error lines). */
  lines: string[];
  /** What the player may do next, if this chunk carried a request. */
  request: ParsedRequest | null;
  /** The simulator refused the last choice. */
  error: string | null;
}

export interface MoveDetails {
  name: string;
  type: string;
  category: string;
  basePower: number;
  accuracy: number | true;
  description: string;
}

export interface LocalBattle {
  lookups: Lookups;
  moveDetails(name: string): MoveDetails;
  itemText(name: string): string;
  abilityText(name: string): string;
  choose(choice: string): void;
  /** Ends the battle as a loss for the player. */
  forfeit(): void;
  destroy(): void;
}

export interface LocalBattleOptions {
  format: BattleFormat;
  difficulty: Difficulty;
  playerName: string;
}

export function startLocalBattle(options: LocalBattleOptions, onMessage: (message: BattleMessage) => void): LocalBattle {
  const { format, difficulty, playerName } = options;
  const dex: ModdedDex = Dex.forFormat(format.formatId.split("@@@")[0]);
  const lookups = makeLookups(dex);
  const streams = BattleStreams.getPlayerStreams(new BattleStreams.BattleStream());

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
      for (const line of chunk.split("\n")) {
        if (line.startsWith("|request|")) request = parseRequest(JSON.parse(line.slice("|request|".length)));
        else if (line.startsWith("|error|")) error = line.slice("|error|".length);
        else if (line) lines.push(line);
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
  const cpuName = difficulty === "easy" ? "CPU (Easy)" : "CPU (Normal)";
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
