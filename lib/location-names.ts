import { cacheLife } from "next/cache";
import { locationName, resolveLocationName } from "./encounter-format";
import { API, getJson, PokeApiError } from "./pokeapi";

interface RawNamed {
  names?: { name: string; language: { name: string } }[];
}
interface RawArea extends RawNamed {
  location: { name: string };
}

const CONCURRENCY = 40;
const english = (raw: RawNamed) => raw.names?.find((n) => n.language.name === "en")?.name ?? null;

interface AreaInfo {
  english: string | null;
  location: string;
}

// Names never change, so each lookup is cached for good, per slug: a Pokémon whose areas were looked up for another
// Pokémon (most routes are shared) costs nothing. A 404 is a real answer ("PokéAPI has no such entry") and is cached
// as null; any other failure throws, which is never cached, so the next view tries again.
async function getAreaInfo(slug: string): Promise<AreaInfo | null> {
  "use cache";
  cacheLife("max");
  try {
    const raw = await getJson<RawArea>(`${API}/location-area/${encodeURIComponent(slug)}`);
    return { english: english(raw), location: raw.location.name };
  } catch (error) {
    if (error instanceof PokeApiError && error.status === 404) return null;
    throw error;
  }
}

async function getLocationEnglish(slug: string): Promise<string | null> {
  "use cache";
  cacheLife("max");
  try {
    return english(await getJson<RawNamed>(`${API}/location/${encodeURIComponent(slug)}`));
  } catch (error) {
    if (error instanceof PokeApiError && error.status === 404) return null;
    throw error;
  }
}

/**
 * The names to show for these encounter areas (see resolveLocationName), keyed by area slug. A lookup that fails falls
 * back to a name made from the slug for this response only; it is not remembered, so the next view retries it.
 */
export async function resolveAreaNames(slugs: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(slugs)];
  const names = new Map<string, string>();
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, unique.length) }, async () => {
      while (next < unique.length) {
        const slug = unique[next++];
        try {
          const area = await getAreaInfo(slug);
          const locationEnglish = area ? await getLocationEnglish(area.location) : null;
          names.set(slug, resolveLocationName({ areaSlug: slug, areaEnglish: area?.english ?? null, locationSlug: area?.location ?? null, locationEnglish }));
        } catch {
          names.set(slug, locationName(slug));
        }
      }
    }),
  );
  return names;
}
