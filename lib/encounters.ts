import { cacheLife } from "next/cache";
import { buildGameEncounters, type GameEncounters, type RawEncounterArea } from "./encounter-data";
import { API, getJson } from "./pokeapi";

/**
 * Wild encounters for one Pokémon (by PokéAPI id, so forms have their own), grouped by game and location.
 * Cached; throws on API failure (which is never cached). An empty array is a real answer: PokéAPI knows of none.
 */
export async function getEncounters(pokemonId: number): Promise<GameEncounters[]> {
  "use cache";
  cacheLife("days");

  const raw = await getJson<RawEncounterArea[]>(`${API}/pokemon/${pokemonId}/encounters`);
  return buildGameEncounters(raw);
}
