// Builds lib/location-names.generated.json: PokéAPI's English names for every location and location-area, so no view
// ever has to fetch them. Runs as `prebuild`.
//
// The table is committed, so a fresh clone (and a deploy) builds and runs without network access for this. It is
// refreshed only when it is older than MAX_AGE_DAYS (or missing, or `--force`), so normal builds are not slowed down.
// This script never fails a build: if PokéAPI can't be reached it keeps the table it has (or writes an empty one), and the
// app's runtime lookup, which exists only for areas missing from the table, covers the gap.
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// The environment variables exist for the tests (a fake server, a temp file, a small table, no waiting between retries); normal builds use none.
const API = process.env.POKEAPI_BASE_URL ?? "https://pokeapi.co/api/v2";
const OUT = process.env.LOCATION_NAMES_OUT ?? path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "lib", "location-names.generated.json");
const VERSION = 1;
const MAX_AGE_DAYS = 30;
const CONCURRENCY = 40;
const RETRIES = 4;
const RETRY_BASE_MS = Number(process.env.LOCATION_NAMES_RETRY_MS ?? 400);
/** PokéAPI has ~1,500 areas and ~1,100 locations; far fewer means the fetch went wrong, not that names vanished. */
const MIN_AREAS = Number(process.env.LOCATION_NAMES_MIN_AREAS ?? 1000);
const MAX_FAILED_FRACTION = 0.02;

const log = (message) => console.log(`build-location-names: ${message}`);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function getJson(url) {
  let last;
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    if (attempt > 0) await sleep(RETRY_BASE_MS * 2 ** (attempt - 1));
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
    Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await work(items[i]).catch(() => undefined);
      }
    }),
  );
  return results;
}

const english = (names) => names?.find((n) => n.language.name === "en")?.name ?? null;

async function readTable() {
  try {
    const table = JSON.parse(await readFile(OUT, "utf8"));
    if (table.version === VERSION && table.areas && table.locations) return table;
  } catch {}
  return null;
}

async function write(table) {
  // One entry per line, keys sorted: small diffs when it is refreshed.
  const lines = (object) => Object.keys(object).sort().map((key) => `    ${JSON.stringify(key)}: ${JSON.stringify(object[key])}`).join(",\n");
  const text =
    `{\n  "version": ${VERSION},\n  "generatedAt": ${JSON.stringify(table.generatedAt)},\n` +
    `  "areas": {\n${lines(table.areas)}\n  },\n  "locations": {\n${lines(table.locations)}\n  }\n}\n`;
  await mkdir(path.dirname(OUT), { recursive: true });
  const tmp = `${OUT}.${process.pid}.tmp`;
  await writeFile(tmp, text);
  await rename(tmp, OUT);
}

async function main() {
  const force = process.argv.includes("--force");
  const existing = await readTable();
  const count = (t) => `${Object.keys(t.areas).length} areas, ${Object.keys(t.locations).length} locations`;

  if (existing && !force && Object.keys(existing.areas).length >= MIN_AREAS) {
    const ageDays = (Date.now() - Date.parse(existing.generatedAt)) / 86_400_000;
    if (ageDays < MAX_AGE_DAYS) {
      log(`table is ${Math.floor(ageDays)} day(s) old (${count(existing)}); not refreshing`);
      return;
    }
  }

  try {
    log("fetching names from PokéAPI...");
    const [areaList, locationList] = await Promise.all([getJson(`${API}/location-area?limit=5000`), getJson(`${API}/location?limit=5000`)]);
    const [areas, locations] = await Promise.all([
      pool(areaList.results, async (a) => {
        const d = await getJson(a.url);
        return { slug: d.name, english: english(d.names), location: d.location.name };
      }),
      pool(locationList.results, async (l) => {
        const d = await getJson(l.url);
        return { slug: d.name, english: english(d.names) };
      }),
    ]);
    const failed = areas.filter((x) => !x).length + locations.filter((x) => !x).length;
    const total = areas.length + locations.length;
    if (areas.length < MIN_AREAS || failed / total > MAX_FAILED_FRACTION) throw new Error(`incomplete: ${failed} of ${total} lookups failed`);

    const table = { generatedAt: new Date().toISOString(), areas: {}, locations: {} };
    for (const a of areas) if (a) table.areas[a.slug] = [a.english, a.location];
    for (const l of locations) if (l) table.locations[l.slug] = l.english;
    await write(table);
    log(`wrote ${count(table)}${failed ? ` (${failed} lookups failed and are left to the runtime lookup)` : ""}`);
  } catch (error) {
    if (existing) {
      log(`WARNING: couldn't refresh (${error.message}); keeping the table from ${existing.generatedAt} (${count(existing)})`);
    } else {
      await write({ generatedAt: new Date(0).toISOString(), areas: {}, locations: {} });
      log(`WARNING: couldn't build the table (${error.message}) and there is none; wrote an empty one. Location names will be looked up at runtime.`);
    }
  }
}

main().catch((error) => log(`WARNING: unexpected error (${error.message}); continuing`));
