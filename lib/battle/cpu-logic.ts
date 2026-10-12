/**
 * How the "Normal" CPU thinks. Pure functions over plain facts (no simulator import), so they can be unit tested.
 * Type maths is the site's own chart (lib/type-chart.ts), the same one the Pokédex uses.
 *
 * What it knows is what a human opponent would: its own team in full, and of the other side only the species on the field
 * (so types), HP percentage, status and stat changes. It never reads the player's moves, items or bench.
 */
import { effectiveness } from "../type-chart";
import type { PokemonType } from "../pokemon-types";

export interface MoveFacts {
  id: string;
  type: string;
  category: "Physical" | "Special" | "Status";
  basePower: number;
  /** Percent, or true for moves that never miss. */
  accuracy: number | true;
  priority: number;
  /** Fixed damage (Seismic Toss) or "level"; the base power doesn't apply. */
  fixedDamage: boolean;
  ohko: boolean;
  /** Two-turn, recharge or self-destructing moves are worth less than their power suggests. */
  charge: boolean;
  recharge: boolean;
  selfDestruct: boolean;
  heals: boolean;
  /** The major status the move inflicts on its target, if any. */
  inflicts: string | null;
  /** The move boosts the user's own stats (Swords Dance). */
  selfBoost: boolean;
  /** A side condition it sets on the target's side (Stealth Rock), if any. */
  hazard: string | null;
  protects: boolean;
}

export interface FighterFacts {
  types: string[];
  hpFraction: number;
  status: string;
  /** Sum of positive stat stages, to avoid stacking setup forever. */
  boostLevels: number;
  atk?: number;
  spa?: number;
}

/** Statuses a type is immune to, regardless of the move's own type. */
const STATUS_IMMUNE: Record<string, string[]> = {
  brn: ["fire"],
  par: ["electric"],
  psn: ["poison", "steel"],
  tox: ["poison", "steel"],
  frz: ["ice"],
};

const asTypes = (types: string[]) => types as PokemonType[];
const typeMultiplier = (attack: string, defenders: string[]) => effectiveness(attack as PokemonType, asTypes(defenders));

export const NO_GOOD_MOVE = -1000;

/** Higher is better; `NO_GOOD_MOVE` for a move that can't affect the target. */
export function scoreMove(move: MoveFacts, me: FighterFacts, foe: FighterFacts, foeSideConditions: string[], turn: number): number {
  if (move.category === "Status") return scoreStatusMove(move, me, foe, foeSideConditions, turn);

  const eff = typeMultiplier(move.type, foe.types);
  if (eff === 0) return NO_GOOD_MOVE; // the target is immune
  const power = move.ohko ? 30 : move.fixedDamage ? 50 : move.basePower || 60;
  const stab = me.types.includes(move.type) ? 1.5 : 1;
  const accuracy = move.accuracy === true ? 1 : move.accuracy / 100;
  let score = power * eff * stab * accuracy;

  // Use the side of the split the Pokémon is actually good at.
  if (me.atk && me.spa) {
    const stat = move.category === "Physical" ? me.atk : me.spa;
    score *= Math.max(0.35, stat / Math.max(me.atk, me.spa));
  }
  if (move.category === "Physical" && me.status === "brn") score *= 0.5;
  if (move.charge || move.recharge) score *= 0.55;
  if (move.selfDestruct) score *= me.hpFraction < 0.25 ? 0.9 : 0.25;
  if (move.priority > 0 && foe.hpFraction < 0.3) score *= 1.6;
  return score;
}

function scoreStatusMove(move: MoveFacts, me: FighterFacts, foe: FighterFacts, foeSideConditions: string[], turn: number): number {
  if (move.heals) return me.hpFraction <= 0.5 ? 70 : me.hpFraction < 0.8 ? 4 : 0;
  if (move.inflicts) {
    if (foe.status) return 0;
    if (STATUS_IMMUNE[move.inflicts]?.some((t) => foe.types.includes(t))) return NO_GOOD_MOVE;
    if (typeMultiplier(move.type, foe.types) === 0 && move.type !== "normal") return NO_GOOD_MOVE;
    return move.inflicts === "slp" ? 36 : 28;
  }
  if (move.selfBoost) return me.hpFraction > 0.7 && me.boostLevels < 2 ? 22 : 0;
  if (move.hazard) return !foeSideConditions.includes(move.hazard) && turn <= 6 && me.hpFraction > 0.5 ? 20 : 0;
  if (move.protects) return 2;
  return 6;
}

/** How well `me` fares against `foe` if both just trade their best hits: > 0 means the matchup favours `me`. */
export function matchupScore(me: { types: string[]; moveTypes: string[] }, foe: { types: string[]; moveTypes?: string[] }): number {
  const offence = Math.max(0, ...(me.moveTypes.length ? me.moveTypes : me.types).map((t) => typeMultiplier(t, foe.types) * (me.types.includes(t) ? 1.5 : 1)));
  // The foe's likely attacks are its own types (STAB), since its moves are unknown.
  const threats = foe.moveTypes?.length ? foe.moveTypes : foe.types;
  const defence = Math.max(0, ...threats.map((t) => typeMultiplier(t, me.types)));
  return offence - defence * 1.25;
}

/** True when the active Pokémon is badly placed: the foe's STAB hits it hard and it has nothing super effective in reply. */
export function isBadMatchup(me: { types: string[]; moveTypes: string[] }, foe: { types: string[] }): boolean {
  const incoming = Math.max(0, ...foe.types.map((t) => typeMultiplier(t, me.types)));
  const outgoing = Math.max(0, ...me.moveTypes.map((t) => typeMultiplier(t, foe.types)));
  return incoming >= 2 && outgoing < 2;
}

export interface BenchOption {
  /** 1-based position in the request's team (what "switch N" takes). */
  slot: number;
  types: string[];
  moveTypes: string[];
  hpFraction: number;
}

/** The bench Pokémon best placed against the foe, or null when nobody is clearly better than `currentScore`. */
export function bestSwitch(bench: BenchOption[], foe: { types: string[] }, currentScore: number | null): BenchOption | null {
  let best: BenchOption | null = null;
  let bestScore = -Infinity;
  for (const option of bench) {
    if (option.hpFraction <= 0) continue;
    const score = matchupScore(option, foe) + option.hpFraction * 0.5;
    if (score > bestScore) {
      best = option;
      bestScore = score;
    }
  }
  if (!best) return null;
  if (currentScore !== null && bestScore < currentScore + 1) return null; // not worth giving a free hit for
  return best;
}
