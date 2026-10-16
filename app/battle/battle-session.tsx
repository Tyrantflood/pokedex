"use client";

import { useEffect, useState } from "react";
import { formatByKey } from "@/lib/battle/formats";
import { isLastStand } from "@/lib/battle/music-data";
import { ActionPanel } from "./action-panel";
import { BattleField } from "./battle-field";
import { BattleLog } from "./battle-log";
import { AwayBanner, ConnectionBanner, RoomError, TurnTimer, WaitingPanel } from "./room-panels";
import { RoomTeams } from "./room-teams";
import { useBattleMusic } from "./use-battle-music";
import { useBattleSession, type SessionSpec } from "./use-battle-session";
import { useActiveRoom } from "./use-active-room";
import { useStored } from "./use-stored";

const MUTED_KEY = "battle:muted";
const MUSIC_KEY = "battle:music";
const VOLUME_KEY = "battle:music-volume";

/**
 * One battle on screen, whether it is against the CPU or a friend: the field, the log, what you may choose, the toggles. The kind of
 * battle only changes what is around it (a waiting panel before a friend arrives, a note when they go missing, no rematch button).
 */
export function BattleSession({ spec, onRematch, onLeave }: { spec: SessionSpec; onRematch?: () => void; onLeave: () => void }) {
  const [mutedRaw, setMutedRaw] = useStored(MUTED_KEY);
  const muted = mutedRaw === "1";
  const [fast, setFast] = useState(false);
  const [confirmForfeit, setConfirmForfeit] = useState(false);
  const { state, choose, forfeit, submitTeam, withdrawTeam, requestRematch } = useBattleSession(spec, { muted, fast });
  const { view, room } = state;
  const over = state.status === "over";
  const online = spec.kind === "online";

  // A friend battle is remembered in this browser while it is not over, so that leaving the page by mistake can be undone (see ReturnToBattle).
  const { save: saveActive, clear: clearActive } = useActiveRoom();
  const roomCode = room?.code;
  const roomFormat = room?.config.formatKey;
  const roomPhase = room?.phase;
  const finished = over || roomPhase === "ended" || state.status === "error";
  useEffect(() => {
    if (!online || !roomCode || !roomFormat || !roomPhase) return;
    if (finished) return clearActive();
    const remember = () => saveActive({ code: roomCode, formatKey: roomFormat, phase: roomPhase, savedAt: Date.now() });
    remember();
    const timer = setInterval(remember, 5 * 60_000); // keeps the saved time fresh through a long battle
    return () => clearInterval(timer);
  }, [online, roomCode, roomFormat, roomPhase, finished, saveActive, clearActive]);
  // A room that cannot be joined (full, gone, a bad code) is not one to come back to.
  useEffect(() => {
    if (online && state.status === "error") clearActive();
  }, [online, state.status, clearActive]);

  const toggleMute = () => setMutedRaw(muted ? "0" : "1");
  const playerName = spec.kind === "cpu" ? spec.config.playerName : (room?.you ?? spec.room.name);
  const turnLimit = spec.kind === "cpu" ? spec.config.turnLimit : (room?.config.turnLimit ?? 0);

  // Music: on by default, volume 0..100 (default 60), both remembered. It only starts once a battle is under way.
  const [musicRaw, setMusicRaw] = useStored(MUSIC_KEY);
  const [volumeRaw, setVolumeRaw] = useStored(VOLUME_KEY);
  const musicOn = musicRaw !== "0";
  const volumePercent = volumeRaw === "" || Number.isNaN(Number(volumeRaw)) ? 60 : Math.max(0, Math.min(100, Number(volumeRaw)));
  useBattleMusic({
    enabled: musicOn,
    volume: volumePercent / 100,
    playing: state.status === "playing" || state.status === "over",
    mode: isLastStand(view.sides[state.ownSide]) && !over ? "intense" : "normal",
    outcome: view.winner === null ? null : view.winner === playerName ? "win" : "lose",
  });

  const opponent = room?.players.find((p) => p.side !== state.ownSide);
  const friendPlayer = opponent;
  const subtitle =
    spec.kind === "cpu" ? (
      <>
        <span className="font-bold text-white">{spec.config.format.label}</span> · CPU {spec.config.difficulty === "easy" ? "Easy" : "Normal"}
        {turnLimit ? ` · ${turnLimit}-turn limit` : ""}
      </>
    ) : (
      <>
        <span className="font-bold text-white">{room ? formatByKey(room.config.formatKey).label : "Friend battle"}</span>
        {opponent ? ` · vs ${opponent.name}` : ""}
        {turnLimit ? ` · ${turnLimit}-turn limit` : ""}
      </>
    );

  if (state.status === "error" && online) return <RoomError code={state.errorCode} message={state.error} onLeave={onLeave} />;
  if ((state.status === "waiting" || state.status === "teams") && room) {
    // "Bring your own team": both players pick a team first (the host can already, while waiting). Random teams: just wait for the friend.
    if (formatByKey(room.config.formatKey).custom) {
      return <RoomTeams room={room} ownSide={state.ownSide} waitingForFriend={state.status === "waiting"} teamResult={state.teamResult} onSubmit={submitTeam} onWithdraw={withdrawTeam} onLeave={onLeave} />;
    }
    return <WaitingPanel code={room.code} connection={room.connection} onLeave={onLeave} />;
  }

  return (
    <div className="mt-3 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm text-zinc-300">{subtitle}</div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <ToggleButton pressed={fast} onClick={() => setFast((f) => !f)} label="Fast" />
            <ToggleButton pressed={!muted} onClick={toggleMute} label="Cries" />
            <ToggleButton pressed={musicOn} onClick={() => setMusicRaw(musicOn ? "0" : "1")} label="Music" />
            <label className="flex items-center gap-1.5 text-zinc-400">
              <span className="sr-only">Music volume</span>
              <span aria-hidden>Vol</span>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={volumePercent}
                onChange={(e) => setVolumeRaw(e.target.value)}
                aria-valuetext={`${volumePercent} percent`}
                disabled={!musicOn}
                className="h-1 w-20 cursor-pointer accent-teal-300 disabled:cursor-not-allowed disabled:opacity-40"
              />
            </label>
            {!over && state.status === "playing" && (
              <button
                type="button"
                onClick={() => (confirmForfeit ? (forfeit(), setConfirmForfeit(false)) : setConfirmForfeit(true))}
                onBlur={() => setConfirmForfeit(false)}
                className="rounded-full border border-red-400/40 px-3 py-1 font-semibold text-red-200 hover:bg-red-400/10"
              >
                {confirmForfeit ? "Really forfeit?" : "Forfeit"}
              </button>
            )}
          </div>
        </div>

        {room && !over && <ConnectionBanner connection={room.connection} />}
        {room && !over && state.status === "playing" && <AwayBanner room={room} ownSide={state.ownSide} />}

        {state.status === "error" ? (
          <div className="rounded-2xl border border-red-400/30 bg-red-950/30 p-6 text-center" role="alert">
            <p className="text-sm text-red-200">The battle couldn&apos;t start: {state.error}</p>
            {onRematch && (
              <button type="button" onClick={onRematch} className="mt-3 rounded-xl bg-teal-300 px-4 py-2 text-sm font-bold text-slate-950">
                Try again
              </button>
            )}
          </div>
        ) : (
          <div className="relative">
            <BattleField view={view} cue={state.cue} cues={state.cues} turnLimit={turnLimit} ownSide={state.ownSide} />
            {state.status === "loading" && (
              <div className="absolute inset-0 grid place-items-center rounded-2xl bg-black/50 text-sm text-zinc-200" role="status">
                {online ? "Connecting to the battle…" : "Loading the simulator…"}
              </div>
            )}
            {over && (
              <ResultOverlay
                winner={view.winner}
                playerName={playerName}
                onRematch={onRematch}
                onLeave={onLeave}
                online={online}
                rematch={room ? { you: !!room.players.find((p) => p.side === state.ownSide)?.rematch, friend: friendPlayer?.rematch ?? false, friendName: friendPlayer?.name ?? "Your friend", friendHere: friendPlayer?.connected ?? false, onAgree: requestRematch } : undefined}
              />
            )}
          </div>
        )}
        {room && !over && state.status === "playing" && <TurnTimer room={room} ownSide={state.ownSide} />}
        {state.status !== "error" && !over && <ActionPanel state={state} onChoose={choose} />}
      </div>
      <BattleLog log={view.log} />
    </div>
  );
}

function ToggleButton({ pressed, onClick, label }: { pressed: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={`rounded-full border px-3 py-1 font-semibold transition-colors ${pressed ? "border-teal-300/60 bg-teal-300/15 text-teal-100" : "border-white/15 text-zinc-300 hover:border-white/30"}`}
    >
      {label}
    </button>
  );
}

interface RematchState {
  /** This player has agreed to play again. */
  you: boolean;
  /** The friend has. */
  friend: boolean;
  friendName: string;
  /** The friend still has the room open. */
  friendHere: boolean;
  onAgree: () => void;
}

function ResultOverlay({ winner, playerName, onRematch, onLeave, online, rematch }: { winner: string | null; playerName: string; onRematch?: () => void; onLeave: () => void; online: boolean; rematch?: RematchState }) {
  const won = winner === playerName;
  const title = winner === "" ? "It's a tie" : won ? "You won!" : "You lost";
  return (
    <div className="absolute inset-0 z-20 grid place-items-center rounded-2xl bg-black/65 p-4">
      <div className="w-full max-w-xs rounded-2xl border border-white/15 bg-zinc-900/95 p-5 text-center shadow-2xl" role="dialog" aria-label="Battle result">
        <p className={`text-2xl font-bold ${won ? "text-amber-200" : "text-white"}`}>{title}</p>
        <div className="mt-4 flex flex-col gap-2">
          {rematch && (
            <>
              <button
                type="button"
                autoFocus
                disabled={rematch.you || !rematch.friendHere}
                onClick={rematch.onAgree}
                className="rounded-xl bg-teal-300 px-4 py-2.5 text-sm font-bold text-slate-950 hover:bg-teal-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {rematch.you ? `Waiting for ${rematch.friendName}…` : "Rematch"}
              </button>
              <p className="text-xs text-zinc-400" role="status">
                {!rematch.friendHere ? `${rematch.friendName} has left the room.` : rematch.friend && !rematch.you ? `${rematch.friendName} wants a rematch.` : rematch.you ? "Your rematch request is in. It starts when they agree." : "A rematch starts when you both agree."}
              </p>
            </>
          )}
          {onRematch && (
            <button type="button" autoFocus onClick={onRematch} className="rounded-xl bg-teal-300 px-4 py-2.5 text-sm font-bold text-slate-950 hover:bg-teal-200">
              Rematch
            </button>
          )}
          <button type="button" autoFocus={!onRematch && !rematch} onClick={onLeave} className="rounded-xl border border-white/15 px-4 py-2.5 text-sm font-semibold text-zinc-200 hover:bg-white/5">
            {online ? "Back to the lobby" : "Change settings"}
          </button>
        </div>
      </div>
    </div>
  );
}
