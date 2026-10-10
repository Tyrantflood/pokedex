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

/** One whitespace-separated word, lower-cased, accent-free and punctuation-free, with the spellings PokéAPI mixes ("Mount"/"Mt.", "Road"/"Route") folded together. */
const fold = (word: string) => {
  const w = word
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[.’']/g, "");
  return w === "mount" ? "mt" : w === "road" ? "route" : w;
};
const split = (text: string) => text.trim().split(/\s+/);

/**
 * PokéAPI's English area names call Gen 3-6 routes "Road 120" (the games say "Route 120"; "Victory Road 1" is a real name).
 * Only a "Road N" whose number matches a "route-N" in the area's own slug is a route, so only those are corrected.
 */
const fixRoads = (text: string, areaSlug: string) =>
  text.replace(/\bRoad (\d+)\b/g, (whole, n: string) =>
    areaSlug.includes(`sea-route-${n}`) ? `Sea Route ${n}` : areaSlug.includes(`route-${n}`) ? `Route ${n}` : whole,
  );

const capitalise = (text: string) => text[0].toUpperCase() + text.slice(1);

/** What an area's slug adds after its location's slug: ("alola-route-1-south", "alola-route-1") -> "south"; nothing for "...-area". */
function slugRemainder(areaSlug: string, locationSlug: string | null): string {
  const area = areaSlug.replace(/-area$/, "");
  if (!locationSlug || area === locationSlug || !area.startsWith(locationSlug + "-")) return "";
  return area.slice(locationSlug.length + 1);
}

export interface LocationNameInput {
  areaSlug: string;
  /** English name of the location-area endpoint's entry, if it has one. */
  areaEnglish: string | null;
  /** The area's parent location, and its English name, if it has one. */
  locationSlug: string | null;
  locationEnglish: string | null;
}

/**
 * The name to show for an encounter area, from PokéAPI's own English names.
 *
 * Both endpoints have names, but they disagree. The location's is the one the games use ("Route 120", "Mt. Moon",
 * "Pokémon Tower"); the area's is more specific but often spelled differently ("Road 120", "Mount Moon (1F)",
 * "Pokemon Tower (7F)"). So: take the location's spelling and keep what the area adds ("Mt. Moon (1F)",
 * "Route 2 (North, towards Pewter City)", "Phenac City Stadium"). When the area's name doesn't start with the location's
 * at all ("Safari Zone Peak", "Pokemon Center (Cianwood City)") it is already specific and is used as it is.
 * Only when no English name exists is anything made from a slug: the location's name plus the part of the slug that
 * follows the location's slug, or, with no English name at all, the whole slug (see locationName).
 */
export function resolveLocationName({ areaSlug, areaEnglish, locationSlug, locationEnglish }: LocationNameInput): string {
  const area = areaEnglish?.trim() ? fixRoads(areaEnglish.trim(), areaSlug) : null;
  const location = locationEnglish?.trim() || null;

  if (!area && !location) return locationName(areaSlug);
  if (!area) {
    const rest = slugRemainder(areaSlug, locationSlug);
    return rest ? `${location} (${capitalise(locationName(rest))})` : location!;
  }
  if (!location) return area;

  const parenthetical = /^(.*?)\s*\(([^)]*)\)\s*$/.exec(area);
  const head = parenthetical ? parenthetical[1] : area;
  const qualifier = parenthetical ? parenthetical[2].trim() : "";
  const locationWords = split(location);
  const headWords = split(head);
  const startsWithLocation = headWords.length >= locationWords.length && locationWords.every((w, i) => fold(w) === fold(headWords[i]));
  if (!startsWithLocation) {
    // The area's own spelling of the place differs ("Relic Tunnel (Castelia Sewers entrance)" in the location "Relic Passage").
    // If its slug still says it belongs to that location and the parenthesis is only a qualifier (not a place that
    // repeats the location, like "Pokemon Center (Cianwood City)"), keep the location's name and the qualifier.
    const inLocation = locationSlug !== null && areaSlug.startsWith(locationSlug + "-");
    const qualifierWords = qualifier ? split(qualifier).map(fold) : [];
    const repeatsLocation = locationWords.every((w) => qualifierWords.includes(fold(w)));
    return inLocation && qualifier && !repeatsLocation ? `${location} (${capitalise(qualifier)})` : area;
  }

  const rest = head.trim().split(/\s+/).slice(locationWords.length);
  const base = [location, ...rest].join(" ");
  return qualifier ? `${base} (${capitalise(qualifier)})` : base;
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
