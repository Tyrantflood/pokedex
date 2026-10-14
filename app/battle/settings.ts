import type { Difficulty } from "@/lib/battle/cpu-player";
import { formatByKey } from "@/lib/battle/formats";
import { normalizeTurnLimit, type TurnLimit } from "@/lib/battle/turn-limit";

/** What the lobby remembers in this browser (localStorage "battle:settings"), the guest's name included. */
export interface BattleSettings {
  name: string;
  formatKey: string;
  difficulty: Difficulty;
  /** 0 = no limit. */
  turnLimit: TurnLimit;
}

export const SETTINGS_KEY = "battle:settings";
export const DEFAULT_SETTINGS: BattleSettings = { name: "", formatKey: "natdex", difficulty: "normal", turnLimit: 0 };

export function parseSettings(raw: string): BattleSettings {
  try {
    const parsed = JSON.parse(raw || "{}");
    return {
      name: typeof parsed.name === "string" ? parsed.name.slice(0, 18) : "",
      formatKey: formatByKey(parsed.formatKey).key,
      difficulty: parsed.difficulty === "easy" ? "easy" : "normal",
      turnLimit: normalizeTurnLimit(parsed.turnLimit),
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/** The key a room's creator parks the kind of battle under, for their own tab to read when it opens the room. */
export const createKey = (code: string) => `battle:create:${code}`;
