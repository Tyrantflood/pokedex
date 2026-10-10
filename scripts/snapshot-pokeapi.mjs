// Saves the slice of PokéAPI the unit tests need into tests/fixtures/, so `npm test` never touches the network:
//   pokeapi-types.json   every type's damage relations (the type chart is checked against it, all 18 x 18 pairs)
//   pokemon-slim.json    id, name, types, base stats and height of every Pokémon and form (verdicts, regional forms, ...)
// Run `npm run snapshot` to refresh them (about a minute), review the diff, and commit. Nothing runs this automatically.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const API = "https://pokeapi.co/api/v2";
const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "tests", "fixtures");
const CONCURRENCY = 40;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function getJson(url) {
  let last;
  for (let attempt = 0; attempt < 5; attempt++) {
    if (attempt > 0) await sleep(400 * 2 ** (attempt - 1));
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
      if (res.ok) return await res.json();
      last = new Error(`${res.status} ${url}`);
      if (res.status < 500 && res.status !== 429) break;
    } catch (error) {
      last = error;
    }
  }
  throw last;
}

async function pool(items, work) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await work(items[i]); // a failure stops the snapshot: a partial fixture would be worse than none
      }
    }),
  );
  return results;
}

const stat = (stats, name) => stats.find((s) => s.stat.name === name)?.base_stat ?? 0;
const names = (list) => list.map((t) => t.name).sort();

// ---- types ----
const typeList = (await getJson(`${API}/type?limit=100`)).results.map((t) => t.name).filter((n) => !["unknown", "shadow", "stellar"].includes(n));
const typeDetails = await pool(typeList, (name) => getJson(`${API}/type/${name}`));
const types = {};
for (const detail of typeDetails.sort((a, b) => a.name.localeCompare(b.name))) {
  const r = detail.damage_relations;
  types[detail.name] = { double_damage_to: names(r.double_damage_to), half_damage_to: names(r.half_damage_to), no_damage_to: names(r.no_damage_to) };
}
await mkdir(DIR, { recursive: true });
await writeFile(
  path.join(DIR, "pokeapi-types.json"),
  JSON.stringify({ source: `${API}/type/{name}`, fetchedAt: new Date().toISOString(), types }, null, 2) + "\n",
);
console.log(`snapshot-pokeapi: ${Object.keys(types).length} types`);

// ---- pokémon ----
const list = (await getJson(`${API}/pokemon?limit=5000`)).results;
const details = await pool(list, (p) => getJson(p.url));
const slim = details
  .map((d) => ({
    id: d.id,
    name: d.name,
    types: [...d.types].sort((a, b) => a.slot - b.slot).map((t) => t.type.name),
    stats: {
      hp: stat(d.stats, "hp"),
      attack: stat(d.stats, "attack"),
      defense: stat(d.stats, "defense"),
      specialAttack: stat(d.stats, "special-attack"),
      specialDefense: stat(d.stats, "special-defense"),
      speed: stat(d.stats, "speed"),
    },
    height: d.height,
  }))
  .sort((a, b) => a.id - b.id);
// One Pokémon per line, so a refresh produces a readable diff.
await writeFile(path.join(DIR, "pokemon-slim.json"), `[\n${slim.map((p) => "  " + JSON.stringify(p)).join(",\n")}\n]\n`);
console.log(`snapshot-pokeapi: ${slim.length} Pokémon`);
