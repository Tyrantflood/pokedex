/** The Pokédex's name/number search, shared with the battle team builder so both match the same way. Pure. */

export interface SearchQuery {
  /** Lower-case, trimmed, with a leading "#" removed and hyphens read as spaces. */
  name: string;
  /** Digits only (a Pokédex number), else "". */
  number: string;
  /** Nothing typed. */
  empty: boolean;
}

export function parseQuery(raw: string): SearchQuery {
  const q = raw.trim().toLowerCase().replace(/^#/, "");
  return { name: q.replace(/-/g, " "), number: /^\d+$/.test(q) ? q.replace(/^0+/, "") : "", empty: q === "" };
}

/** A Pokémon's searchable name: lower-case, hyphens as spaces ("great-tusk" and "Great Tusk" both become "great tusk"). */
export const searchKey = (name: string) => name.toLowerCase().replace(/-/g, " ");

/** True when the Pokémon matches the query: its number starts with the digits typed, or its name contains the text. */
export function matchesQuery(query: SearchQuery, key: string, dexNumber: number): boolean {
  if (query.empty) return true;
  if (query.number && String(dexNumber).startsWith(query.number)) return true;
  return key.includes(query.name);
}
