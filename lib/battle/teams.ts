/**
 * Random teams. Single-generation formats use Showdown's own generators (`@pkmn/randoms`). The simulator has no National Dex
 * random format, so "National Dex" is built here: the Gen 9 generator with older generations' sets merged in for every species
 * Gen 9's own list lacks, played under Gen 9 mechanics with the National Dex rules (Megas, Z-Moves and old moves all allowed).
 * Measured when it was designed: 783 species (508 native + 275 merged), no generator crashes, 150 CPU battles completed.
 *
 * Imports the simulator, so only load this module lazily (see engine.ts).
 */
import { Dex, Teams } from "@pkmn/sim";
import type { PokemonSet, PRNGSeed } from "@pkmn/sim";
import { TeamGenerators } from "@pkmn/randoms";
import type { BattleFormat } from "./formats";

Teams.setGeneratorFactory(TeamGenerators);

interface RandomSet {
  role: string;
  movepool: string[];
  abilities: string[];
  teraTypes?: string[];
  [key: string]: unknown;
}
type SetTable = Record<string, { level: number; sets: RandomSet[] }>;
/** The generator's internals, as far as the National Dex merge needs them. */
interface GeneratorInternals {
  randomSets: SetTable;
  randomTeam(): PokemonSet[];
}

/** Older generations to draw from, newest first (Gen 1-3 data uses another move format and all of those species exist later). */
const MERGE_FROM = [8, 7, 6, 5, 4];
let merged: SetTable | null = null;

function mergedSets(): SetTable {
  if (merged) return merged;
  const natdex = Dex.forFormat("gen9nationaldex");
  const table: SetTable = { ...(Teams.getGenerator("gen9randombattle", "1,2,3,4") as unknown as GeneratorInternals).randomSets };
  for (const gen of MERGE_FROM) {
    const older = (Teams.getGenerator(`gen${gen}randombattle`, "1,2,3,4") as unknown as GeneratorInternals).randomSets;
    for (const [id, entry] of Object.entries(older)) {
      if (table[id]) continue;
      const species = natdex.species.get(id);
      if (!species.exists) continue;
      const sets: RandomSet[] = [];
      for (const set of entry.sets) {
        const movepool = set.movepool
          .map((name) => natdex.moves.get(name))
          // Z-Moves, Max Moves and Hidden Power variants are not in the Gen 9 move pool.
          .filter((move) => move.exists && !move.isZ && !move.isMax && !move.id.startsWith("hiddenpower"))
          .map((move) => move.name);
        if (!movepool.length) continue;
        sets.push({ ...set, movepool, abilities: set.abilities.filter((a) => natdex.abilities.get(a).exists), teraTypes: [...species.types] });
      }
      if (sets.length) table[id] = { level: entry.level, sets };
    }
  }
  return (merged = table);
}

export function randomSeed(): PRNGSeed {
  const word = () => Math.floor(Math.random() * 0x10000);
  return `${word()},${word()},${word()},${word()}`;
}

/** A random team of six for the format, from the given seed. */
export function generateTeam(format: BattleFormat, seed: PRNGSeed): PokemonSet[] {
  if (format.generator === "natdex") {
    const generator = Teams.getGenerator("gen9randombattle", seed) as unknown as GeneratorInternals;
    generator.randomSets = mergedSets();
    return generator.randomTeam();
  }
  return Teams.generate(format.generator, { seed });
}
