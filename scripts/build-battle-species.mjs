// Builds lib/battle/species-ids.generated.json: for every Pokémon Showdown species whose PokéAPI id is NOT its
// National Dex number (alternate forms: Megas, regional forms, Rotom appliances, ...), the PokéAPI id.
// The battle simulator names species like "Charizard-Mega-X" (id "charizardmegax"); PokéAPI names the form
// "charizard-mega-x" (id 10034). Matching the two with hyphens removed resolves almost all of them; anything
// left over is reported and the battle UI falls back to the base species' sprite for it.
//
//   node scripts/build-battle-species.mjs          write the table
//   node scripts/build-battle-species.mjs --check  exit 1 if the committed table is out of date
//
// Reads tests/fixtures/pokemon-slim.json (the saved PokéAPI snapshot), so it needs no network.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Dex } from "@pkmn/sim";

const root = new URL("../", import.meta.url);
const slim = JSON.parse(readFileSync(new URL("tests/fixtures/pokemon-slim.json", root), "utf8"));
const out = fileURLToPath(new URL("lib/battle/species-ids.generated.json", root));

const byFlatName = new Map(slim.map((p) => [p.name.replaceAll("-", ""), p.id]));

// A few Showdown names that differ from PokéAPI's beyond the hyphens.
const ALIASES = {
  taurospaldeacombat: 10250,
  taurospaldeablaze: 10251,
  taurospaldeaaqua: 10252,
  meowsticf: 10025,
  ogerponwellspring: 10273,
  ogerponhearthflame: 10274,
  ogerponcornerstone: 10275,
  // Cosmetic formes (Pikachu caps, Arceus plates, Burmy cloaks, ...) have no PokéAPI form; they use the base sprite.
};

const table = {};
const unresolved = [];
for (const species of Dex.species.all()) {
  if (species.num <= 0 || species.isNonstandard === "CAP" || species.isNonstandard === "Custom") continue;
  if (!species.forme) continue; // base formes use the dex number
  const id = ALIASES[species.id] ?? byFlatName.get(species.id);
  if (id === undefined) {
    unresolved.push(species.name);
    continue;
  }
  if (id !== species.num) table[species.id] = id;
}

const json = JSON.stringify(Object.fromEntries(Object.entries(table).sort(([a], [b]) => a.localeCompare(b))), null, 0) + "\n";
if (process.argv.includes("--check")) {
  const current = (() => {
    try {
      return readFileSync(out, "utf8");
    } catch {
      return "";
    }
  })();
  if (current !== json) {
    console.error("lib/battle/species-ids.generated.json is out of date: run node scripts/build-battle-species.mjs");
    process.exit(1);
  }
} else {
  writeFileSync(out, json);
  console.log(`wrote ${Object.keys(table).length} form ids; ${unresolved.length} Showdown formes have no PokéAPI form (they use the base sprite)`);
}
console.log("unresolved sample:", unresolved.slice(0, 25).join(", "));
