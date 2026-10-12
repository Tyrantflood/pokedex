"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { loadCry, playCry } from "@/lib/cry-audio";
import { cryUrl } from "@/lib/battle/ids";
import type { BattleFormat } from "@/lib/battle/formats";
import { moveHoldMs, planMove, sequenceLines, type HitFlags, type MoveFx } from "@/lib/battle/move-fx";
import { applyLine, cloneView, createView, syncRequest, type BattleView, type Cue, type ParsedRequest } from "@/lib/battle/protocol";
// Type-only: the simulator itself is loaded with `import()` below, only when a battle starts.
import type { BattleMessage, Difficulty, LocalBattle } from "@/lib/battle/engine";

export interface BattleConfig {
  format: BattleFormat;
  difficulty: Difficulty;
  playerName: string;
}

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
}

export interface BattleState {
  status: "loading" | "playing" | "over" | "error";
  error: string | null;
  view: BattleView;
  cue: PlayedCue | null;
  /** The last few seconds of cues, still playing out on the field. */
  cues: PlayedCue[];
  /** What the player may choose now; null while the log is still playing or the opponent is thinking. */
  request: ParsedRequest | null;
  /** The simulator refused the last choice. */
  refused: string | null;
  helpers: Pick<LocalBattle, "moveDetails" | "itemText" | "abilityText" | "lookups"> | null;
}

const IDLE: BattleState = { status: "loading", error: null, view: createView(), cue: null, cues: [], request: null, refused: null, helpers: null };

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function useLocalBattle(config: BattleConfig | null, options: { muted: boolean; fast: boolean }) {
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
    if (!config) return;
    let cancelled = false;
    const draft = createView();
    const queue: BattleMessage[] = [];
    let pumping = false;
    let cueId = 0;
    let lastMoveType = "normal";
    let recent: PlayedCue[] = [];
    let battle: LocalBattle | null = null;

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
          // The simulator reports "super effective" before the damage; play it after the HP bar has moved (see sequenceLines).
          for (const step of sequenceLines(message.lines)) {
            const result = applyLine(draft, step.line, "p1", battle.lookups);
            if (result.cue?.kind === "move") lastMoveType = result.cue.moveType ?? lastMoveType;
            if (!result.delay) continue;
            const o = optionsRef.current;
            const speed = o.reducedMotion ? 6 : o.fast ? 3 : 1;
            let delay = result.delay;
            let cue: PlayedCue | null = null;
            if (result.cue) {
              cue = { ...result.cue, id: ++cueId, lastMoveType, timeScale: 1 / speed, reduced: o.reducedMotion, hit: step.hit, at: performance.now() };
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
            syncRequest(draft, "p1", message.request, battle.lookups);
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

    setState({ ...IDLE });
    lastRequest.current = null;
    (async () => {
      try {
        const engine = await import("@/lib/battle/engine");
        if (cancelled) return;
        battle = engine.startLocalBattle(config, (message) => {
          queue.push(message);
          void pump();
        });
        battleRef.current = battle;
        setState((s) => ({ ...s, helpers: { moveDetails: battle!.moveDetails, itemText: battle!.itemText, abilityText: battle!.abilityText, lookups: battle!.lookups } }));
      } catch (error) {
        if (!cancelled) setState((s) => ({ ...s, status: "error", error: error instanceof Error ? error.message : "The battle simulator failed to load." }));
      }
    })();

    return () => {
      cancelled = true;
      battleRef.current = null;
      battle?.destroy();
    };
  }, [config]);

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
  }, [config]);

  const choose = useCallback((choice: string) => {
    answered.current = lastRequest.current;
    lastRequest.current = null;
    setState((s) => ({ ...s, request: null, refused: null }));
    battleRef.current?.choose(choice);
  }, []);

  const forfeit = useCallback(() => battleRef.current?.forfeit(), []);

  return { state, choose, forfeit };
}
