export interface BattleFormat {
  key: string;
  label: string;
  /** What the simulator runs the battle as. */
  formatId: string;
  /** Which team generator to use: "natdex" (merged, see teams.ts) or a Showdown random battle format id. */
  generator: string;
  gen: number;
  note: string;
}

const gens = [9, 8, 7, 6, 5, 4, 3, 2, 1];

const MECHANICS: Record<number, string> = {
  9: "Terastallization",
  8: "Dynamax",
  7: "Z-Moves and Mega Evolution",
  6: "Mega Evolution",
};

export const FORMATS: BattleFormat[] = [
  {
    key: "natdex",
    label: "National Dex · all generations",
    // No Team Preview: random teams are played blind, as in Showdown's random battles.
    formatId: "gen9nationaldex@@@!Team Preview",
    generator: "natdex",
    gen: 9,
    note: "One team mixing Pokémon from every generation, with Gen 9 mechanics, Megas and Terastallization.",
  },
  ...gens.map((gen) => ({
    key: `gen${gen}`,
    label: `Generation ${gen}`,
    // The simulator's random battle rules for Gens 4-9 lack the Endless Battle Clause that Gens 1-3 and National Dex have; add it so a battle
    // that can only loop is ended by the simulator itself, with or without a turn limit of ours.
    formatId: gen >= 4 ? `gen${gen}randombattle@@@Endless Battle Clause` : `gen${gen}randombattle`,
    generator: `gen${gen}randombattle`,
    gen,
    note: MECHANICS[gen] ? `Random battle with ${MECHANICS[gen]}.` : "Random battle.",
  })),
];

export const DEFAULT_FORMAT = FORMATS[0];

export function formatByKey(key: string | null | undefined): BattleFormat {
  return FORMATS.find((f) => f.key === key) ?? DEFAULT_FORMAT;
}
