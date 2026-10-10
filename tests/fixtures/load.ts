import { readFileSync } from "node:fs";
import type { PokemonStats, PokemonType } from "../../lib/pokemon-types";

// Saved copies of the parts of PokéAPI the tests need, so no test touches the network.
// Refresh them with `npm run snapshot` (scripts/snapshot-pokeapi.mjs).
const read = (name: string) => JSON.parse(readFileSync(new URL(name, import.meta.url), "utf8"));

export interface TypeSnapshot {
  double_damage_to: string[];
  half_damage_to: string[];
  no_damage_to: string[];
}

export const typeSnapshot: Record<string, TypeSnapshot> = read("./pokeapi-types.json").types;

export interface SlimPokemon {
  id: number;
  name: string;
  types: PokemonType[];
  stats: PokemonStats;
  /** Decimetres. */
  height: number;
}

export const pokemonSnapshot: SlimPokemon[] = read("./pokemon-slim.json");

/** One Pokémon (or form) by PokéAPI name, e.g. "vulpix-alola". Throws if the snapshot doesn't have it. */
export function pokemonNamed(name: string): SlimPokemon {
  const found = pokemonSnapshot.find((p) => p.name === name);
  if (!found) throw new Error(`"${name}" is not in tests/fixtures/pokemon-slim.json`);
  return found;
}
