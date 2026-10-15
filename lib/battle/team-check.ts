/**
 * Everything about a battle team that needs the simulator: which Pokémon, moves and items a format allows, whether a team is legal and why
 * not, and packing a team for the simulator. This module imports `@pkmn/sim`, so the UI reaches it only with a dynamic `import()` (from the
 * team builder and when a battle starts), and the room server uses it to check the teams players bring.
 */
import { Teams, TeamValidator } from "@pkmn/sim";
import type { ModdedDex } from "@pkmn/sim";
import type { PokemonSet } from "@pkmn/sets";
import { spriteIdFor } from "./ids";
import { normalizeSet } from "./my-teams";
import { applyPreset, defaultEvs, EV_PRESETS, fullTable, hasTera, type StatsTable } from "./team-edit";

export interface FormatTools {
  /** The simulator's format id with any custom rules (e.g. "gen9ou@@@!Team Preview"). */
  formatId: string;
  gen: number;
  dex: ModdedDex;
  validator: TeamValidator;
}

const cache = new Map<string, FormatTools>();

/** The dex and validator for a format id (cached: building a validator reads the format's rules once). */
export function toolsFor(formatId: string): FormatTools {
  let tools = cache.get(formatId);
  if (!tools) {
    const validator = TeamValidator.get(formatId);
    tools = { formatId, gen: validator.gen, dex: validator.dex, validator };
    cache.set(formatId, tools);
  }
  return tools;
}

// ---- packing -----------------------------------------------------------------------------------------------------------

export const packSets = (sets: PokemonSet[]): string => Teams.pack(sets);

/** The sets in a packed team, or null if it isn't one. */
export function unpackSets(packed: string): PokemonSet[] | null {
  try {
    const sets = Teams.unpack(packed);
    return sets && sets.length ? (sets as PokemonSet[]) : null;
  } catch {
    return null;
  }
}

// ---- validation --------------------------------------------------------------------------------------------------------

export interface TeamVerdict {
  ok: boolean;
  /** Everything the validator says about the team as a whole and its members. */
  errors: string[];
  /** The team as the validator leaves it (defaults filled in, nicknames removed): what should be battled with. */
  sets: PokemonSet[];
}

/** Checks a team against a format's rules. Nicknames are removed (they would travel into the battle log). */
export function validateSets(tools: FormatTools, sets: PokemonSet[]): TeamVerdict {
  const copy = structuredClone(sets) as PokemonSet[];
  if (copy.length === 0) return { ok: false, errors: ["Add at least one Pokémon."], sets: copy };
  const errors = tools.validator.validateTeam(copy, { removeNicknames: true });
  return { ok: !errors, errors: errors ?? [], sets: copy };
}

/** What is wrong with one member on its own, for showing next to it. */
export function validateMember(tools: FormatTools, set: PokemonSet): string[] {
  const copy = structuredClone(set) as PokemonSet;
  return tools.validator.validateSet(copy, {}) ?? [];
}

// ---- what a format allows ----------------------------------------------------------------------------------------------

export interface SpeciesChoice {
  id: string;
  name: string;
  num: number;
  types: string[];
  baseStats: StatsTable;
  spriteId: number;
}

const speciesCache = new Map<string, SpeciesChoice[]>();

/** Every Pokémon the format allows (banned ones, other generations' and fan-made ones are left out), in Pokédex order. */
export function speciesChoices(tools: FormatTools): SpeciesChoice[] {
  const hit = speciesCache.get(tools.formatId);
  if (hit) return hit;
  const list: SpeciesChoice[] = [];
  for (const species of tools.dex.species.all()) {
    if (!species.exists || species.num <= 0 || species.isNonstandard) continue;
    // The validator is the authority: it knows the generation, the tier bans and the format's own clauses.
    const set = { name: species.name, species: species.name, moves: [], ability: "", item: "", nature: "", evs: fullTable(0), ivs: fullTable(31), level: 100, gender: "" } as unknown as PokemonSet;
    const problem = tools.validator.checkSpecies(set, species, tools.dex.species.get(species.id), {});
    if (problem) continue;
    list.push({ id: species.id, name: species.name, num: species.num, types: species.types, baseStats: species.baseStats as StatsTable, spriteId: spriteIdFor(species.id, species.num) });
  }
  list.sort((a, b) => a.num - b.num || a.name.localeCompare(b.name));
  speciesCache.set(tools.formatId, list);
  return list;
}

export interface SpeciesFacts {
  name: string;
  types: string[];
  baseStats: StatsTable;
  /** Every ability the Pokémon can have in this generation (empty before Gen 3). */
  abilities: string[];
  /** A Pokémon with a fixed gender (or none). */
  gender: "M" | "F" | "N" | "";
  spriteId: number;
}

export function speciesFacts(tools: FormatTools, name: string): SpeciesFacts | null {
  const species = tools.dex.species.get(name);
  if (!species.exists) return null;
  return {
    name: species.name,
    types: species.types,
    baseStats: species.baseStats as StatsTable,
    abilities: tools.gen >= 3 ? [...new Set(Object.values(species.abilities))] : [],
    gender: species.gender as SpeciesFacts["gender"],
    spriteId: spriteIdFor(species.id, species.num),
  };
}

export interface MoveChoice {
  name: string;
  type: string;
  category: string;
  basePower: number;
  accuracy: number | true;
  pp: number;
  description: string;
}

const HIDDEN_POWER_TYPES = ["Fighting", "Flying", "Poison", "Ground", "Rock", "Bug", "Ghost", "Steel", "Fire", "Water", "Grass", "Electric", "Psychic", "Ice", "Dragon", "Dark"];

/** The ids of every move the species (or something it evolves from, or its base forme) has any learnset entry for. */
function candidateMoveIds(tools: FormatTools, speciesName: string): Set<string> {
  const ids = new Set<string>();
  const seen = new Set<string>();
  const visit = (name: string | undefined) => {
    if (!name) return;
    const species = tools.dex.species.get(name);
    if (!species.exists || seen.has(species.id)) return;
    seen.add(species.id);
    const learnset = tools.dex.species.getLearnsetData(species.id).learnset;
    if (learnset) for (const id of Object.keys(learnset)) ids.add(id);
    visit(species.prevo);
    visit(species.baseSpecies);
    visit(species.changesFrom);
  };
  visit(speciesName);
  return ids;
}

/**
 * The moves a Pokémon may have in a format: the validator's own `checkCanLearn` (so egg moves, past-generation moves and event-only moves
 * are judged the way the team check will judge them) and the format's move bans. For Hidden Power (Gens 2-7) there is one entry per type.
 */
export function legalMoves(tools: FormatTools, speciesName: string): MoveChoice[] {
  const species = tools.dex.species.get(speciesName);
  if (!species.exists) return [];
  const probe = { name: species.name, species: species.name, moves: [], ability: "", item: "", nature: "", evs: fullTable(0), ivs: fullTable(31), level: 100, gender: "" } as unknown as PokemonSet;
  const out: MoveChoice[] = [];
  const describe = (move: ReturnType<ModdedDex["moves"]["get"]>, name = move.name): MoveChoice => ({
    name,
    type: move.type,
    category: move.category,
    basePower: move.basePower,
    accuracy: move.accuracy,
    pp: move.pp,
    description: move.shortDesc || move.desc || "",
  });
  for (const id of candidateMoveIds(tools, speciesName)) {
    const move = tools.dex.moves.get(id);
    if (!move.exists || move.isNonstandard === "Future" || move.gen > tools.gen) continue;
    if (tools.validator.checkMove(probe, move, {}) !== null) continue; // banned in this format
    // A fresh source list per move: checking narrows it, and each move is judged on its own.
    if (tools.validator.checkCanLearn(move, species, tools.validator.allSources(species), probe) !== null) continue;
    if (move.id === "hiddenpower" && tools.gen <= 7) {
      for (const type of HIDDEN_POWER_TYPES) out.push(describe(move, `Hidden Power ${type}`));
      continue;
    }
    out.push(describe(move));
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** The IVs that make Hidden Power the given type (Gens 2-7), on top of full IVs. */
export function hiddenPowerIvs(tools: FormatTools, type: string): StatsTable {
  return { ...fullTable(31), ...(tools.dex.types.get(type).HPivs as Partial<StatsTable>) };
}

export interface ItemChoice {
  name: string;
  description: string;
}

const itemCache = new Map<string, ItemChoice[]>();

export function itemChoices(tools: FormatTools): ItemChoice[] {
  if (tools.gen < 2) return [];
  const hit = itemCache.get(tools.formatId);
  if (hit) return hit;
  const list: ItemChoice[] = [];
  for (const item of tools.dex.items.all()) {
    if (!item.exists || item.isNonstandard || item.gen > tools.gen) continue;
    const probe = { name: "", species: "Pikachu", moves: [], ability: "", item: item.name, nature: "", evs: fullTable(0), ivs: fullTable(31), level: 100, gender: "" } as unknown as PokemonSet;
    if (tools.validator.checkItem(probe, item, {}) !== null) continue;
    list.push({ name: item.name, description: item.shortDesc || item.desc || "" });
  }
  list.sort((a, b) => a.name.localeCompare(b.name));
  itemCache.set(tools.formatId, list);
  return list;
}

export function abilityText(tools: FormatTools, name: string): string {
  return tools.dex.abilities.get(name).shortDesc || "";
}

/** The types a Terastallizing Pokémon can become (Gen 9), Stellar included. */
export function teraTypes(tools: FormatTools): string[] {
  return hasTera(tools.gen) ? tools.dex.types.all().filter((t) => !t.isNonstandard || t.name === "Stellar").map((t) => t.name).filter((n) => n !== "???") : [];
}

// ---- new members -------------------------------------------------------------------------------------------------------

/** A sensible fresh set: the Pokémon's first ability, no item or moves yet, and an EV spread for whichever attacking stat is higher. */
export function blankSet(tools: FormatTools, speciesName: string): PokemonSet {
  const facts = speciesFacts(tools, speciesName)!;
  const physical = facts.baseStats.atk >= facts.baseStats.spa;
  const base: PokemonSet = {
    name: facts.name,
    species: facts.name,
    item: "",
    ability: facts.abilities[0] ?? "",
    moves: [],
    nature: tools.gen >= 3 ? "Serious" : "",
    gender: facts.gender === "M" || facts.gender === "F" ? facts.gender : "",
    evs: defaultEvs(tools.gen),
    ivs: fullTable(31),
    level: 100,
  };
  if (hasTera(tools.gen)) base.teraType = facts.types[0] as PokemonSet["teraType"];
  const preset = EV_PRESETS.find((p) => p.key === (physical ? "physical-sweeper" : "special-sweeper"))!;
  return applyPreset(base, preset, tools.gen);
}

// ---- text import / export ----------------------------------------------------------------------------------------------

/** A team in Showdown's text format. */
export function exportText(sets: PokemonSet[]): string {
  return Teams.export(sets);
}

export interface ImportedTeam {
  /** The name from a `=== [gen9ou] Folder/Name ===` header, if the text had one. */
  name: string | null;
  /** The format from that header ("gen9ou"), if it had one. */
  formatId: string | null;
  sets: PokemonSet[];
}

/** Sets from pasted Showdown text (a single team; nicknames dropped), or null if nothing in it could be read. */
export function importText(text: string, gen = 9): ImportedTeam | null {
  const header = /^\s*===\s*(?:\[([^\]]+)\]\s*)?(?:[^/\n=]*\/)?\s*(.*?)\s*===\s*$/m.exec(text);
  const body = text.replace(/^\s*===.*===\s*$/gm, "").trim();
  if (!body) return null;
  // Read through the same safe normaliser as saved teams (defaults filled, no nicknames). Gens 1-2 write no EVs: there, anything unwritten is maxed.
  const maxed = { hp: 252, atk: 252, def: 252, spa: 252, spd: 252, spe: 252 };
  const sets = (Teams.import(body) ?? [])
    .filter((s) => s && s.species)
    .slice(0, 6)
    .flatMap((s) => normalizeSet(gen <= 2 ? { ...s, evs: { ...maxed, ...s.evs } } : s) ?? []);
  return sets.length ? { name: header?.[2] || null, formatId: header?.[1] ? header[1].toLowerCase().replace(/[^a-z0-9]/g, "") : null, sets } : null;
}
