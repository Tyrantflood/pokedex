import type { PokemonType } from "./pokemon-types";
import { CHART_TYPES, effectiveness } from "./type-chart";

// ---------------------------------------------------------------------------------------------------------------------
// The team and how it is stored
// ---------------------------------------------------------------------------------------------------------------------

export const TEAM_SIZE = 6;
/** localStorage key of the saved team. */
export const TEAM_STORAGE_KEY = "pokedex:team";
export const TEAM_VERSION = 1;

/**
 * One slot of a team. It is an object, not a bare id, so that a battle team builder can later give each member its own
 * moves, item, ability, nature, EVs and IVs without changing how a team is stored or moved around: every operation
 * here passes whole members, and the saved team carries a `version` for migrating older saves.
 * Those fields are deliberately not here yet.
 */
export interface TeamMember {
  /** PokéAPI id of the Pokémon or form (e.g. 10103 for Alolan Vulpix). */
  pokemonId: number;
}

export interface Team {
  version: typeof TEAM_VERSION;
  /** Always TEAM_SIZE long; null is an empty slot. */
  slots: (TeamMember | null)[];
}

export const emptyTeam = (): Team => ({ version: TEAM_VERSION, slots: Array.from({ length: TEAM_SIZE }, () => null) });

export const teamMembers = (team: Team): TeamMember[] => team.slots.filter((slot): slot is TeamMember => slot !== null);
export const memberCount = (team: Team) => teamMembers(team).length;
export const slotOf = (team: Team, pokemonId: number) => team.slots.findIndex((slot) => slot?.pokemonId === pokemonId);

/**
 * Turns whatever was saved into a valid team. Anything wrong (not an object, another version, a bad id, a Pokémon that
 * no longer exists, a duplicate, too many or too few slots) is dropped or padded rather than thrown, so a damaged save
 * can never stop the app from loading. `isKnown` lets the caller drop ids that are not in the Pokédex.
 */
export function parseTeam(raw: unknown, isKnown: (pokemonId: number) => boolean = () => true): Team {
  const team = emptyTeam();
  if (typeof raw !== "object" || raw === null) return team;
  const saved = raw as { version?: unknown; slots?: unknown };
  // When the stored shape changes, migrate older versions here. Today there is only one.
  if (saved.version !== TEAM_VERSION || !Array.isArray(saved.slots)) return team;

  const seen = new Set<number>();
  saved.slots.slice(0, TEAM_SIZE).forEach((slot: unknown, index) => {
    const id = typeof slot === "object" && slot !== null ? (slot as { pokemonId?: unknown }).pokemonId : undefined;
    if (typeof id !== "number" || !Number.isInteger(id) || id < 1 || seen.has(id) || !isKnown(id)) return;
    seen.add(id);
    team.slots[index] = { pokemonId: id };
  });
  return team;
}

export const serializeTeam = (team: Team): string => JSON.stringify(team);

export type AddResult = { ok: true; team: Team; slot: number } | { ok: false; reason: "full" | "duplicate" | "bad-slot" };

/**
 * Puts a member on the team: in `slot` if given (replacing whoever is there), otherwise in the first empty slot.
 * The same Pokémon can't be on the team twice.
 */
export function addMember(team: Team, member: TeamMember, slot?: number): AddResult {
  if (slot !== undefined && (!Number.isInteger(slot) || slot < 0 || slot >= TEAM_SIZE)) return { ok: false, reason: "bad-slot" };
  const existing = slotOf(team, member.pokemonId);
  if (existing !== -1) return { ok: false, reason: "duplicate" };
  const target = slot ?? team.slots.findIndex((s) => s === null);
  if (target === -1) return { ok: false, reason: "full" };
  const slots = [...team.slots];
  slots[target] = member;
  return { ok: true, team: { ...team, slots }, slot: target };
}

export function removeMember(team: Team, slot: number): Team {
  if (slot < 0 || slot >= TEAM_SIZE || team.slots[slot] === null) return team;
  const slots = [...team.slots];
  slots[slot] = null;
  return { ...team, slots };
}

// ---------------------------------------------------------------------------------------------------------------------
// What the team is weak to
// ---------------------------------------------------------------------------------------------------------------------

export interface TypeExposure {
  /** The attacking type. */
  type: PokemonType;
  /** How many members take more than normal damage from it. */
  weak: number;
  /** How many take less (but not none). */
  resist: number;
  /** How many take none. */
  immune: number;
  /** The biggest multiplier any member takes (0 to 4). */
  worst: number;
  /** Each member's multiplier, in team order. */
  perMember: number[];
}

export interface TeamAnalysis {
  /** How many members were analysed. */
  size: number;
  /** All 18 types, in chart order. */
  exposures: TypeExposure[];
  /** Types at least one member is weak to: most members first, then the harshest hit. */
  weaknesses: TypeExposure[];
  /** Types at least one member resists or is immune to: the most members first. */
  resistances: TypeExposure[];
  /** Types the *whole* team is weak to. Needs at least two members, or "the whole team" would just be one Pokémon. */
  flagged: PokemonType[];
  /** Types somebody is weak to and nobody resists or is immune to (so nothing on the team answers them), worst first. Includes the flagged ones. */
  gaps: PokemonType[];
}

const answers = (e: TypeExposure) => e.resist + e.immune;
const chartOrder = (a: TypeExposure, b: TypeExposure) => CHART_TYPES.indexOf(a.type) - CHART_TYPES.indexOf(b.type);

/** Combines every member's typing against every attacking type, with the same chart (and dual-type maths) as everywhere else. */
export function analyseTeam(memberTypes: PokemonType[][]): TeamAnalysis {
  const exposures: TypeExposure[] = CHART_TYPES.map((type) => {
    const perMember = memberTypes.map((types) => effectiveness(type, types));
    return {
      type,
      weak: perMember.filter((m) => m > 1).length,
      resist: perMember.filter((m) => m > 0 && m < 1).length,
      immune: perMember.filter((m) => m === 0).length,
      worst: Math.max(0, ...perMember),
      perMember,
    };
  });
  const size = memberTypes.length;
  const weaknesses = exposures.filter((e) => e.weak > 0).sort((a, b) => b.weak - a.weak || b.worst - a.worst || chartOrder(a, b));
  const resistances = exposures.filter((e) => answers(e) > 0).sort((a, b) => answers(b) - answers(a) || chartOrder(a, b));
  const flagged = size >= 2 ? exposures.filter((e) => e.weak === size).sort((a, b) => b.worst - a.worst || chartOrder(a, b)).map((e) => e.type) : [];
  const gaps = exposures
    .filter((e) => e.weak > 0 && answers(e) === 0)
    .sort((a, b) => b.weak - a.weak || b.worst - a.worst || chartOrder(a, b))
    .map((e) => e.type);
  return { size, exposures, weaknesses, resistances, flagged, gaps };
}

// ---------------------------------------------------------------------------------------------------------------------
// Who would cover the gaps
// ---------------------------------------------------------------------------------------------------------------------

export interface Candidate {
  id: number;
  species: string;
  name: string;
  types: PokemonType[];
  /** Base-stat total: a small tie-break so sturdier Pokémon come first. */
  total: number;
}

export interface Suggestion {
  candidate: Candidate;
  score: number;
  /** The gap types this Pokémon resists or is immune to. */
  covers: PokemonType[];
  /** Types the team is already weak to that this Pokémon is weak to as well (it would pile on). */
  piles: PokemonType[];
}

/**
 * Pokémon that would answer the team's gaps, best first.
 *
 * Each gap counts as many times as members are weak to it (double when the whole team is). A candidate scores for every
 * gap it resists (x1; x1.25 for a double resistance; x1.5 for an immunity), loses points for every gap it is itself weak
 * to, and loses a little for each type it would add a *second* weakness to. The base-stat total is only a tie-break.
 * Anything that doesn't cover at least one gap is not suggested, and neither is anything already on the team.
 */
export function suggestCoverage(analysis: TeamAnalysis, candidates: Candidate[], onTeam: { ids: Set<number>; species: Set<string> }, limit = 5): Suggestion[] {
  if (analysis.gaps.length === 0) return [];
  const exposure = new Map(analysis.exposures.map((e) => [e.type, e]));
  const flagged = new Set(analysis.flagged);
  const suggestions: Suggestion[] = [];

  for (const candidate of candidates) {
    if (onTeam.ids.has(candidate.id) || onTeam.species.has(candidate.species)) continue;
    let score = 0;
    const covers: PokemonType[] = [];
    for (const gap of analysis.gaps) {
      const need = (exposure.get(gap)?.weak ?? 1) * (flagged.has(gap) ? 2 : 1);
      const multiplier = effectiveness(gap, candidate.types);
      if (multiplier === 0) score += need * 1.5;
      else if (multiplier <= 0.25) score += need * 1.25;
      else if (multiplier < 1) score += need;
      else if (multiplier > 1) score -= need * 0.75;
      if (multiplier < 1) covers.push(gap);
    }
    if (covers.length === 0) continue;

    const piles: PokemonType[] = [];
    for (const e of analysis.exposures) {
      if (e.weak >= 1 && !analysis.gaps.includes(e.type) && effectiveness(e.type, candidate.types) > 1) piles.push(e.type);
    }
    score -= piles.reduce((sum, type) => sum + (exposure.get(type)?.weak ?? 0) * 0.25, 0);
    score += candidate.total / 1000;
    if (score <= 0) continue;
    suggestions.push({ candidate, score, covers, piles });
  }

  return suggestions.sort((a, b) => b.score - a.score || b.candidate.total - a.candidate.total || a.candidate.id - b.candidate.id).slice(0, limit);
}
