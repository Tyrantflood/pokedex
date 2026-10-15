/**
 * What the browser and the room server say to each other (JSON over a WebSocket), plus the small rules both sides share. Pure: no
 * simulator, no Cloudflare, no React, so the server, the browser and the tests all import it.
 */
import type { SideId } from "./protocol";

/** A player who has been gone this long forfeits. */
export const FORFEIT_AFTER_MS = 60_000;
/** A player has this long to choose each turn (and the lead at Team Preview); when it runs out a random legal choice is made for them. */
export const TURN_MS = 90_000;
/** A room nobody has touched for this long is deleted from storage. */
export const ROOM_TTL_MS = 6 * 60 * 60 * 1000;
/** Anything bigger than this from a client is refused unread. (A packed team of six is well under 2,000 characters; see MAX_PACKED_TEAM_CHARS.) */
export const MAX_CLIENT_MESSAGE_CHARS = 4000;
export const MAX_PACKED_TEAM_CHARS = 3000;
export const MAX_NAME_CHARS = 18;

export interface RoomConfig {
  /** A key from lib/battle/formats.ts. */
  formatKey: string;
  /** 0 = no limit. */
  turnLimit: number;
}

/** waiting: one seat taken; teams: both seated but a "bring your own team" battle is still waiting for a team; playing; ended. */
export type RoomPhase = "waiting" | "teams" | "playing" | "ended";

export interface PlayerStatus {
  side: SideId;
  name: string;
  connected: boolean;
  /** "Bring your own team" battles: this player has handed in a team that passed the validator. (Which team stays secret.) */
  ready: boolean;
  /** Milliseconds until this player forfeits for being away, if they are away during a battle. */
  forfeitInMs: number | null;
  /** Milliseconds this player has left to choose (the turn timer), or null when they owe no choice. */
  turnInMs: number | null;
  /** After a battle: this player has agreed to a rematch in the same room. */
  rematch: boolean;
}

// ---- browser -> server -------------------------------------------------------------------------------------------------

export type ClientMessage =
  /** Always the first message. `config` is sent by whoever creates the room; the friend who follows the link sends none. */
  | { type: "hello"; clientId: string; name: string; config?: RoomConfig }
  | { type: "choose"; choice: string; rqid: number }
  /** "Bring your own team" battles: this player's team in the simulator's packed format. The server checks it against the format. */
  | { type: "team"; packed: string }
  /** Take the team back, to pick another before the battle starts. */
  | { type: "unready" }
  /** After a battle: agree to play again in this room. It starts when both players have agreed. */
  | { type: "rematch" }
  | { type: "forfeit" }
  | { type: "ping" };

// ---- server -> browser -------------------------------------------------------------------------------------------------

export type ErrorCode = "full" | "not-found" | "bad-hello" | "bad-message" | "bad-code" | "too-big";

export type ServerMessage =
  | { type: "welcome"; side: SideId; code: string; config: RoomConfig; name: string }
  | { type: "status"; phase: RoomPhase; players: PlayerStatus[] }
  /** Protocol lines for this player only (their side of the simulator's stream), and what they may do next. `instant`: catching up after a refresh. */
  | { type: "battle"; lines: string[]; request: unknown | null; error: string | null; instant?: boolean }
  /** A player ran out of time and a random legal choice was made for them (shown as a notice; not part of the battle log). */
  | { type: "timeout"; side: SideId; name: string }
  /** The verdict on a submitted team. */
  | { type: "team-result"; ok: boolean; errors: string[] }
  | { type: "error"; code: ErrorCode; message: string }
  | { type: "pong" };

// ---- shared rules ------------------------------------------------------------------------------------------------------

/** Room codes are 16 random base32 characters (80 bits): unguessable, and the only thing that protects a room. */
export const ROOM_CODE_PATTERN = /^[a-z2-7]{12,40}$/;
export const isRoomCode = (code: unknown): code is string => typeof code === "string" && ROOM_CODE_PATTERN.test(code);

const BASE32 = "abcdefghijklmnopqrstuvwxyz234567";
/** A fresh room code from the platform's secure random generator. */
export function newRoomCode(random: (bytes: Uint8Array) => Uint8Array = (b) => crypto.getRandomValues(b)): string {
  const bytes = random(new Uint8Array(16));
  return [...bytes].map((b) => BASE32[b & 31]).join("");
}

/** A client id is a random string the browser keeps, which is how a refresh finds its seat again. */
export const isClientId = (id: unknown): id is string => typeof id === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(id);

/** A guest name: control characters and runs of spaces removed, at most 18 characters, never empty. */
export function sanitizeName(raw: unknown): string {
  const text = typeof raw === "string" ? raw : "";
  const cleaned = text.replace(/[\u0000-\u001f\u007f<>|]/g, "").replace(/\s+/g, " ").trim().slice(0, MAX_NAME_CHARS).trim();
  return cleaned || "Guest";
}

/** The only choices the simulator accepts from a player ("team 3" picks a lead at Team Preview, "team 312456" a whole order); anything else is refused before it reaches the simulator. */
export const CHOICE_PATTERN = /^(move [1-4]( (mega|ultra|zmove|dynamax|terastallize))?|switch [1-6]|team [1-6]{1,6}|default)$/;
export const isValidChoice = (choice: unknown): choice is string => typeof choice === "string" && CHOICE_PATTERN.test(choice);

/** A packed team as text: not empty, not huge, and no control characters (the simulator's packed format is one line). */
export const isPackedTeamText = (packed: unknown): packed is string =>
  typeof packed === "string" && packed.length > 0 && packed.length <= MAX_PACKED_TEAM_CHARS && !/[\u0000-\u001f\u007f]/.test(packed);

export function parseClientMessage(raw: string): ClientMessage | null {
  if (raw.length > MAX_CLIENT_MESSAGE_CHARS) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object") return null;
  const m = value as Record<string, unknown>;
  switch (m.type) {
    case "hello": {
      if (!isClientId(m.clientId) || typeof m.name !== "string") return null;
      let config: RoomConfig | undefined;
      if (m.config !== undefined) {
        const c = m.config as Record<string, unknown> | null;
        if (!c || typeof c.formatKey !== "string" || c.formatKey.length > 20 || typeof c.turnLimit !== "number") return null;
        config = { formatKey: c.formatKey, turnLimit: c.turnLimit };
      }
      return { type: "hello", clientId: m.clientId, name: m.name, config };
    }
    case "choose":
      return isValidChoice(m.choice) && typeof m.rqid === "number" && Number.isInteger(m.rqid) ? { type: "choose", choice: m.choice, rqid: m.rqid } : null;
    case "team":
      return isPackedTeamText(m.packed) ? { type: "team", packed: m.packed } : null;
    case "unready":
      return { type: "unready" };
    case "rematch":
      return { type: "rematch" };
    case "forfeit":
      return { type: "forfeit" };
    case "ping":
      return { type: "ping" };
    default:
      return null;
  }
}
