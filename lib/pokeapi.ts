import { cacheLife } from "next/cache";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
  FormKind,
  Pokemon,
  PokemonForm,
  PokemonStats,
  PokemonType,
} from "./pokemon-types";

const API = "https://pokeapi.co/api/v2";
const CONCURRENCY = 16;
const RETRIES = 3;
const TIMEOUT_MS = 20_000;

// Second cache layer on disk. `use cache` is in-memory and is also invalidated
// on every hot reload in dev, which would re-fetch ~1,350 pokemon each time.
const DISK_CACHE = path.join(process.cwd(), ".cache", "pokedex.json");
const DISK_TTL_MS = 7 * 24 * 60 * 60 * 1000;
// Bump when the shape or normalisation changes so stale files are ignored.
const DISK_VERSION = 2;

export class PokeApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "PokeApiError";
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function getJson<T>(url: string): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    if (attempt > 0) await sleep(500 * 2 ** (attempt - 1));
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (res.ok) return (await res.json()) as T;
      lastError = new PokeApiError(`${res.status} ${res.statusText}: ${url}`, res.status);
      // 4xx (except 429) won't succeed on retry.
      if (res.status < 500 && res.status !== 429) break;
    } catch (err) {
      lastError = new PokeApiError(
        `Request failed: ${url} (${err instanceof Error ? err.message : String(err)})`,
      );
    }
  }
  throw lastError;
}

/** Runs `fn` over `items` with bounded concurrency; stops scheduling after the first failure. */
async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  let failed = false;
  const worker = async () => {
    while (!failed && next < items.length) {
      const i = next++;
      try {
        results[i] = await fn(items[i]);
      } catch (err) {
        failed = true;
        throw err;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

// ---- Raw PokéAPI shapes (only the fields we read) ----

interface RawList {
  count: number;
  results: { name: string; url: string }[];
}

interface RawPokemon {
  id: number;
  name: string;
  is_default: boolean;
  species: { name: string; url: string };
  types: { slot: number; type: { name: string } }[];
  stats: { base_stat: number; stat: { name: string } }[];
  abilities: { is_hidden: boolean; slot: number; ability: { name: string } }[];
  cries: { latest: string | null; legacy: string | null };
  sprites: {
    front_default: string | null;
    front_shiny: string | null;
    other?: {
      "official-artwork"?: { front_default: string | null; front_shiny: string | null };
    };
  };
}

// ---- Normalisation ----

const REGIONS = ["alola", "galar", "hisui", "paldea"];

function parseForm(name: string, species: string, isDefault: boolean): PokemonForm {
  // Trust the API's flag, not the name: some defaults carry a suffix
  // (deoxys-normal, giratina-altered, meowstic-male, ...).
  if (isDefault) return { kind: "base", suffix: null, region: null };
  const suffix = name.startsWith(`${species}-`) ? name.slice(species.length + 1) : null;
  if (!suffix) return { kind: "base", suffix: null, region: null };

  const tokens = suffix.split("-");
  let kind: FormKind = "other";
  let region: string | null = null;
  if (tokens.includes("mega")) kind = "mega";
  else if (tokens.includes("gmax")) kind = "gmax";
  else {
    region = tokens.find((t) => REGIONS.includes(t)) ?? null;
    if (region) kind = "regional";
  }
  return { kind, suffix, region };
}

function speciesNumber(url: string): number {
  const match = url.match(/\/pokemon-species\/(\d+)\/?$/);
  if (!match) throw new PokeApiError(`Unexpected species URL: ${url}`);
  return Number(match[1]);
}

function normalizeStats(raw: RawPokemon["stats"]): PokemonStats {
  const by = Object.fromEntries(raw.map((s) => [s.stat.name, s.base_stat]));
  return {
    hp: by["hp"] ?? 0,
    attack: by["attack"] ?? 0,
    defense: by["defense"] ?? 0,
    specialAttack: by["special-attack"] ?? 0,
    specialDefense: by["special-defense"] ?? 0,
    speed: by["speed"] ?? 0,
  };
}

function normalize(raw: RawPokemon): Pokemon {
  const art = raw.sprites.other?.["official-artwork"];
  return {
    id: raw.id,
    number: speciesNumber(raw.species.url),
    name: raw.name,
    species: raw.species.name,
    form: parseForm(raw.name, raw.species.name, raw.is_default),
    // Each form is its own /pokemon entry, so these are the form's real types.
    types: [...raw.types].sort((a, b) => a.slot - b.slot).map((t) => t.type.name as PokemonType),
    sprites: { normal: raw.sprites.front_default, shiny: raw.sprites.front_shiny },
    artwork: { normal: art?.front_default ?? null, shiny: art?.front_shiny ?? null },
    stats: normalizeStats(raw.stats),
    abilities: [...raw.abilities]
      .sort((a, b) => a.slot - b.slot)
      .map((a) => ({ name: a.ability.name, hidden: a.is_hidden })),
    cries: { latest: raw.cries?.latest ?? null, legacy: raw.cries?.legacy ?? null },
  };
}

// ---- Disk cache (best effort: read-only/ephemeral filesystems just skip it) ----

async function readDiskCache(): Promise<Pokemon[] | null> {
  try {
    const { version, savedAt, data } = JSON.parse(await readFile(DISK_CACHE, "utf8")) as {
      version?: number;
      savedAt: number;
      data: Pokemon[];
    };
    if (version === DISK_VERSION && Date.now() - savedAt < DISK_TTL_MS && Array.isArray(data) && data.length > 0) return data;
  } catch {}
  return null;
}

async function writeDiskCache(data: Pokemon[]): Promise<void> {
  try {
    await mkdir(path.dirname(DISK_CACHE), { recursive: true });
    const tmp = `${DISK_CACHE}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify({ version: DISK_VERSION, savedAt: Date.now(), data }));
    await rename(tmp, DISK_CACHE);
  } catch {}
}

/** Every species must have exactly one default form; otherwise the data is wrong and must not be cached. */
function assertOneDefaultPerSpecies(all: Pokemon[]): void {
  const defaults = new Map<number, number>();
  for (const p of all) {
    if (!defaults.has(p.number)) defaults.set(p.number, 0);
    if (p.form.kind === "base") defaults.set(p.number, defaults.get(p.number)! + 1);
  }
  const bad = [...defaults].filter(([, n]) => n !== 1).map(([num, n]) => `#${num} (${n})`);
  if (bad.length) throw new PokeApiError(`Species without exactly one default form: ${bad.join(", ")}`);
}

async function fetchAllFromApi(): Promise<Pokemon[]> {
  // Every variety (regional, Mega, G-Max, ...) is listed as its own pokemon entry.
  const list = await getJson<RawList>(`${API}/pokemon?limit=100000`);
  if (!list.results.length) throw new PokeApiError("PokéAPI returned an empty Pokémon list");

  const all = await mapPool(list.results, CONCURRENCY, async ({ url }) =>
    normalize(await getJson<RawPokemon>(url)),
  );
  assertOneDefaultPerSpecies(all);
  return all.sort((a, b) => a.number - b.number || a.id - b.id);
}

/**
 * Every Pokémon and alternate form, normalised. Cached for a long time in
 * Next's cache, backed by a 7-day on-disk copy. Throws `PokeApiError` on
 * failure; errors are never cached, so the next request retries.
 */
export async function getAllPokemon(): Promise<Pokemon[]> {
  "use cache";
  cacheLife("max");

  const cached = await readDiskCache();
  if (cached) return cached;

  const fresh = await fetchAllFromApi();
  await writeDiskCache(fresh);
  return fresh;
}
