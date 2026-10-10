import { resolveLocationName } from "./encounter-format";

/** The shape of lib/location-names.generated.json (built by scripts/build-location-names.mjs). */
export interface LocationNameTable {
  version: number;
  generatedAt: string;
  /** area slug -> [English area name or null, location slug] */
  areas: Record<string, [string | null, string]>;
  /** location slug -> English location name or null */
  locations: Record<string, string | null>;
}

/**
 * The name for an area from the table, or undefined if the table doesn't have it (or doesn't have its location), in which
 * case the caller has to look it up. A null English name in the table is an answer ("PokéAPI has none"), not a gap.
 */
export function nameFromTable(slug: string, table: LocationNameTable): string | undefined {
  const area = table.areas[slug];
  if (!area) return undefined;
  const [areaEnglish, locationSlug] = area;
  if (!(locationSlug in table.locations)) return undefined;
  return resolveLocationName({ areaSlug: slug, areaEnglish, locationSlug, locationEnglish: table.locations[locationSlug] });
}
