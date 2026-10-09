import { cacheLife } from "next/cache";
import { API, getJson } from "./pokeapi";

export interface EvolutionNode {
  species: string;
  /** Species id; for default forms this is also the pokemon id used by sprite URLs. */
  id: number;
  sprite: string;
  /** How this stage is reached from the previous one ("Lv. 16", "Use Fire Stone", ...). */
  requirement: string | null;
  children: EvolutionNode[];
}

interface RawDetail {
  trigger: { name: string };
  min_level: number | null;
  min_happiness: number | null;
  time_of_day: string;
  item: { name: string } | null;
  held_item: { name: string } | null;
  known_move: { name: string } | null;
  location: { name: string } | null;
}

interface RawLink {
  species: { name: string; url: string };
  evolution_details: RawDetail[];
  evolves_to: RawLink[];
}

const pretty = (s: string) => s.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

function describe(details: RawDetail[]): string | null {
  const d = details[0];
  if (!d) return null;
  const parts: string[] = [];
  if (d.item) parts.push(`Use ${pretty(d.item.name)}`);
  else if (d.trigger.name === "trade") parts.push("Trade");
  else if (d.trigger.name === "level-up") parts.push(d.min_level ? `Lv. ${d.min_level}` : "Level up");
  else parts.push(pretty(d.trigger.name));
  if (d.held_item) parts.push(`holding ${pretty(d.held_item.name)}`);
  if (d.min_happiness) parts.push("with high friendship");
  if (d.known_move) parts.push(`knowing ${pretty(d.known_move.name)}`);
  if (d.time_of_day) parts.push(`at ${d.time_of_day}`);
  if (d.location) parts.push("at a special place");
  return parts.join(" ");
}

function toNode(link: RawLink): EvolutionNode {
  const id = Number(link.species.url.match(/\/pokemon-species\/(\d+)\/?$/)?.[1]);
  return {
    species: link.species.name,
    id,
    sprite: `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`,
    requirement: describe(link.evolution_details),
    children: link.evolves_to.map(toNode),
  };
}

/** The whole evolution tree a species belongs to. Cached; throws on API failure (never cached). */
export async function getEvolutionChain(species: string): Promise<EvolutionNode> {
  "use cache";
  cacheLife("max");

  const sp = await getJson<{ evolution_chain: { url: string } }>(`${API}/pokemon-species/${species}`);
  const chain = await getJson<{ chain: RawLink }>(sp.evolution_chain.url);
  return toNode(chain.chain);
}
