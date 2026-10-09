export type PokemonType =
  | "normal"
  | "fire"
  | "water"
  | "electric"
  | "grass"
  | "ice"
  | "fighting"
  | "poison"
  | "ground"
  | "flying"
  | "psychic"
  | "bug"
  | "rock"
  | "ghost"
  | "dragon"
  | "dark"
  | "steel"
  | "fairy"
  | "stellar"
  | "unknown";

export type FormKind = "base" | "mega" | "gmax" | "regional" | "other";

export interface PokemonForm {
  kind: FormKind;
  /** Suffix after the species name, e.g. "mega-x", "alola". Null for the default form. */
  suffix: string | null;
  /** Region for regional forms: "alola" | "galar" | "hisui" | "paldea". */
  region: string | null;
}

export interface PokemonStats {
  hp: number;
  attack: number;
  defense: number;
  specialAttack: number;
  specialDefense: number;
  speed: number;
}

export interface PokemonAbility {
  name: string;
  hidden: boolean;
}

export interface PokemonSpritePair {
  normal: string | null;
  shiny: string | null;
}

export interface Pokemon {
  /** PokéAPI pokemon id. Unique per form (e.g. 10034 for Mega Charizard X). */
  id: number;
  /** National Dex number — shared by all forms of a species. */
  number: number;
  name: string;
  species: string;
  form: PokemonForm;
  /** Types of this specific form (Mega/regional forms can differ from the base). */
  types: PokemonType[];
  /** Pixel sprites. */
  sprites: PokemonSpritePair;
  /** Official artwork; fallback when a form has no pixel sprite. */
  artwork: PokemonSpritePair;
  /** Animated (GIF) Showdown sprites; null where PokéAPI has none. */
  animated: PokemonSpritePair;
  stats: PokemonStats;
  abilities: PokemonAbility[];
  /** Height in decimetres (PokéAPI units). */
  height: number;
  /** Weight in hectograms (PokéAPI units). */
  weight: number;
  cries: { latest: string | null; legacy: string | null };
}
