import { cacheLife } from "next/cache";
import { API, getJson } from "./pokeapi";

interface RawSpecies {
  evolution_chain: { url: string };
  flavor_text_entries: { flavor_text: string; language: { name: string } }[];
}

export interface SpeciesInfo {
  /** The most recent English Pokédex entry, with the games' line-break characters cleaned up. */
  flavor: string | null;
  chainUrl: string;
}

const clean = (text: string) =>
  text
    .replace(/[\n\f\r­]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Species-level data shared by the evolution chain and the flavour text. Cached; throws on API failure (never cached). */
export async function getSpecies(species: string): Promise<SpeciesInfo> {
  "use cache";
  cacheLife("max");

  const raw = await getJson<RawSpecies>(`${API}/pokemon-species/${species}`);
  // Entries are listed oldest game first, so the last English one is the newest.
  const english = raw.flavor_text_entries.filter((e) => e.language.name === "en");
  const latest = english[english.length - 1];
  return { flavor: latest ? clean(latest.flavor_text) : null, chainUrl: raw.evolution_chain.url };
}
