/**
 * Battle teams saved in this browser ("My Teams"). Pure: no simulator, no React. A saved team is a name, the format it was built for,
 * and up to six sets in the same shape Showdown uses (`PokemonSet`), so import, export, packing and validation all take them as they are.
 *
 * Storage shape (localStorage "battle:teams"): `{ "version": 1, "teams": [ { id, name, formatKey, sets, updatedAt, check } ] }`.
 * `parseStore` never throws: whatever is wrong with a save (not JSON, another version, a team or set that is garbage) is dropped, so a
 * damaged save cannot stop the page from loading. `check` is the validator's last verdict for the team in its format, kept so the
 * lobby can say which teams are ready without loading the simulator.
 */
import type { PokemonSet } from "@pkmn/sets";
import { fullTable, STATS, type StatsTable } from "./team-edit";

export const TEAMS_KEY = "battle:teams";
export const TEAMS_VERSION = 1;
export const MAX_TEAMS = 100;
export const MAX_TEAM_NAME = 40;
export const TEAM_SIZE = 6;

export interface TeamCheck {
  ok: boolean;
  /** The validator's complaints (empty when ok). */
  errors: string[];
  /** The `formatId` it was checked against: a team checked for another format says nothing about this one. */
  formatId: string;
}

export interface SavedTeam {
  id: string;
  name: string;
  /** A key from formats.ts (a "bring your own team" format). */
  formatKey: string;
  sets: PokemonSet[];
  updatedAt: number;
  check: TeamCheck | null;
  /** Sprite ids of the members, kept so a list can show them without loading the simulator (only the builder knows species numbers). */
  icons: number[];
}

export interface TeamStore {
  version: typeof TEAMS_VERSION;
  teams: SavedTeam[];
}

/** A format id without its custom rules ("gen9ou@@@..."): what a team's legality depends on. */
export const rulesOf = (formatId: string) => formatId.split("@@@")[0];

export const emptyStore = (): TeamStore => ({ version: TEAMS_VERSION, teams: [] });

const asText = (value: unknown, max = 40): string => (typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f|]/g, "").slice(0, max) : "");
const asInt = (value: unknown, fallback: number, min: number, max: number) => (typeof value === "number" && Number.isFinite(value) ? Math.max(min, Math.min(max, Math.floor(value))) : fallback);

function asTable(value: unknown, fallback: number, max: number): StatsTable {
  const table = fullTable(fallback);
  if (typeof value === "object" && value !== null) for (const stat of STATS) table[stat] = asInt((value as Record<string, unknown>)[stat], fallback, 0, max);
  return table;
}

/** A set from untrusted JSON (a save, a backup file, a recommended team), or null if there is no species. Everything is clamped, nothing thrown. */
export function normalizeSet(raw: unknown): PokemonSet | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const species = asText(r.species, 40);
  if (!species) return null;
  const moves = Array.isArray(r.moves) ? r.moves.map((m) => asText(m, 40)).filter(Boolean).slice(0, 4) : [];
  const set: PokemonSet = {
    name: species, // no nicknames: they would travel into the battle log
    species,
    item: asText(r.item),
    ability: asText(r.ability),
    moves,
    nature: asText(r.nature, 12),
    gender: r.gender === "M" || r.gender === "F" ? r.gender : "",
    evs: asTable(r.evs, 0, 255),
    ivs: asTable(r.ivs, 31, 31),
    level: asInt(r.level, 100, 1, 100),
  };
  if (r.shiny === true) set.shiny = true;
  const tera = asText(r.teraType, 12);
  if (tera) set.teraType = tera as PokemonSet["teraType"];
  const hp = asText(r.hpType, 12);
  if (hp) set.hpType = hp;
  if (typeof r.happiness === "number") set.happiness = asInt(r.happiness, 255, 0, 255);
  return set;
}

/** A list of sprite ids (positive integers, at most six), or an empty list. */
export function normalizeIcons(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, TEAM_SIZE).filter((n): n is number => typeof n === "number" && Number.isInteger(n) && n > 0 && n < 100000);
}

export function normalizeSets(raw: unknown): PokemonSet[] {
  if (!Array.isArray(raw)) return [];
  const sets: PokemonSet[] = [];
  for (const entry of raw.slice(0, TEAM_SIZE)) {
    const set = normalizeSet(entry);
    if (set) sets.push(set);
  }
  return sets;
}

function normalizeTeam(raw: unknown): SavedTeam | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const id = typeof r.id === "string" && /^[A-Za-z0-9_-]{4,40}$/.test(r.id) ? r.id : "";
  if (!id) return null;
  const formatKey = asText(r.formatKey, 30);
  if (!formatKey) return null;
  let check: TeamCheck | null = null;
  if (typeof r.check === "object" && r.check !== null) {
    const c = r.check as Record<string, unknown>;
    if (typeof c.ok === "boolean" && typeof c.formatId === "string") {
      check = { ok: c.ok, formatId: c.formatId.slice(0, 80), errors: Array.isArray(c.errors) ? c.errors.map((e) => asText(e, 300)).filter(Boolean).slice(0, 30) : [] };
    }
  }
  return { id, name: asText(r.name, MAX_TEAM_NAME) || "Untitled team", formatKey, sets: normalizeSets(r.sets), updatedAt: asInt(r.updatedAt, 0, 0, 8.64e15), check, icons: normalizeIcons(r.icons) };
}

export function parseStore(raw: string | null | undefined): TeamStore {
  const store = emptyStore();
  if (!raw) return store;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return store;
  }
  // When the stored shape changes, migrate older versions here. Today there is only one.
  if (typeof parsed !== "object" || parsed === null || (parsed as { version?: unknown }).version !== TEAMS_VERSION) return store;
  const teams = (parsed as { teams?: unknown }).teams;
  if (!Array.isArray(teams)) return store;
  const seen = new Set<string>();
  for (const entry of teams.slice(0, MAX_TEAMS)) {
    const team = normalizeTeam(entry);
    if (team && !seen.has(team.id)) {
      seen.add(team.id);
      store.teams.push(team);
    }
  }
  return store;
}

export const serializeStore = (store: TeamStore): string => JSON.stringify(store);

/** A fresh team id (random, from the platform's generator; `Math.random` only if there is none). */
export function newTeamId(random: (bytes: Uint8Array) => Uint8Array = (b) => crypto.getRandomValues(b)): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  return [...random(new Uint8Array(10))].map((b) => alphabet[b % alphabet.length]).join("");
}

/** The team with this id replaced (or added at the top), most recently changed first. */
export function upsertTeam(store: TeamStore, team: SavedTeam): TeamStore {
  const others = store.teams.filter((t) => t.id !== team.id);
  return { ...store, teams: [team, ...others].slice(0, MAX_TEAMS) };
}

export const removeTeam = (store: TeamStore, id: string): TeamStore => ({ ...store, teams: store.teams.filter((t) => t.id !== id) });

export const findTeam = (store: TeamStore, id: string | null | undefined): SavedTeam | undefined => store.teams.find((t) => t.id === id);

/** A copy under a new id and name (for "copy into My Teams", duplicates, and imports that clash). */
export function copyTeam(team: SavedTeam, name: string, id: string, now: number): SavedTeam {
  return { ...structuredClone(team), id, name: asText(name, MAX_TEAM_NAME) || "Untitled team", updatedAt: now };
}

// ---- backup ------------------------------------------------------------------------------------------------------------

export const BACKUP_KIND = "pokedex-battle-teams";

/** Every team as one JSON document, for downloading. */
export function exportBackup(store: TeamStore, now: number): string {
  return JSON.stringify({ kind: BACKUP_KIND, version: TEAMS_VERSION, exportedAt: new Date(now).toISOString(), teams: store.teams }, null, 2);
}

export type BackupResult = { ok: true; store: TeamStore; added: number; skipped: number } | { ok: false; reason: string };

/** Adds the teams of a backup to the store. A team whose id is already here and identical is skipped; one that differs is added as a copy. */
export function importBackup(text: string, store: TeamStore, makeId: () => string = newTeamId): BackupResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, reason: "That file isn't a teams backup (it isn't valid JSON)." };
  }
  if (typeof parsed !== "object" || parsed === null || (parsed as { kind?: unknown }).kind !== BACKUP_KIND || (parsed as { version?: unknown }).version !== TEAMS_VERSION) {
    return { ok: false, reason: "That file isn't a teams backup from this site." };
  }
  const incoming = parseStore(JSON.stringify({ version: TEAMS_VERSION, teams: (parsed as { teams?: unknown }).teams })).teams;
  let next = store;
  let added = 0;
  let skipped = 0;
  for (const team of incoming) {
    const same = findTeam(next, team.id);
    if (same && JSON.stringify(same.sets) === JSON.stringify(team.sets) && same.name === team.name && same.formatKey === team.formatKey) {
      skipped++;
      continue;
    }
    if (next.teams.length >= MAX_TEAMS) {
      skipped++;
      continue;
    }
    next = upsertTeam(next, same ? { ...team, id: makeId() } : team);
    added++;
  }
  return { ok: true, store: next, added, skipped };
}
