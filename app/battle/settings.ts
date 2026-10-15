import type { Difficulty } from "@/lib/battle/cpu-player";
import { formatByKey } from "@/lib/battle/formats";
import { normalizeTurnLimit, type TurnLimit } from "@/lib/battle/turn-limit";

/** Which team a player brought to a "bring your own team" format: one of theirs (My Teams) or a recommended one. */
export interface TeamPick {
  source: "mine" | "recommended";
  id: string;
}

/** What the lobby remembers in this browser (localStorage "battle:settings"), the guest's name included. */
export interface BattleSettings {
  name: string;
  formatKey: string;
  difficulty: Difficulty;
  /** 0 = no limit. */
  turnLimit: TurnLimit;
  /** The team last chosen for each "bring your own team" format, by format key. */
  teams: Record<string, TeamPick>;
}

export const SETTINGS_KEY = "battle:settings";
export const DEFAULT_SETTINGS: BattleSettings = { name: "", formatKey: "natdex", difficulty: "normal", turnLimit: 0, teams: {} };

function parsePicks(raw: unknown): Record<string, TeamPick> {
  const picks: Record<string, TeamPick> = {};
  if (typeof raw !== "object" || raw === null) return picks;
  for (const [key, value] of Object.entries(raw).slice(0, 30)) {
    const v = value as Partial<TeamPick> | null;
    if (v && (v.source === "mine" || v.source === "recommended") && typeof v.id === "string" && v.id.length <= 60) picks[key.slice(0, 30)] = { source: v.source, id: v.id };
  }
  return picks;
}

export function parseSettings(raw: string): BattleSettings {
  try {
    const parsed = JSON.parse(raw || "{}");
    return {
      name: typeof parsed.name === "string" ? parsed.name.slice(0, 18) : "",
      formatKey: formatByKey(parsed.formatKey).key,
      difficulty: parsed.difficulty === "easy" ? "easy" : "normal",
      turnLimit: normalizeTurnLimit(parsed.turnLimit),
      teams: parsePicks(parsed.teams),
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/** The key a room's creator parks the kind of battle under, for their own tab to read when it opens the room. */
export const createKey = (code: string) => `battle:create:${code}`;
