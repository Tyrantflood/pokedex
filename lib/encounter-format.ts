const REGION_PREFIX = /^(kanto|johto|hoenn|sinnoh|unova|kalos|alola|galar|paldea|hisui|kitakami|blueberry)-/;
const SMALL_WORDS = new Set(["of", "the", "and", "in", "at", "to", "on", "a"]);
const UPPER_WORDS = new Set(["sw", "se", "ne", "nw", "tv"]);

/**
 * "route-1-area" -> "Route 1", "kanto-route-2-south-towards-viridian-city" -> "Route 2 South Towards Viridian City",
 * "mt-moon-1f" -> "Mt. Moon 1F". The region prefix and the "-area" suffix are noise: the game already says where you are.
 */
export function locationName(slug: string): string {
  let words = slug.replace(/-area$/, "").replace(REGION_PREFIX, "").split("-").filter(Boolean);
  if (words.length > 1 && words[words.length - 1] === "main") words = words.slice(0, -1);
  if (words.length === 0) return slug;
  return words
    .map((w, i) => {
      if (w === "mt") return "Mt.";
      if (w === "ss") return "S.S.";
      if (w === "poke") return "Poké";
      if (w === "pokemon") return "Pokémon";
      if (/^b?\d+f$/.test(w)) return w.toUpperCase(); // floors: 1f, b1f
      if (UPPER_WORDS.has(w)) return w.toUpperCase();
      if (i > 0 && SMALL_WORDS.has(w)) return w;
      return w[0].toUpperCase() + w.slice(1);
    })
    .join(" ");
}

const METHODS: Record<string, string> = {
  walk: "Walking",
  surf: "Surfing",
  "old-rod": "Fishing (Old Rod)",
  "good-rod": "Fishing (Good Rod)",
  "super-rod": "Fishing (Super Rod)",
  "super-rod-spots": "Fishing spots (Super Rod)",
  "rock-smash": "Rock Smash",
  headbutt: "Headbutt",
  "headbutt-low": "Headbutt",
  "headbutt-normal": "Headbutt",
  "headbutt-high": "Headbutt",
  "dark-grass": "Dark grass",
  "grass-spots": "Rustling grass",
  "cave-spots": "Dust clouds",
  "bridge-spots": "Bridge shadows",
  "surf-spots": "Surf ripples",
  "bubbling-spots": "Bubbling spots",
  "yellow-flowers": "Yellow flowers",
  "purple-flowers": "Purple flowers",
  "red-flowers": "Red flowers",
  "rough-terrain": "Rough terrain",
  gift: "Gift",
  "gift-egg": "Gift egg",
  static: "Static encounter",
  "only-one": "Only one",
  "npc-trade": "In-game trade",
  pokeflute: "Poké Flute",
  "roaming-grass": "Roaming (grass)",
  "roaming-water": "Roaming (water)",
  "feebas-tile-fishing": "Fishing (special tiles)",
  "devon-scope": "Devon Scope",
  "squirt-bottle": "Squirt bottle",
  "wailmer-pail": "Wailmer Pail",
  seaweed: "Seaweed",
  "berry-trees": "Berry trees",
  "honey-tree": "Honey tree",
  "hidden-grotto": "Hidden grotto",
  "island-scan": "Island Scan",
  sos: "SOS call",
  "sos-from-bubbling-spot": "SOS call",
  overworld: "Overworld",
  "overworld-water": "Overworld (water)",
  "overworld-flying": "Overworld (flying)",
  "overworld-special": "Overworld (special)",
  "overworld-dirt": "Overworld (dirt)",
  horde: "Horde",
  snag: "Snag",
  "snag-rematch": "Snag (rematch)",
  pokespot: "PokéSpot",
  wanderer: "Wanderer",
  "wanderer-water": "Wanderer (water)",
  "max-raid": "Max Raid Battle",
  "dynamax-adventure": "Dynamax Adventure",
  "pokemon-ranger": "Pokémon Ranger",
};

/** A readable name for an encounter method; unknown ones are just de-slugged. */
export function methodName(slug: string): string {
  const known = METHODS[slug];
  if (known) return known;
  const words = slug.replace(/-/g, " ");
  return words[0].toUpperCase() + words.slice(1);
}

/** "time-morning" -> "Morning", "weather-raining" -> "Raining", anything else is de-slugged. Empty for "no" flags. */
export function conditionLabel(slug: string): string {
  if (slug === "swarm-yes") return "Swarm";
  if (slug.endsWith("-no") || slug === "swarm-no") return "";
  const stripped = slug.replace(/^(time|weather|story-progress|other)-/, "");
  const words = stripped.replace(/-/g, " ");
  return words[0].toUpperCase() + words.slice(1);
}

export function levelRange(min: number, max: number): string {
  return min === max ? `Lv ${min}` : `Lv ${min}–${max}`;
}

export function formatChance(chance: number): string {
  return `${Math.round(chance * 10) / 10}%`;
}
