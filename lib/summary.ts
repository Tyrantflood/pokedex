import type { Pokemon, PokemonAbility, PokemonStats, PokemonType } from "./pokemon-types";
import { generationOf } from "./generations";
import { PLACEHOLDER_SPRITE } from "./sprites";

/** The slim shape sent to the browser: only what a card and the filters need. */
export interface PokemonSummary {
  id: number;
  number: number;
  name: string;
  /** Species name, used to look up the evolution chain. */
  species: string;
  /** "Mega", "G-Max" or a region name for notable forms; null otherwise. */
  tag: string | null;
  types: PokemonType[];
  /** Card image: the small pixel sprite when there is one, else artwork, else a placeholder. */
  sprite: string;
  /** True only for real pixel sprites, which should be drawn with crisp edges. */
  pixel: boolean;
  /** Official artwork for the detail view (null if the form has none). */
  artwork: string | null;
  generation: number;
  stats: PokemonStats;
  abilities: PokemonAbility[];
  /** Decimetres / hectograms, as PokéAPI reports them. */
  height: number;
  weight: number;
}

function formTag(p: Pokemon): string | null {
  switch (p.form.kind) {
    case "mega":
      return "Mega";
    case "gmax":
      return "G-Max";
    case "regional":
      return p.form.region ? p.form.region[0].toUpperCase() + p.form.region.slice(1) : null;
    default:
      return null;
  }
}

export function toSummary(p: Pokemon): PokemonSummary {
  return {
    id: p.id,
    number: p.number,
    name: p.name,
    species: p.species,
    tag: formTag(p),
    types: p.types,
    sprite: p.sprites.normal ?? p.artwork.normal ?? PLACEHOLDER_SPRITE,
    pixel: p.sprites.normal !== null,
    artwork: p.artwork.normal,
    generation: generationOf(p.number),
    stats: p.stats,
    abilities: p.abilities,
    height: p.height,
    weight: p.weight,
  };
}
