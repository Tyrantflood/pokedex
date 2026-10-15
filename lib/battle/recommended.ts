/**
 * The recommended teams (lib/battle/recommended-teams.generated.json, built by `npm run teams:build` from Smogon's published sample teams)
 * and how the battler picks from them. Pure: no simulator. Import it lazily from the UI (the file is a few hundred KB).
 */
import type { PokemonSet } from "@pkmn/sets";
import data from "./recommended-teams.generated.json";
import { normalizeIcons, normalizeSets, type SavedTeam } from "./my-teams";

export interface RecommendedTeam {
  id: string;
  name: string;
  /** The poster on Smogon, as published ("unknown" when the sample carried no name). */
  author: string;
  /** Offense, Bulky offense, Balance, Stall, Weather or Trick Room: worked out from the team's own moves, abilities and types. */
  tag: string;
  /** One sentence from the same facts (not Smogon's own words). */
  why: string;
  formatKey: string;
  /** Sprite ids of the six Pokémon, for lists. */
  icons: number[];
  sets: PokemonSet[];
}

export interface RecommendedFormat {
  formatId: string;
  /** How many teams Smogon had published for it, and how many passed the validator. */
  published: number;
  valid: number;
  teams: RecommendedTeam[];
}

export const CREDIT = {
  name: "Smogon",
  url: "https://www.smogon.com/",
  text: "Sample teams from Smogon, posted by its forum members, collected by the pkmn/smogon project.",
  via: "https://github.com/pkmn/smogon",
};

type Raw = typeof data.formats;

/** All recommended teams of a format (empty if it has none). Sets are read through `normalizeSets`, so they are full, safe `PokemonSet`s. */
export function recommendedFor(formatKey: string): RecommendedTeam[] {
  const entry = (data.formats as Raw & Record<string, Raw[keyof Raw] | undefined>)[formatKey];
  if (!entry) return [];
  return entry.teams.map((t) => ({ id: t.id, name: t.name, author: t.author, tag: t.tag, why: t.why, formatKey, icons: normalizeIcons(t.icons), sets: normalizeSets(t.sets) }));
}

export function recommendedFormat(formatKey: string): RecommendedFormat | null {
  const entry = (data.formats as Record<string, { formatId: string; published: number; valid: number } | undefined>)[formatKey];
  return entry ? { formatId: entry.formatId, published: entry.published, valid: entry.valid, teams: recommendedFor(formatKey) } : null;
}

export const recommendedFormatKeys = (): string[] => Object.keys(data.formats);

/** The CPU's team for a format: a recommended one chosen at random, never the one the player is using if there is another. */
export function cpuTeamFor(formatKey: string, avoidId?: string | null, random: () => number = Math.random): RecommendedTeam | null {
  const all = recommendedFor(formatKey);
  if (all.length === 0) return null;
  const pool = all.length > 1 ? all.filter((t) => t.id !== avoidId) : all;
  return pool[Math.floor(random() * pool.length)];
}

export function findRecommended(id: string): RecommendedTeam | null {
  for (const key of recommendedFormatKeys()) {
    const found = recommendedFor(key).find((t) => t.id === id);
    if (found) return found;
  }
  return null;
}

/** A recommended team as a saved one ("copy into My Teams"): it can be edited, renamed and used straight away, because it passed the format's validator when it was chosen. */
export function toSavedTeam(team: RecommendedTeam, id: string, now: number): SavedTeam {
  const formatId = (data.formats as Record<string, { formatId: string } | undefined>)[team.formatKey]?.formatId ?? "";
  return { id, name: team.name, formatKey: team.formatKey, sets: structuredClone(team.sets), updatedAt: now, check: { ok: true, errors: [], formatId }, icons: [...team.icons] };
}
