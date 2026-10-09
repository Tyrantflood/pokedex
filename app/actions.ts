"use server";

import { getEvolutionChain, type EvolutionNode } from "@/lib/evolution";

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
