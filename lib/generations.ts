export interface Generation {
  id: number;
  numeral: string;
  region: string;
  /** Inclusive National Dex range. */
  first: number;
  last: number;
}

export const GENERATIONS: Generation[] = [
  { id: 1, numeral: "I", region: "Kanto", first: 1, last: 151 },
  { id: 2, numeral: "II", region: "Johto", first: 152, last: 251 },
  { id: 3, numeral: "III", region: "Hoenn", first: 252, last: 386 },
  { id: 4, numeral: "IV", region: "Sinnoh", first: 387, last: 493 },
  { id: 5, numeral: "V", region: "Unova", first: 494, last: 649 },
  { id: 6, numeral: "VI", region: "Kalos", first: 650, last: 721 },
  { id: 7, numeral: "VII", region: "Alola", first: 722, last: 809 },
  { id: 8, numeral: "VIII", region: "Galar", first: 810, last: 905 },
  { id: 9, numeral: "IX", region: "Paldea", first: 906, last: 1025 },
];

/**
 * Generation a species debuted in, from its National Dex number. Alternate forms
 * share their species' generation (Mega Charizard is Gen I here, as in the Dex).
 * Numbers past the last known range fall into the newest generation.
 */
export function generationOf(number: number): number {
  const gen = GENERATIONS.find((g) => number >= g.first && number <= g.last);
  return gen?.id ?? GENERATIONS[GENERATIONS.length - 1].id;
}
