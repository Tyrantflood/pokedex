"use server";

import type { GameEncounters } from "@/lib/encounter-data";
import { getEncounters } from "@/lib/encounters";
import { getEvolutionChain, type EvolutionNode } from "@/lib/evolution";
import { getSpecies } from "@/lib/species";

export type EvolutionResult = { ok: true; chain: EvolutionNode } | { ok: false; error: string };

export async function loadEvolutionChain(species: string): Promise<EvolutionResult> {
  // Server actions are public endpoints: only allow plain species slugs into the API path.
  if (typeof species !== "string" || !/^[a-z0-9-]{1,40}$/.test(species)) {
    return { ok: false, error: "Invalid species" };
  }
  try {
    return { ok: true, chain: await getEvolutionChain(species) };
  } catch {
    return { ok: false, error: "Couldn't load the evolution chain." };
  }
}

export type FlavorResult = { ok: true; text: string | null } | { ok: false };

export async function loadFlavorText(species: string): Promise<FlavorResult> {
  if (typeof species !== "string" || !/^[a-z0-9-]{1,40}$/.test(species)) return { ok: false };
  try {
    return { ok: true, text: (await getSpecies(species)).flavor };
  } catch {
    return { ok: false };
  }
}

export type EncountersResult = { ok: true; games: GameEncounters[] } | { ok: false; error: string };

export async function loadEncounters(pokemonId: number): Promise<EncountersResult> {
  // Server actions are public endpoints: only a plain PokéAPI id goes into the API path.
  if (!Number.isInteger(pokemonId) || pokemonId < 1 || pokemonId > 100_000) return { ok: false, error: "Invalid Pokémon" };
  try {
    return { ok: true, games: await getEncounters(pokemonId) };
  } catch {
    return { ok: false, error: "Couldn't load encounter data." };
  }
}
