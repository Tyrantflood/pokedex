import type { PokemonType } from "./pokemon-types";

/**
 * The standard (Gen 6+) type effectiveness chart, as the attacking type's super-effective,
 * not-very-effective and no-effect targets. Anything not listed is neutral (x1). Stellar and
 * "unknown" have no entries, so they are neutral both ways. Checked against every PokéAPI
 * `type/{name}` damage_relations entry by the comparison tests.
 */
const CHART: Partial<Record<PokemonType, { double?: PokemonType[]; half?: PokemonType[]; none?: PokemonType[] }>> = {
  normal: { half: ["rock", "steel"], none: ["ghost"] },
  fire: { double: ["grass", "ice", "bug", "steel"], half: ["fire", "water", "rock", "dragon"] },
  water: { double: ["fire", "ground", "rock"], half: ["water", "grass", "dragon"] },
  electric: { double: ["water", "flying"], half: ["electric", "grass", "dragon"], none: ["ground"] },
  grass: { double: ["water", "ground", "rock"], half: ["fire", "grass", "poison", "flying", "bug", "dragon", "steel"] },
  ice: { double: ["grass", "ground", "flying", "dragon"], half: ["fire", "water", "ice", "steel"] },
  fighting: { double: ["normal", "ice", "rock", "dark", "steel"], half: ["poison", "flying", "psychic", "bug", "fairy"], none: ["ghost"] },
  poison: { double: ["grass", "fairy"], half: ["poison", "ground", "rock", "ghost"], none: ["steel"] },
  ground: { double: ["fire", "electric", "poison", "rock", "steel"], half: ["grass", "bug"], none: ["flying"] },
  flying: { double: ["grass", "fighting", "bug"], half: ["electric", "rock", "steel"] },
  psychic: { double: ["fighting", "poison"], half: ["psychic", "steel"], none: ["dark"] },
  bug: { double: ["grass", "psychic", "dark"], half: ["fire", "fighting", "poison", "flying", "ghost", "steel", "fairy"] },
  rock: { double: ["fire", "ice", "flying", "bug"], half: ["fighting", "ground", "steel"] },
  ghost: { double: ["psychic", "ghost"], half: ["dark"], none: ["normal"] },
  dragon: { double: ["dragon"], half: ["steel"], none: ["fairy"] },
  dark: { double: ["psychic", "ghost"], half: ["fighting", "dark", "fairy"] },
  steel: { double: ["ice", "rock", "fairy"], half: ["fire", "water", "electric", "steel"] },
  fairy: { double: ["fighting", "dragon", "dark"], half: ["fire", "poison", "steel"] },
};

export const CHART_TYPES = Object.keys(CHART) as PokemonType[];

/** Damage multiplier of one attacking type against one defending type: 0, 0.5, 1 or 2. */
export function multiplier(attack: PokemonType, defend: PokemonType): number {
  const row = CHART[attack];
  if (!row) return 1;
  if (row.none?.includes(defend)) return 0;
  if (row.double?.includes(defend)) return 2;
  if (row.half?.includes(defend)) return 0.5;
  return 1;
}

/** Multiplier against a (possibly dual-typed) defender: the product, so 0, 0.25, 0.5, 1, 2 or 4. */
export function effectiveness(attack: PokemonType, defenders: PokemonType[]): number {
  return defenders.reduce((m, d) => m * multiplier(attack, d), 1);
}

export interface Matchup {
  attacker: PokemonType;
  multiplier: number;
  /** How each of the defender's types contributed, e.g. fire vs [grass x2, poison x1]. */
  breakdown: { defender: PokemonType; multiplier: number }[];
}

/** For each of the attacker's types (its STAB moves), how effective it is against the defender. */
export function matchups(attackerTypes: PokemonType[], defenderTypes: PokemonType[]): Matchup[] {
  return attackerTypes.map((attacker) => ({
    attacker,
    multiplier: effectiveness(attacker, defenderTypes),
    breakdown: defenderTypes.map((defender) => ({ defender, multiplier: multiplier(attacker, defender) })),
  }));
}

/** The best multiplier any of the attacker's types achieves (its STAB ceiling). */
export function bestMultiplier(attackerTypes: PokemonType[], defenderTypes: PokemonType[]): number {
  return Math.max(0, ...matchups(attackerTypes, defenderTypes).map((m) => m.multiplier));
}

const LABELS: Record<number, string> = { 0: "No effect", 0.25: "×¼", 0.5: "×½", 1: "×1", 2: "×2", 4: "×4" };
export const multiplierLabel = (m: number) => LABELS[m] ?? `×${m}`;

export function multiplierVerdict(m: number): string {
  if (m === 0) return "no effect";
  if (m >= 4) return "devastating";
  if (m > 1) return "super effective";
  if (m === 1) return "neutral";
  if (m <= 0.25) return "barely scratches";
  return "not very effective";
}

/** The multipliers a defender can end up with that are not neutral, in the order they are listed: weaknesses, resistances, immunities. */
export const DEFENSE_BUCKETS = [4, 2, 0.5, 0.25, 0] as const;
export type DefenseMultiplier = (typeof DEFENSE_BUCKETS)[number];

export interface DefenseGroup {
  multiplier: DefenseMultiplier;
  /** The attacking types that hit this defender for that multiplier, in chart order. */
  types: PokemonType[];
}

/**
 * How every attacking type fares against a defender (one or two types), grouped by multiplier: x4, x2, x0.5, x0.25, x0.
 * Neutral matchups are left out, and so are empty groups. A dual type is the product of its two halves, so a weakness
 * and a resistance cancel out (it lands in no group), and an immunity beats any weakness (x0, never x2 or x4).
 */
export function defenseProfile(defenders: PokemonType[]): DefenseGroup[] {
  return DEFENSE_BUCKETS.map((multiplier) => ({
    multiplier,
    types: CHART_TYPES.filter((attacker) => effectiveness(attacker, defenders) === multiplier),
  })).filter((group) => group.types.length > 0);
}
