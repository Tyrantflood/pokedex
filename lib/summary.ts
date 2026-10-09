import type { Pokemon, PokemonType } from "./pokemon-types";
import { generationOf } from "./generations";
import { spriteUrl } from "./sprites";

/** The slim shape sent to the browser: only what a card and the filters need. */
export interface PokemonSummary {
  id: number;
  number: number;
  name: string;
  /** "Mega", "G-Max" or a region name for notable forms; null otherwise. */
  tag: string | null;
  types: PokemonType[];
  image: string;
  generation: number;
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
    tag: formTag(p),
    types: p.types,
    // Official artwork is smooth at card size; pixel sprite and placeholder are fallbacks.
    image: p.artwork.normal ?? spriteUrl(p),
    generation: generationOf(p.number),
  };
}
