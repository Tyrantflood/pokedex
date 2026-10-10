import assert from "node:assert/strict";
import test from "node:test";
import { conditionLabel, formatChance, levelRange, locationName, methodName, resolveLocationName } from "../lib/encounter-format";

// The slug formatter: now only the fallback, but it still has to be right.
test("locationName formats slugs", () => {
  const cases: Record<string, string> = {
    "route-1-area": "Route 1",
    "kanto-route-1-area": "Route 1",
    "kanto-route-2-south-towards-viridian-city": "Route 2 South Towards Viridian City",
    "mt-moon-1f": "Mt. Moon 1F",
    "whirl-islands-b1f": "Whirl Islands B1F",
    "cave-of-origin-b1f": "Cave of Origin B1F",
    "viridian-forest-area": "Viridian Forest",
    "motostoke-main": "Motostoke",
    "hoenn-safari-zone-sw": "Safari Zone SW",
    "ss-anne-2f": "S.S. Anne 2F",
    "poke-pelago-poni-island-reached": "Poké Pelago Poni Island Reached",
    "hoenn-pokecenter-area": "Pokecenter",
    area: "Area",
  };
  for (const [slug, want] of Object.entries(cases)) assert.equal(locationName(slug), want, slug);
});

test("method, condition, level and chance labels", () => {
  assert.equal(methodName("walk"), "Walking");
  assert.equal(methodName("old-rod"), "Fishing (Old Rod)");
  assert.equal(methodName("some-new-method"), "Some new method");
  assert.equal(conditionLabel("time-morning"), "Morning");
  assert.equal(conditionLabel("swarm-yes"), "Swarm");
  assert.equal(conditionLabel("swarm-no"), "");
  assert.equal(levelRange(5, 5), "Lv 5");
  assert.equal(levelRange(2, 5), "Lv 2–5");
  assert.equal(formatChance(45), "45%");
  assert.equal(formatChance(12.34), "12.3%");
});

type Case = [areaSlug: string, areaEnglish: string | null, locationSlug: string | null, locationEnglish: string | null, want: string];
const resolve = ([areaSlug, areaEnglish, locationSlug, locationEnglish]: Case) => resolveLocationName({ areaSlug, areaEnglish, locationSlug, locationEnglish });
const check = (cases: Case[]) => {
  for (const c of cases) assert.equal(resolve(c), c[4], `${c[0]}: got "${resolve(c)}"`);
};

test("resolveLocationName: the location's spelling for the place, plus what the area adds", () => {
  check([
    ["pokemon-tower-6f", "Pokemon Tower (6F)", "pokemon-tower", "Pokémon Tower", "Pokémon Tower (6F)"],
    ["mt-moon-1f", "Mount Moon (1F)", "mt-moon", "Mt. Moon", "Mt. Moon (1F)"],
    ["mt-moon-mt-moon-square", "Mount Moon Square", "mt-moon", "Mt. Moon", "Mt. Moon Square"],
    ["kanto-route-2-south-towards-viridian-city", "Road 2 (south, towards Viridian City)", "kanto-route-2", "Route 2", "Route 2 (South, towards Viridian City)"],
    ["galar-route-2-lakeside", "Route 2 (Lakeside)", "galar-route-2", "Route 2", "Route 2 (Lakeside)"],
    ["ballimere-lake-max-den-c", "Ballimere Lake (Max Den C)", "ballimere-lake", "Ballimere Lake", "Ballimere Lake (Max Den C)"],
    ["phenac-city-stadium", "Phenac City Stadium", "phenac-city", "Phenac City", "Phenac City Stadium"],
    ["great-marsh-area-6", "Great Marsh Area 6", "great-marsh", "Great Marsh", "Great Marsh Area 6"],
    ["viridian-forest-area", "Viridian Forest", "viridian-forest", "Viridian Forest", "Viridian Forest"],
    ["trainers-school-area", "Trainers' School", "trainers-school", "Trainers’ School", "Trainers’ School"],
  ]);
});

test('resolveLocationName: "Road N" is a route only when the slug says so', () => {
  check([
    ["hoenn-route-120-area", "Road 120", "hoenn-route-120", "Route 120", "Route 120"],
    ["sinnoh-sea-route-220-area", "Road 220", "sinnoh-sea-route-220", "Sea Route 220", "Sea Route 220"],
    ["mt-coronet-1f-route-207", "Mount Coronet (1F Road 207)", "mt-coronet", "Mt. Coronet", "Mt. Coronet (1F Route 207)"],
    ["kanto-victory-road-1-1f", "Victory Road 1 (1F)", "kanto-victory-road-1", "Victory Road 1", "Victory Road 1 (1F)"],
    ["unova-victory-road-2-unknown-area-71", "Victory Road 2 (unknown area 71)", "unova-victory-road", "Victory Road", "Victory Road 2 (Unknown area 71)"],
    // with no English location name there is nothing to take the spelling from: the area name must survive on its own
    ["kanto-victory-road-1-1f", "Victory Road 1 (1F)", "kanto-victory-road-1", null, "Victory Road 1 (1F)"],
    ["hoenn-route-120-area", "Road 120", "hoenn-route-120", null, "Route 120"],
  ]);
});

test("resolveLocationName: an area name that is already specific, or names another place, is used as it is", () => {
  check([
    ["johto-safari-zone-peak", "Safari Zone Peak", "johto-safari-zone", "Johto Safari Zone", "Safari Zone Peak"],
    ["cianwood-city-pokemon-center", "Pokemon Center (Cianwood City)", "cianwood-city", "Cianwood City", "Pokemon Center (Cianwood City)"],
    ["unova-route-6-weather-institute", "Weather Institute (Road 6)", "unova-route-6", "Route 6", "Weather Institute (Route 6)"],
    ["saffron-city-silph-co", "Silph Co.", "saffron-city", "Saffron City", "Silph Co."],
  ]);
});

test("resolveLocationName: a differently spelled area still inside the location keeps the location's name and its qualifier", () => {
  check([["relic-passage-castelia-sewers-entrance", "Relic Tunnel (Castelia Sewers entrance)", "relic-passage", "Relic Passage", "Relic Passage (Castelia Sewers entrance)"]]);
});

test("resolveLocationName: with no English area name, the location's name plus what the slug adds", () => {
  check([
    ["alola-route-1-east", null, "alola-route-1", "Route 1", "Route 1 (East)"],
    ["shoal-cave-b2f", null, "shoal-cave", "Shoal Cave", "Shoal Cave (B2F)"],
    ["poni-meadow-area", null, "poni-meadow", "Poni Meadow", "Poni Meadow"],
    ["aether-paradise-2f", "", "aether-paradise", "Aether Paradise", "Aether Paradise (2F)"],
  ]);
});

test("resolveLocationName: only an English area name, or none at all (then the slug formatter)", () => {
  check([
    ["some-area", "Some Place (Cave)", "some", null, "Some Place (Cave)"],
    ["hoenn-pokecenter-area", null, "hoenn-pokecenter", null, locationName("hoenn-pokecenter-area")],
    ["kanto-route-9-area", null, null, null, "Route 9"],
  ]);
});
