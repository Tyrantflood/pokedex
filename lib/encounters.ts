import { cacheLife } from "next/cache";
import { buildGameEncounters, type GameEncounters, type RawEncounterArea } from "./encounter-data";
import { locationName } from "./encounter-format";
import { resolveAreaNames } from "./location-names";
import { API, getJson } from "./pokeapi";

/** The raw encounter list for one Pokémon. Cached; throws on API failure (which is never cached). */
async function getRawEncounters(pokemonId: number): Promise<RawEncounterArea[]> {
  "use cache";
  cacheLife("days");
  return getJson<RawEncounterArea[]>(`${API}/pokemon/${pokemonId}/encounters`);
}

/**
 * Wild encounters for one Pokémon (by PokéAPI id, so forms have their own), grouped by game and location, with
 * PokéAPI's English location names. An empty array is a real answer: PokéAPI knows of none.
 *
 * Not cached as a whole on purpose: the raw list and every name lookup are cached separately, so a repeat view makes
 * no requests, and a name lookup that failed once is retried next time instead of being frozen into the result.
 */
export async function getEncounters(pokemonId: number): Promise<GameEncounters[]> {
  const raw = await getRawEncounters(pokemonId);
  const names = await resolveAreaNames(raw.map((area) => area.location_area.name));
  return buildGameEncounters(raw, (slug) => names.get(slug) ?? locationName(slug));
}
