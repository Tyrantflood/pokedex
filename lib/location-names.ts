import { cacheLife } from "next/cache";
import { locationName, resolveLocationName } from "./encounter-format";
import { nameFromTable, type LocationNameTable } from "./location-table";
import table from "./location-names.generated.json";
import { API, getJson, PokeApiError } from "./pokeapi";

const TABLE = table as unknown as LocationNameTable;

interface RawNamed {
  names?: { name: string; language: { name: string } }[];
}
interface RawArea extends RawNamed {
  location: { name: string };
}

const CONCURRENCY = 40;
const english = (raw: RawNamed) => raw.names?.find((n) => n.language.name === "en")?.name ?? null;

// ---- Runtime lookup: only for areas the table doesn't have (new in PokéAPI since it was built) ----
//
// Names never change, so each lookup is cached for good, per slug. A 404 is a real answer ("PokéAPI has no such entry")
// and is cached as null; any other failure throws, which is never cached, so the next view tries again.
interface AreaInfo {
  english: string | null;
  location: string;
}

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
 * The names to show for these encounter areas (see resolveLocationName), keyed by area slug. Everything the shipped table
 * knows is answered from memory with no request at all; only the rest is looked up (and cached). A lookup that fails falls
 * back to a name made from the slug for this response only; it is not remembered, so the next view retries it.
 */
export async function resolveAreaNames(slugs: string[]): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  const missing: string[] = [];
  for (const slug of new Set(slugs)) {
    const known = nameFromTable(slug, TABLE);
    if (known !== undefined) names.set(slug, known);
    else missing.push(slug);
  }

  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, missing.length) }, async () => {
      while (next < missing.length) {
        const slug = missing[next++];
        try {
          const area = await getAreaInfo(slug);
          // The table may still know the location even if it lacks this area.
          const locationEnglish = area ? (area.location in TABLE.locations ? TABLE.locations[area.location] : await getLocationEnglish(area.location)) : null;
          names.set(slug, resolveLocationName({ areaSlug: slug, areaEnglish: area?.english ?? null, locationSlug: area?.location ?? null, locationEnglish }));
        } catch {
          names.set(slug, locationName(slug));
        }
      }
    }),
  );
  return names;
}
