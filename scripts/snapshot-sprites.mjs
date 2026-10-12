// Saves which sprite files PokéAPI actually has for every Generation 1-5 species and forme the battle simulator knows, to
// tests/fixtures/sprite-availability.json, so the sprite fallback chain can be tested for all of them without the network:
//
//   node scripts/snapshot-sprites.mjs          (about a minute: one HEAD request per picture, 16 at a time)
//
// File format: { "<sprite id>": "<5 digits>" } in the order backGif, backPng, frontGif, frontPng, artwork (1 = exists). Review the diff.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Dex } from "@pkmn/sim";

const SPRITES = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon";
const formIds = (await import("../lib/battle/species-ids.generated.json", { with: { type: "json" } })).default;
const urls = (id) => [`${SPRITES}/other/showdown/back/${id}.gif`, `${SPRITES}/back/${id}.png`, `${SPRITES}/other/showdown/${id}.gif`, `${SPRITES}/${id}.png`, `${SPRITES}/other/official-artwork/${id}.png`];

const ids = new Set();
for (const s of Dex.species.all()) {
  if (s.num <= 0 || s.gen > 5 || s.isNonstandard === "CAP" || s.isNonstandard === "Custom") continue;
  ids.add(formIds[s.id] ?? s.num);
}
const list = [...ids].sort((a, b) => a - b);

async function exists(url) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(url, { method: "HEAD" });
      if (res.status === 200) return 1;
      if (res.status === 404) return 0;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
  }
  throw new Error(`could not check ${url}`);
}

const result = {};
let next = 0;
await Promise.all(
  Array.from({ length: 16 }, async () => {
    while (next < list.length) {
      const id = list[next++];
      result[id] = (await Promise.all(urls(id).map(exists))).join("");
    }
  }),
);
const sorted = Object.fromEntries(Object.entries(result).sort(([a], [b]) => Number(a) - Number(b)));
writeFileSync(fileURLToPath(new URL("../tests/fixtures/sprite-availability.json", import.meta.url)), JSON.stringify(sorted) + "\n");
const count = (i, v) => Object.values(sorted).filter((s) => s[i] === v).length;
console.log(`${list.length} sprite ids; back GIF missing: ${count(0, "0")}, back PNG missing: ${count(1, "0")}, front GIF missing: ${count(2, "0")}, front PNG missing: ${count(3, "0")}, artwork missing: ${count(4, "0")}`);
