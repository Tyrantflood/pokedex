import type { PokemonSet } from "@pkmn/sets";
import { findTeam, type TeamStore } from "@/lib/battle/my-teams";
import type { TeamPick } from "./settings";

export interface ChosenTeam {
  name: string;
  sets: PokemonSet[];
  source: TeamPick["source"];
  id: string;
}

/** The team a pick points at: one of the player's own (from the saved teams) or a recommended one (loaded on demand: it's a big file). */
export async function resolvePick(pick: TeamPick | undefined, store: TeamStore): Promise<ChosenTeam | null> {
  if (!pick) return null;
  if (pick.source === "mine") {
    const team = findTeam(store, pick.id);
    return team ? { name: team.name, sets: team.sets, source: "mine", id: team.id } : null;
  }
  const { findRecommended } = await import("@/lib/battle/recommended");
  const team = findRecommended(pick.id);
  return team ? { name: team.name, sets: team.sets, source: "recommended", id: team.id } : null;
}

/** Whether a pick can be battled with right now (for enabling a button): a recommended team of this format, or a saved team that passed the check. */
export function pickUsable(pick: TeamPick | undefined, store: TeamStore, format: { key: string; formatId: string }): boolean {
  if (!pick) return false;
  if (pick.source === "recommended") return pick.id.startsWith(`${format.key}-`);
  const team = findTeam(store, pick.id);
  return !!team && team.formatKey === format.key && team.sets.length > 0 && team.check?.ok === true && team.check.formatId === format.formatId;
}
