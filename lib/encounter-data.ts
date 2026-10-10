import { locationName } from "./encounter-format";
import { GAMES, gameOrder, type Game } from "./games";

// ---- What PokéAPI returns for /pokemon/{id}/encounters ----
export interface RawEncounterArea {
  location_area: { name: string };
  version_details: {
    version: { name: string };
    encounter_details: {
      min_level: number;
      max_level: number;
      chance: number;
      method: { name: string };
      condition_values: { name: string }[];
    }[];
  }[];
}

// ---- What the browser gets ----
export interface EncounterEntry {
  /** PokéAPI method slug (walk, surf, old-rod, ...). */
  method: string;
  /** Condition slugs that apply (time-morning, swarm-yes, ...). */
  conditions: string[];
  minLevel: number;
  maxLevel: number;
  /** Percent chance, at most 100. */
  chance: number;
}

export interface EncounterLocation {
  name: string;
  /** Best chance first. */
  entries: EncounterEntry[];
}

export interface GameEncounters {
  /** PokéAPI version slug. */
  version: string;
  /** Most likely location first. */
  locations: EncounterLocation[];
}

const bestChance = (loc: EncounterLocation) => loc.entries[0]?.chance ?? 0;

/**
 * Groups raw encounter areas by game and then by readable location.
 *
 * `nameOf` turns an area slug into the name to show (see lib/location-names.ts); by default it is made from the slug.
 * Within one area, the rows PokéAPI lists per slot (and per level) are summed for the same method and conditions,
 * since each slot adds to the chance of meeting this Pokémon. Areas that end up with the same name are merged by taking the best chance and the widest level range.
 * Games come back in release order; unknown versions sort last.
 */
export function buildGameEncounters(raw: RawEncounterArea[], nameOf: (areaSlug: string) => string = locationName): GameEncounters[] {
  const games = new Map<string, Map<string, Map<string, EncounterEntry>>>();

  for (const area of raw) {
    const location = nameOf(area.location_area.name);
    for (const detail of area.version_details) {
      // This area, this game: sum the slots that share a method and conditions.
      const here = new Map<string, EncounterEntry>();
      for (const e of detail.encounter_details) {
        const conditions = e.condition_values.map((c) => c.name).sort();
        const key = `${e.method.name}|${conditions.join(",")}`;
        const entry = here.get(key) ?? { method: e.method.name, conditions, minLevel: e.min_level, maxLevel: e.max_level, chance: 0 };
        entry.chance += e.chance;
        entry.minLevel = Math.min(entry.minLevel, e.min_level);
        entry.maxLevel = Math.max(entry.maxLevel, e.max_level);
        here.set(key, entry);
      }

      const locations = games.get(detail.version.name) ?? new Map<string, Map<string, EncounterEntry>>();
      games.set(detail.version.name, locations);
      const merged = locations.get(location) ?? new Map<string, EncounterEntry>();
      locations.set(location, merged);
      for (const [key, entry] of here) {
        const entryChance = Math.min(100, entry.chance);
        const existing = merged.get(key);
        if (!existing) merged.set(key, { ...entry, chance: entryChance });
        else {
          existing.chance = Math.max(existing.chance, entryChance);
          existing.minLevel = Math.min(existing.minLevel, entry.minLevel);
          existing.maxLevel = Math.max(existing.maxLevel, entry.maxLevel);
        }
      }
    }
  }

  const out: GameEncounters[] = [];
  for (const [version, locations] of games) {
    const list: EncounterLocation[] = [...locations].map(([name, entries]) => ({
      name,
      entries: [...entries.values()].sort((a, b) => b.chance - a.chance || b.maxLevel - a.maxLevel),
    }));
    list.sort((a, b) => bestChance(b) - bestChance(a) || a.name.localeCompare(b.name));
    out.push({ version, locations: list.filter((l) => l.entries.length > 0) });
  }
  return out
    .filter((g) => g.locations.length > 0)
    .sort((a, b) => gameOrder(a.version) - gameOrder(b.version) || a.version.localeCompare(b.version));
}

// ---- Laying the games out ----
export type EncounterRow =
  | { kind: "game"; game: GameEncounters }
  /** Consecutive main-series games with nothing in the data, shown as one line. */
  | { kind: "nodata"; games: Game[] };

/**
 * One row per game that has data, in release order, with a "no data" row wherever main-series games from the
 * Pokémon's own generation onwards have none. Spin-offs, DLC and regional editions only ever appear with data.
 */
export function planRows(games: GameEncounters[], generation: number): EncounterRow[] {
  const have = new Map(games.map((g) => [g.version, g]));
  // The Japanese Red/Green/Blue editions repeat the international games' data; show them only if those have none.
  const hideJapan = have.has("red") || have.has("blue");
  const rows: EncounterRow[] = [];
  const consumed = new Set<string>();
  let pending: Game[] = [];
  const flush = () => {
    if (pending.length) rows.push({ kind: "nodata", games: pending });
    pending = [];
  };

  for (const game of GAMES) {
    const data = have.get(game.slug);
    if (data && hideJapan && game.slug.endsWith("-japan")) {
      consumed.add(game.slug);
    } else if (data) {
      flush();
      rows.push({ kind: "game", game: data });
      consumed.add(game.slug);
    } else if (game.main && game.generation >= generation) {
      pending.push(game);
    }
  }
  flush();
  // Versions this app doesn't know yet: still shown, after everything else.
  for (const data of games) if (!consumed.has(data.version)) rows.push({ kind: "game", game: data });
  return rows;
}
