export interface Game {
  /** PokéAPI version slug. */
  slug: string;
  name: string;
  /** Generation the game belongs to (used to hide games older than the Pokémon itself). */
  generation: number;
  /** A main-series release. Only these get a "No wild encounter data" line; spin-offs, DLC and regional editions appear only when there is data. */
  main: boolean;
}

const g = (slug: string, name: string, generation: number, main = true): Game => ({ slug, name, generation, main });

/** Every game PokéAPI has encounter versions for, in order of (first) release. */
export const GAMES: Game[] = [
  g("green-japan", "Green (Japan)", 1, false),
  g("red-japan", "Red (Japan)", 1, false),
  g("blue-japan", "Blue (Japan)", 1, false),
  g("red", "Red", 1),
  g("blue", "Blue", 1),
  g("yellow", "Yellow", 1),
  g("gold", "Gold", 2),
  g("silver", "Silver", 2),
  g("crystal", "Crystal", 2),
  g("ruby", "Ruby", 3),
  g("sapphire", "Sapphire", 3),
  g("colosseum", "Colosseum", 3, false),
  g("firered", "FireRed", 3),
  g("leafgreen", "LeafGreen", 3),
  g("emerald", "Emerald", 3),
  g("xd", "XD: Gale of Darkness", 3, false),
  g("diamond", "Diamond", 4),
  g("pearl", "Pearl", 4),
  g("platinum", "Platinum", 4),
  g("heartgold", "HeartGold", 4),
  g("soulsilver", "SoulSilver", 4),
  g("black", "Black", 5),
  g("white", "White", 5),
  g("black-2", "Black 2", 5),
  g("white-2", "White 2", 5),
  g("x", "X", 6),
  g("y", "Y", 6),
  g("omega-ruby", "Omega Ruby", 6),
  g("alpha-sapphire", "Alpha Sapphire", 6),
  g("sun", "Sun", 7),
  g("moon", "Moon", 7),
  g("ultra-sun", "Ultra Sun", 7),
  g("ultra-moon", "Ultra Moon", 7),
  g("lets-go-pikachu", "Let's Go, Pikachu!", 7),
  g("lets-go-eevee", "Let's Go, Eevee!", 7),
  g("sword", "Sword", 8),
  g("shield", "Shield", 8),
  g("the-isle-of-armor-sword", "Sword: Isle of Armor", 8, false),
  g("the-isle-of-armor-shield", "Shield: Isle of Armor", 8, false),
  g("the-crown-tundra-sword", "Sword: Crown Tundra", 8, false),
  g("the-crown-tundra-shield", "Shield: Crown Tundra", 8, false),
  g("brilliant-diamond", "Brilliant Diamond", 8),
  g("shining-pearl", "Shining Pearl", 8),
  g("legends-arceus", "Legends: Arceus", 8),
  g("scarlet", "Scarlet", 9),
  g("violet", "Violet", 9),
  g("the-teal-mask-scarlet", "Scarlet: The Teal Mask", 9, false),
  g("the-teal-mask-violet", "Violet: The Teal Mask", 9, false),
  g("the-indigo-disk-scarlet", "Scarlet: The Indigo Disk", 9, false),
  g("the-indigo-disk-violet", "Violet: The Indigo Disk", 9, false),
  g("legends-za", "Legends: Z-A", 9),
  g("mega-dimension", "Legends: Z-A: Mega Dimension", 9, false),
  g("champions", "Champions", 9, false),
];

const ORDER = new Map(GAMES.map((game, i) => [game.slug, i]));
const titleCase = (slug: string) => slug.split("-").map((w) => w[0]?.toUpperCase() + w.slice(1)).join(" ");

/** Release-order position. Games this list doesn't know yet sort after every known one, by name. */
export function gameOrder(slug: string): number {
  return ORDER.get(slug) ?? GAMES.length;
}

export function gameName(slug: string): string {
  return GAMES.find((game) => game.slug === slug)?.name ?? titleCase(slug);
}
