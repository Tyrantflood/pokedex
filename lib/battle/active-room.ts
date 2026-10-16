/**
 * The friend battle this browser is in, remembered so that leaving the page by mistake (Back to Pokédex, a closed tab) is recoverable: the lobby,
 * the Pokédex and the header's Battle button offer a way straight back. Saved in localStorage "battle:active-room" while the room is not over and
 * cleared when it is. Pure.
 */
import { isRoomCode, ROOM_TTL_MS } from "./room-protocol";

export const ACTIVE_ROOM_KEY = "battle:active-room";

export interface ActiveRoom {
  code: string;
  formatKey: string;
  /** Where the room was last seen. Only "playing" has a forfeit clock; the other two are waiting for people or teams. */
  phase: "waiting" | "teams" | "playing";
  /** When this was last written (ms since epoch). */
  savedAt: number;
}

/** The saved room, or null if nothing valid and recent is saved (a damaged value, a bad code, or one the server would have deleted by now). */
export function parseActiveRoom(raw: string | null | undefined, now: number): ActiveRoom | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<ActiveRoom> | null;
    if (!v || !isRoomCode(v.code) || typeof v.formatKey !== "string" || v.formatKey.length > 30) return null;
    if (v.phase !== "waiting" && v.phase !== "teams" && v.phase !== "playing") return null;
    if (typeof v.savedAt !== "number" || !Number.isFinite(v.savedAt) || now - v.savedAt > ROOM_TTL_MS || v.savedAt > now + 60_000) return null;
    return { code: v.code, formatKey: v.formatKey, phase: v.phase, savedAt: v.savedAt };
  } catch {
    return null;
  }
}

export const serializeActiveRoom = (room: ActiveRoom): string => JSON.stringify(room);

/** Where to go to get back into it. */
export const activeRoomPath = (room: Pick<ActiveRoom, "code">): string => `/battle?room=${room.code}`;

/** What leaving costs: only a battle that is under way has a clock. */
export const leavingCostsForfeit = (room: Pick<ActiveRoom, "phase">): boolean => room.phase === "playing";
