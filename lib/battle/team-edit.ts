/**
 * The arithmetic of building a battle team, with no simulator in it (so the builder's list screen and the tests stay light): stats, the EV
 * budget, natures and the EV presets. The stat formula is the simulator's own `statModify` (the same in every generation: the simulator
 * forces Gen 1-2 sets to maximum "stat experience" = 252 EVs and DVs = IVs rounded to even), and a test checks it against the simulator.
 */
import type { PokemonSet } from "@pkmn/sets";

export const STATS = ["hp", "atk", "def", "spa", "spd", "spe"] as const;
export type StatId = (typeof STATS)[number];
export type StatsTable = Record<StatId, number>;

export const STAT_LABEL: Record<StatId, string> = { hp: "HP", atk: "Atk", def: "Def", spa: "SpA", spd: "SpD", spe: "Spe" };

/** Gen 3 and later: 252 per stat, 510 in all. */
export const EV_STAT_CAP = 252;
export const EV_TOTAL_CAP = 510;
export const IV_MAX = 31;

/** The two things that change in Gens 1-2: no natures, no abilities, and every stat carries full "stat experience" (shown as 252 EVs). */
export const hasNatures = (gen: number) => gen >= 3;
export const hasAbilities = (gen: number) => gen >= 3;
export const hasTera = (gen: number) => gen >= 9;
/** Gens 1-2 do not have the 510 total; every EV is simply maxed. */
export const hasEvBudget = (gen: number) => gen >= 3;

export const fullTable = (value: number): StatsTable => ({ hp: value, atk: value, def: value, spa: value, spd: value, spe: value });

export const evTotal = (evs: StatsTable) => STATS.reduce((sum, stat) => sum + evs[stat], 0);

/**
 * Sets one EV and keeps the rules: 0 to 252, and (Gen 3+) no more than the 510 total allows given the other five. The value is rounded
 * down to what is reachable; nothing is ever taken from another stat.
 */
export function setEv(evs: StatsTable, stat: StatId, value: number, gen: number): StatsTable {
  const wanted = Number.isFinite(value) ? Math.floor(value) : 0;
  let capped = Math.max(0, Math.min(EV_STAT_CAP, wanted));
  if (hasEvBudget(gen)) capped = Math.min(capped, Math.max(0, EV_TOTAL_CAP - (evTotal(evs) - evs[stat])));
  return { ...evs, [stat]: capped };
}

export const setIv = (ivs: StatsTable, stat: StatId, value: number): StatsTable => ({ ...ivs, [stat]: Math.max(0, Math.min(IV_MAX, Number.isFinite(value) ? Math.floor(value) : IV_MAX)) });

// ---- natures -----------------------------------------------------------------------------------------------------------

type Boosted = Exclude<StatId, "hp">;
const NATURE_TABLE: Record<string, [Boosted, Boosted] | null> = {
  Hardy: null, Docile: null, Serious: null, Bashful: null, Quirky: null,
  Lonely: ["atk", "def"], Brave: ["atk", "spe"], Adamant: ["atk", "spa"], Naughty: ["atk", "spd"],
  Bold: ["def", "atk"], Relaxed: ["def", "spe"], Impish: ["def", "spa"], Lax: ["def", "spd"],
  Timid: ["spe", "atk"], Hasty: ["spe", "def"], Jolly: ["spe", "spa"], Naive: ["spe", "spd"],
  Modest: ["spa", "atk"], Mild: ["spa", "def"], Quiet: ["spa", "spe"], Rash: ["spa", "spd"],
  Calm: ["spd", "atk"], Gentle: ["spd", "def"], Sassy: ["spd", "spe"], Careful: ["spd", "spa"],
};
export const NATURES = Object.keys(NATURE_TABLE);

/** [raised stat, lowered stat], or null for a neutral nature. */
export const natureEffect = (nature: string): [Boosted, Boosted] | null => NATURE_TABLE[nature] ?? null;

/** "+Atk −SpA" for the nature dropdown. */
export function natureLabel(nature: string): string {
  const effect = natureEffect(nature);
  return effect ? `${nature} (+${STAT_LABEL[effect[0]]} −${STAT_LABEL[effect[1]]})` : `${nature} (neutral)`;
}

// ---- stats -------------------------------------------------------------------------------------------------------------

/** One stat, exactly as the simulator computes it (Shedinja's single HP is applied by the caller via `base.hp === 1`). */
export function calcStat(stat: StatId, base: number, iv: number, ev: number, level: number, nature: string): number {
  if (stat === "hp") {
    if (base === 1) return 1; // Shedinja
    return Math.floor(((2 * base + iv + Math.floor(ev / 4) + 100) * level) / 100 + 10);
  }
  let value = Math.floor(((2 * base + iv + Math.floor(ev / 4)) * level) / 100 + 5);
  const effect = natureEffect(nature);
  if (effect?.[0] === stat) value = Math.floor((value * 110) / 100);
  else if (effect?.[1] === stat) value = Math.floor((value * 90) / 100);
  return value;
}

export function calcStats(base: StatsTable, set: Pick<PokemonSet, "ivs" | "evs" | "level" | "nature">, gen: number): StatsTable {
  const nature = hasNatures(gen) ? set.nature : "";
  const out = {} as StatsTable;
  // Gens 1-2 keep DVs, which the simulator turns into even IVs (31 becomes 30).
  for (const stat of STATS) out[stat] = calcStat(stat, base[stat], gen <= 2 ? set.ivs[stat] - (set.ivs[stat] % 2) : set.ivs[stat], set.evs[stat], set.level, nature);
  return out;
}

// ---- presets -----------------------------------------------------------------------------------------------------------

export interface EvPreset {
  key: string;
  label: string;
  /** Adds up to at most the 510 cap. */
  evs: Partial<StatsTable>;
  /** The natures that suit it: the first is used. */
  natures: string[];
  hint: string;
}

export const EV_PRESETS: EvPreset[] = [
  { key: "physical-sweeper", label: "Physical sweeper", evs: { atk: 252, spe: 252, hp: 4 }, natures: ["Jolly", "Adamant"], hint: "252 Atk / 252 Spe / 4 HP, Jolly" },
  { key: "special-sweeper", label: "Special sweeper", evs: { spa: 252, spe: 252, hp: 4 }, natures: ["Timid", "Modest"], hint: "252 SpA / 252 Spe / 4 HP, Timid" },
  { key: "physical-wall", label: "Physical wall", evs: { hp: 252, def: 252, spd: 4 }, natures: ["Bold", "Impish"], hint: "252 HP / 252 Def / 4 SpD, Bold" },
  { key: "special-wall", label: "Special wall", evs: { hp: 252, spd: 252, def: 4 }, natures: ["Calm", "Careful"], hint: "252 HP / 252 SpD / 4 Def, Calm" },
  { key: "bulky-physical", label: "Bulky attacker", evs: { hp: 252, atk: 252, spd: 4 }, natures: ["Adamant", "Brave"], hint: "252 HP / 252 Atk / 4 SpD, Adamant" },
  { key: "bulky-special", label: "Bulky special attacker", evs: { hp: 252, spa: 252, spd: 4 }, natures: ["Modest", "Quiet"], hint: "252 HP / 252 SpA / 4 SpD, Modest" },
];

/** The set with a preset applied: its EVs replace the old ones (never above the cap) and its nature is used where natures exist. */
export function applyPreset<S extends Pick<PokemonSet, "evs" | "nature">>(set: S, preset: EvPreset, gen: number): S {
  if (!hasEvBudget(gen)) return set;
  const evs = { ...fullTable(0), ...preset.evs };
  return { ...set, evs, nature: hasNatures(gen) ? preset.natures[0] : set.nature };
}

/** Default EVs for a new member: none for Gen 3+ (the builder starts blank and the player chooses), maxed for Gens 1-2. */
export const defaultEvs = (gen: number): StatsTable => fullTable(hasEvBudget(gen) ? 0 : EV_STAT_CAP);
