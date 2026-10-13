/**
 * How the "Normal" CPU thinks. Pure functions over plain facts (no simulator import), so they can be unit tested.
 *
 * Type matchups come in through `TypeMath`, built from the simulator's own data for the format's generation (dex-facts.ts
 * `dexTypeMath`), not from the site's modern chart: Gen 1 has Ghost doing nothing to Psychic, Gens 2-5 have Steel resisting Ghost and
 * Dark, and so on. For Gen 6 and later the two agree (a test keeps it so).
 *
 * What it knows is what a human opponent would: its own team in full, and of the other side only the species on the field
 * (so types), HP percentage, status, stat changes, and an ability once it has been shown (Levitate after a Ground move fails).
 */

/** Damage multiplier of one attacking type against a (possibly dual-typed) defender in the battle's generation: 0, 0.25, 0.5, 1, 2, 4. */
export interface TypeMath {
  multiplier(attack: string, defenders: string[]): number;
}

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
  /** Sound-based (Soundproof stops it) and ball/bomb (Bulletproof stops it). */
  sound?: boolean;
  bullet?: boolean;
}

export interface FighterFacts {
  types: string[];
  hpFraction: number;
  status: string;
  /** Sum of positive stat stages, to avoid stacking setup forever. */
  boostLevels: number;
  atk?: number;
  spa?: number;
  /** The foe's ability, only once it has been revealed in the battle. */
  ability?: string | null;
  /** The user's own ability ignores the target's (Mold Breaker, Teravolt, Turboblaze). */
  ignoresAbilities?: boolean;
}

/** Statuses a type is immune to, regardless of the move's own type. */
const STATUS_IMMUNE: Record<string, string[]> = {
  brn: ["fire"],
  par: ["electric"],
  psn: ["poison", "steel"],
  tox: ["poison", "steel"],
  frz: ["ice"],
};

export const NO_GOOD_MOVE = -1000;

const toId = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, "");

/** Abilities that make their holder immune to (or absorb) every move of one type, and the first generation where that is so. */
const TYPE_IMMUNITY_ABILITIES: Record<string, { type: string; fromGen: number }> = {
  levitate: { type: "ground", fromGen: 3 },
  flashfire: { type: "fire", fromGen: 3 },
  wellbakedbody: { type: "fire", fromGen: 9 },
  waterabsorb: { type: "water", fromGen: 3 },
  stormdrain: { type: "water", fromGen: 5 }, // in Gen 4 it only redirects, in doubles
  dryskin: { type: "water", fromGen: 4 },
  voltabsorb: { type: "electric", fromGen: 3 },
  lightningrod: { type: "electric", fromGen: 5 },
  motordrive: { type: "electric", fromGen: 4 },
  sapsipper: { type: "grass", fromGen: 5 },
  eartheater: { type: "ground", fromGen: 9 },
};

/** True when the target's revealed ability makes this move useless against it. */
export function abilityBlocks(move: MoveFacts, ability: string | null | undefined, gen: number, effectiveness: number): boolean {
  if (!ability) return false;
  const id = toId(ability);
  const immunity = TYPE_IMMUNITY_ABILITIES[id];
  if (immunity && gen >= immunity.fromGen && immunity.type === move.type) return true;
  if (id === "soundproof" && move.sound) return true;
  if (id === "bulletproof" && move.bullet) return true;
  // Wonder Guard: only super effective hits (and fixed-damage / status effects aren't stopped by it in the way that matters here).
  if (id === "wonderguard" && move.category !== "Status" && !move.fixedDamage && effectiveness <= 1) return true;
  return false;
}

/** The generation a `TypeMath` was built for matters for abilities; carried alongside it. */
export interface Matchup {
  math: TypeMath;
  gen: number;
}

/** Higher is better; `NO_GOOD_MOVE` for a move that can't affect the target. */
export function scoreMove(move: MoveFacts, me: FighterFacts, foe: FighterFacts, foeSideConditions: string[], turn: number, matchup: Matchup): number {
  const { math, gen } = matchup;
  const eff = math.multiplier(move.type, foe.types);
  const blocked = !me.ignoresAbilities && abilityBlocks(move, foe.ability, gen, eff);
  if (move.category === "Status") return scoreStatusMove(move, me, foe, foeSideConditions, turn, math, blocked);

  if (eff === 0 || blocked) return NO_GOOD_MOVE; // the target is immune
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

function scoreStatusMove(move: MoveFacts, me: FighterFacts, foe: FighterFacts, foeSideConditions: string[], turn: number, math: TypeMath, blocked: boolean): number {
  if (move.heals) return me.hpFraction <= 0.5 ? 70 : me.hpFraction < 0.8 ? 4 : 0;
  if (move.inflicts) {
    if (foe.status) return 0;
    if (blocked) return NO_GOOD_MOVE; // Volt Absorb takes Thunder Wave, Flash Fire takes Will-O-Wisp
    if (STATUS_IMMUNE[move.inflicts]?.some((t) => foe.types.includes(t))) return NO_GOOD_MOVE;
    if (math.multiplier(move.type, foe.types) === 0 && move.type !== "normal") return NO_GOOD_MOVE;
    return move.inflicts === "slp" ? 36 : 28;
  }
  if (move.selfBoost) return me.hpFraction > 0.7 && me.boostLevels < 2 ? 22 : 0;
  if (move.hazard) return !foeSideConditions.includes(move.hazard) && turn <= 6 && me.hpFraction > 0.5 ? 20 : 0;
  if (move.protects) return 2;
  return 6;
}

/** How well `me` fares against `foe` if both just trade their best hits: > 0 means the matchup favours `me`. */
export function matchupScore(me: { types: string[]; moveTypes: string[] }, foe: { types: string[]; moveTypes?: string[] }, math: TypeMath): number {
  const offence = Math.max(0, ...(me.moveTypes.length ? me.moveTypes : me.types).map((t) => math.multiplier(t, foe.types) * (me.types.includes(t) ? 1.5 : 1)));
  // The foe's likely attacks are its own types (STAB), since its moves are unknown.
  const threats = foe.moveTypes?.length ? foe.moveTypes : foe.types;
  const defence = Math.max(0, ...threats.map((t) => math.multiplier(t, me.types)));
  return offence - defence * 1.25;
}

/** True when the active Pokémon is badly placed: the foe's STAB hits it hard and it has nothing super effective in reply. */
export function isBadMatchup(me: { types: string[]; moveTypes: string[] }, foe: { types: string[] }, math: TypeMath): boolean {
  const incoming = Math.max(0, ...foe.types.map((t) => math.multiplier(t, me.types)));
  const outgoing = Math.max(0, ...me.moveTypes.map((t) => math.multiplier(t, foe.types)));
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
export function bestSwitch(bench: BenchOption[], foe: { types: string[] }, currentScore: number | null, math: TypeMath): BenchOption | null {
  let best: BenchOption | null = null;
  let bestScore = -Infinity;
  for (const option of bench) {
    if (option.hpFraction <= 0) continue;
    const score = matchupScore(option, foe, math) + option.hpFraction * 0.5;
    if (score > bestScore) {
      best = option;
      bestScore = score;
    }
  }
  if (!best) return null;
  if (currentScore !== null && bestScore < currentScore + 1) return null; // not worth giving a free hit for
  return best;
}
