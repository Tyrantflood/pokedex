import type { EvolutionNode } from "./evolution";

function find(node: EvolutionNode, species: string): EvolutionNode | null {
  if (node.species === species) return node;
  for (const child of node.children) {
    const hit = find(child, species);
    if (hit) return hit;
  }
  return null;
}

/**
 * True when `to` is a later stage of `from` in the chain (any depth: Charmander -> Charizard counts).
 * Earlier stages, siblings on another branch and the same species are all false.
 */
export function evolvesInto(chain: EvolutionNode, from: string, to: string): boolean {
  if (from === to) return false;
  const start = find(chain, from);
  return start !== null && start.children.some((child) => find(child, to) !== null);
}
