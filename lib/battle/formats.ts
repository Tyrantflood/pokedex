export interface BattleFormat {
  key: string;
  label: string;
  /** What the simulator runs the battle as. */
  formatId: string;
  /** Which team generator to use: "natdex" (merged, see teams.ts) or a Showdown random battle format id. */
  generator: string;
  gen: number;
  note: string;
  /** "Bring your own team": the players choose their teams (from My Teams or the recommended ones) instead of being given random ones. */
  custom: boolean;
}

const gens = [9, 8, 7, 6, 5, 4, 3, 2, 1];

const MECHANICS: Record<number, string> = {
  9: "Terastallization",
  8: "Dynamax",
  7: "Z-Moves and Mega Evolution",
  6: "Mega Evolution",
};

/**
 * "Bring your own team" formats: Smogon's OU tier for each generation, National Dex (Gen 9) and Anything Goes (Gen 9, no bans at all). The
 * simulator checks teams against each format's own rules and bans. They keep the simulator's own Team Preview rule: from Gen 5 on both players see
 * each other's six Pokémon and choose a lead, as on Showdown (Gens 1-4 never had one). The Endless Battle Clause is part of every one of these tiers.
 */
function teamFormats(): BattleFormat[] {
  const ou = gens.map((gen) => ({
    key: `team-gen${gen}ou`,
    label: `Gen ${gen} OU`,
    formatId: `gen${gen}ou`,
    generator: "",
    gen,
    note: `Smogon's OverUsed tier for Generation ${gen}. Bring a team that passes the simulator's validator.`,
    custom: true,
  }));
  return [
    {
      key: "team-natdex",
      label: "National Dex",
      formatId: "gen9nationaldex",
      generator: "",
      gen: 9,
      note: "Gen 9 mechanics with every Pokémon back, past generations' moves and Mega Evolution. Smogon's National Dex tier.",
      custom: true,
    },
    ...ou,
    {
      key: "team-ag",
      label: "Anything Goes",
      formatId: "gen9anythinggoes",
      generator: "",
      gen: 9,
      note: "Gen 9 with nothing banned. Any legal Pokémon, move and item; for friends who don't want rules.",
      custom: true,
    },
  ];
}

export const FORMATS: BattleFormat[] = [
  {
    key: "natdex",
    label: "National Dex · all generations",
    // No Team Preview: random teams are played blind, as in Showdown's random battles.
    formatId: "gen9nationaldex@@@!Team Preview",
    generator: "natdex",
    gen: 9,
    note: "One team mixing Pokémon from every generation, with Gen 9 mechanics, Megas and Terastallization.",
    custom: false,
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
    custom: false,
  })),
  ...teamFormats(),
];

/** What the lobby and the builder say about leads: Team Preview from Gen 5 (the simulator's rule), none before. */
export function previewNote(format: Pick<BattleFormat, "gen" | "custom">): string {
  if (!format.custom) return "";
  return format.gen >= 5 ? "Team Preview: both players see each other's six Pokémon and choose a lead." : `Generation ${format.gen} has no team preview: your first Pokémon leads.`;
}

export const RANDOM_FORMATS = FORMATS.filter((f) => !f.custom);
export const TEAM_FORMATS = FORMATS.filter((f) => f.custom);

export const DEFAULT_FORMAT = FORMATS[0];

export function formatByKey(key: string | null | undefined): BattleFormat {
  return FORMATS.find((f) => f.key === key) ?? DEFAULT_FORMAT;
}
