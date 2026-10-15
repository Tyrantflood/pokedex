"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { loadCry, playCry } from "@/lib/cry-audio";
import { cryUrl } from "@/lib/battle/ids";
import type { BattleFormat } from "@/lib/battle/formats";
import { moveHoldMs, planMove, sequenceLines, type HitFlags, type MoveFx } from "@/lib/battle/move-fx";
import { speedFor } from "@/lib/battle/speed";
import { applyLine, cloneView, createView, syncRequest, type BattleView, type Cue, type ParsedRequest, type SideId } from "@/lib/battle/protocol";
import type { PlayerStatus, RoomConfig, RoomPhase } from "@/lib/battle/room-protocol";
// Type-only: the simulator itself is loaded with `import()` below, only when a battle starts.
import type { BattleMessage, Difficulty, LocalBattle } from "@/lib/battle/engine";
import type { PokemonSet } from "@pkmn/sets";
import type { ConnectionState } from "@/lib/battle/online-engine";

export interface BattleConfig {
  format: BattleFormat;
  difficulty: Difficulty;
  playerName: string;
  /** 0 = no limit. */
  turnLimit: number;
  /** "Bring your own team" formats: the player's team and the CPU's (a recommended one). */
  teams?: { player: PokemonSet[]; cpu: PokemonSet[] };
}

/** A friend battle: which room, who we are, and (for whoever creates it) what kind of battle it is. */
export interface RoomSpec {
  host: string;
  code: string;
  clientId: string;
  name: string;
  create?: RoomConfig;
}

export type SessionSpec = { kind: "cpu"; config: BattleConfig } | { kind: "online"; room: RoomSpec };

export interface PlayedCue extends Cue {
  /** Changes with every cue, so an effect can replay even when the same kind repeats. */
  id: number;
  /** Type of the last move used, for colouring hit effects. */
  lastMoveType: string;
  /** Multiplies animation durations: 1 at normal speed, a third for Fast. */
  timeScale: number;
  /** Reduced motion: no movement, only text and flashes. */
  reduced: boolean;
  /** Move cues: the animation chosen for the move. */
  fx?: MoveFx;
  /** Damage cues: how the hit went (critical, super effective, resisted). */
  hit?: HitFlags;
  /** When the cue was played (performance.now()), to drop old ones. */
  at: number;
  /** Whose side of the battle is "yours": where each Pokémon is drawn depends on it. */
  own: SideId;
}

export interface RoomState {
  code: string;
  config: RoomConfig;
  /** The name this player has in the battle. */
  you: string;
  phase: RoomPhase;
  players: PlayerStatus[];
  connection: ConnectionState;
  /** When `players` was last reported (Date.now()), so a countdown can run on from it. */
  statusAt: number;
}

export interface BattleState {
  /** waiting: for a friend to arrive; teams: both are here and a "bring your own team" battle is waiting for teams. */
  status: "loading" | "waiting" | "teams" | "playing" | "over" | "error";
  error: string | null;
  /** For an error: why (a room server's code such as "full" or "not-found"). */
  errorCode: string | null;
  view: BattleView;
  /** Which side is yours (always p1 against the CPU; p1 or p2 in a friend battle). */
  ownSide: SideId;
  cue: PlayedCue | null;
  /** The last few seconds of cues, still playing out on the field. */
  cues: PlayedCue[];
  /** What the player may choose now; null while the log is still playing or the opponent is thinking. */
  request: ParsedRequest | null;
  /** The simulator refused the last choice. */
  refused: string | null;
  helpers: Pick<LocalBattle, "moveDetails" | "itemText" | "abilityText" | "lookups"> | null;
  /** Friend battles: the room, who is in it and whether we are connected. */
  room: RoomState | null;
  /** The server's verdict on the team this player last handed in (null before one was). */
  teamResult: { ok: boolean; errors: string[] } | null;
}

const IDLE: BattleState = {
  status: "loading",
  error: null,
  errorCode: null,
  view: createView(),
  ownSide: "p1",
  cue: null,
  cues: [],
  request: null,
  refused: null,
  helpers: null,
  room: null,
  teamResult: null,
};

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** `spec` must be stable (memoise it): a new object starts a new battle. */
export function useBattleSession(spec: SessionSpec | null, options: { muted: boolean; fast: boolean }) {
  const [state, setState] = useState<BattleState>(IDLE);
  const reducedMotion = useReducedMotion();
  // Read inside the playback loop, which outlives any one render.
  const optionsRef = useRef({ ...options, reducedMotion: !!reducedMotion });
  optionsRef.current = { ...options, reducedMotion: !!reducedMotion };
  const battleRef = useRef<LocalBattle | null>(null);
  const lastRequest = useRef<ParsedRequest | null>(null);
  /** The request the last choice answered, restored if the simulator refuses that choice. */
  const answered = useRef<ParsedRequest | null>(null);

  useEffect(() => {
    if (!spec) return;
    let cancelled = false;
    const draft = createView();
    const queue: BattleMessage[] = [];
    let pumping = false;
    let cueId = 0;
    let lastMoveType = "normal";
    let recent: PlayedCue[] = [];
    let battle: LocalBattle | null = null;
    let own: SideId = "p1";
    let stop: (() => void) | null = null;

    const publish = (patch: Partial<BattleState>) => {
      if (!cancelled) setState((s) => ({ ...s, view: cloneView(draft), ...patch }));
    };

    const pump = async () => {
      if (pumping || !battle) return;
      pumping = true;
      try {
        while (queue.length && !cancelled) {
          const message = queue.shift()!;
          if (message.error) {
            lastRequest.current = answered.current;
            publish({ refused: message.error, request: lastRequest.current });
            continue;
          }
          if (message.instant) {
            // Catching up after a refresh or a reconnect: this is the whole log, so start the view afresh and apply it without the show.
            Object.assign(draft, createView());
            recent = [];
            for (const line of message.lines) applyLine(draft, line, own, battle.lookups);
            if (message.request) {
              syncRequest(draft, own, message.request, battle.lookups);
              lastRequest.current = message.request.wait ? null : message.request;
            } else lastRequest.current = null;
            answered.current = null;
            publish({ cue: null, cues: [] });
            continue;
          }
          // The simulator reports "super effective" before the damage; play it after the HP bar has moved (see sequenceLines).
          for (const step of sequenceLines(message.lines)) {
            const result = applyLine(draft, step.line, own, battle.lookups);
            if (result.cue?.kind === "move") lastMoveType = result.cue.moveType ?? lastMoveType;
            if (!result.delay) continue;
            const o = optionsRef.current;
            const speed = speedFor(o);
            let delay = result.delay;
            let cue: PlayedCue | null = null;
            if (result.cue) {
              cue = { ...result.cue, id: ++cueId, lastMoveType, timeScale: 1 / speed, reduced: o.reducedMotion, hit: step.hit, at: performance.now(), own };
              if (cue.kind === "move") {
                // Banner, then the attack beat: the move line holds for both, so the impact (the damage line) lands right after.
                cue.fx = planMove({ name: cue.moveName ?? "", type: cue.moveType ?? "normal", category: cue.moveCategory ?? "Status", selfTarget: !!cue.selfTarget });
                delay = moveHoldMs(cue.fx, o.reducedMotion);
              }
            }
            const live = cue ? [...recent.filter((c) => cue!.at - c.at < 3500), cue] : recent;
            recent = live;
            publish(cue ? { cue, cues: live } : {});
            if (cue?.kind === "switch" && !optionsRef.current.muted) {
              const mon = draft.sides[cue.side].mons[draft.sides[cue.side].active];
              if (mon) playCry(cryUrl(mon.spriteId)).catch(() => {});
            }
            // Reduced motion shortens the waits (x6) but never below a readable moment for the banner (moveHoldMs is already absolute).
            await sleep(cue?.kind === "move" && o.reducedMotion ? delay : delay / speed);
          }
          if (message.request) {
            syncRequest(draft, own, message.request, battle.lookups);
            if (!message.request.wait) lastRequest.current = message.request;
            else lastRequest.current = null;
          }
        }
        if (cancelled) return;
        const over = draft.winner !== null;
        publish({ status: over ? "over" : "playing", request: over ? null : lastRequest.current, refused: null });
      } finally {
        pumping = false;
      }
    };

    const receive = (message: BattleMessage) => {
      queue.push(message);
      void pump();
    };

    setState({ ...IDLE });
    lastRequest.current = null;
    answered.current = null;
    (async () => {
      try {
        if (spec.kind === "cpu") {
          const engine = await import("@/lib/battle/engine");
          if (cancelled) return;
          battle = engine.startLocalBattle(spec.config, receive);
          battleRef.current = battle;
          stop = () => battle?.destroy();
          setState((s) => ({ ...s, helpers: { moveDetails: battle!.moveDetails, itemText: battle!.itemText, abilityText: battle!.abilityText, lookups: battle!.lookups } }));
        } else {
          const online = await import("@/lib/battle/online-engine");
          if (cancelled) return;
          const handle = online.startOnlineBattle(spec.room, {
            onReady(source, welcome) {
              battle = source;
              battleRef.current = source;
              own = welcome.side;
              setState((s) => ({
                ...s,
                ownSide: welcome.side,
                helpers: { moveDetails: source.moveDetails, itemText: source.itemText, abilityText: source.abilityText, lookups: source.lookups },
                room: { code: spec.room.code, config: welcome.config, you: welcome.name, phase: "waiting", players: [], connection: "open", statusAt: Date.now() },
              }));
              void pump(); // anything that arrived while the source was being made
            },
            onMessage: receive,
            onTeamResult(teamResult) {
              if (!cancelled) setState((s) => ({ ...s, teamResult }));
            },
            onStatus(status) {
              if (cancelled) return;
              setState((s) => ({
                ...s,
                status:
                  s.status === "over"
                    ? "over"
                    : status.phase === "waiting"
                      ? "waiting"
                      : status.phase === "teams"
                        ? "teams"
                        : s.status === "waiting" || s.status === "teams" || s.status === "loading"
                          ? "playing"
                          : s.status,
                room: s.room ? { ...s.room, phase: status.phase, players: status.players, statusAt: Date.now() } : s.room,
              }));
            },
            onConnection(connection) {
              if (!cancelled) setState((s) => ({ ...s, room: s.room ? { ...s.room, connection } : s.room }));
            },
            onError(error) {
              if (!cancelled) setState((s) => ({ ...s, status: "error", error: error.message, errorCode: error.code }));
            },
          });
          stop = handle.destroy;
        }
      } catch (error) {
        if (!cancelled) setState((s) => ({ ...s, status: "error", error: error instanceof Error ? error.message : "The battle simulator failed to load." }));
      }
    })();

    return () => {
      cancelled = true;
      battleRef.current = null;
      stop?.();
    };
  }, [spec]);

  // Cries for the player's team, warmed as soon as it is known.
  const team = state.request?.team;
  const warmed = useRef(false);
  useEffect(() => {
    if (!team || warmed.current || optionsRef.current.muted) return;
    warmed.current = true;
    const lookups = battleRef.current?.lookups;
    if (!lookups) return;
    for (const member of team) void loadCry(cryUrl(lookups.species(member.species).spriteId)).catch(() => {});
  }, [team]);
  useEffect(() => {
    warmed.current = false;
  }, [spec]);

  const choose = useCallback((choice: string) => {
    const rqid = lastRequest.current?.rqid;
    answered.current = lastRequest.current;
    lastRequest.current = null;
    setState((s) => ({ ...s, request: null, refused: null }));
    battleRef.current?.choose(choice, rqid);
  }, []);

  const forfeit = useCallback(() => battleRef.current?.forfeit(), []);
  /** Friend battles with "bring your own team": hand in a packed team, or take it back. */
  const submitTeam = useCallback((packed: string) => {
    setState((s) => ({ ...s, teamResult: null }));
    battleRef.current?.submitTeam?.(packed);
  }, []);
  const withdrawTeam = useCallback(() => {
    setState((s) => ({ ...s, teamResult: null }));
    battleRef.current?.withdrawTeam?.();
  }, []);

  return { state, choose, forfeit, submitTeam, withdrawTeam };
}
