"use client";

import { useMemo, useState } from "react";
import { ScannerLink } from "../scanner-link";
import { formatByKey } from "@/lib/battle/formats";
import type { Difficulty } from "@/lib/battle/cpu-player";
import { ActionPanel } from "./action-panel";
import { BattleField } from "./battle-field";
import { BattleLog } from "./battle-log";
import { Lobby } from "./lobby";
import { isLastStand } from "@/lib/battle/music-data";
import { useBattleMusic } from "./use-battle-music";
import { useLocalBattle, type BattleConfig } from "./use-local-battle";
import { useStored } from "./use-stored";

export interface BattleSettings {
  name: string;
  formatKey: string;
  difficulty: Difficulty;
}

const DEFAULTS: BattleSettings = { name: "", formatKey: "natdex", difficulty: "normal" };
const SETTINGS_KEY = "battle:settings";
const MUTED_KEY = "battle:muted";
const MUSIC_KEY = "battle:music";
const VOLUME_KEY = "battle:music-volume";

function parseSettings(raw: string): BattleSettings {
  try {
    const parsed = JSON.parse(raw || "{}");
    return {
      name: typeof parsed.name === "string" ? parsed.name.slice(0, 18) : "",
      formatKey: formatByKey(parsed.formatKey).key,
      difficulty: parsed.difficulty === "easy" ? "easy" : "normal",
    };
  } catch {
    return DEFAULTS;
  }
}
export function BattleApp() {
  const [rawSettings, setRawSettings] = useStored(SETTINGS_KEY);
  const settings = useMemo(() => parseSettings(rawSettings), [rawSettings]);
  const [run, setRun] = useState<{ id: number; config: BattleConfig } | null>(null);
  const update = (next: BattleSettings) => setRawSettings(JSON.stringify(next));
  const begin = (config: BattleConfig) => setRun((previous) => ({ id: (previous?.id ?? 0) + 1, config }));
  const start = () => begin({ format: formatByKey(settings.formatKey), difficulty: settings.difficulty, playerName: settings.name.trim() || "Trainer" });

  return (
    <main className="mx-auto w-full max-w-6xl px-4 pb-10 pt-4">
      <nav className="flex items-center justify-between">
        <ScannerLink href="/">Back to Pokédex</ScannerLink>
      </nav>
      {run ? (
        // Keyed by run, so "Rematch" mounts a fresh battle.
        <BattleScreen key={run.id} config={run.config} onRematch={() => begin({ ...run.config })} onLeave={() => setRun(null)} />
      ) : (
        <Lobby settings={settings} onChange={update} onStart={start} />
      )}
    </main>
  );
}

function BattleScreen({ config, onRematch, onLeave }: { config: BattleConfig; onRematch: () => void; onLeave: () => void }) {
  const [mutedRaw, setMutedRaw] = useStored(MUTED_KEY);
  const muted = mutedRaw === "1";
  const [fast, setFast] = useState(false);
  const [confirmForfeit, setConfirmForfeit] = useState(false);
  const { state, choose, forfeit } = useLocalBattle(config, { muted, fast });
  const { view } = state;
  const over = state.status === "over";

  const toggleMute = () => setMutedRaw(muted ? "0" : "1");

  // Music: on by default, volume 0..100 (default 60), both remembered. It only starts once a battle is under way.
  const [musicRaw, setMusicRaw] = useStored(MUSIC_KEY);
  const [volumeRaw, setVolumeRaw] = useStored(VOLUME_KEY);
  const musicOn = musicRaw !== "0";
  const volumePercent = volumeRaw === "" || Number.isNaN(Number(volumeRaw)) ? 60 : Math.max(0, Math.min(100, Number(volumeRaw)));
  useBattleMusic({
    enabled: musicOn,
    volume: volumePercent / 100,
    playing: state.status === "playing" || state.status === "over",
    mode: isLastStand(view.sides.p1) && !over ? "intense" : "normal",
    outcome: view.winner === null ? null : view.winner === config.playerName ? "win" : "lose",
  });

  return (
    <div className="mt-3 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm text-zinc-300">
            <span className="font-bold text-white">{config.format.label}</span> · CPU {config.difficulty === "easy" ? "Easy" : "Normal"}
          </div>
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

        {state.status === "error" ? (
          <div className="rounded-2xl border border-red-400/30 bg-red-950/30 p-6 text-center" role="alert">
            <p className="text-sm text-red-200">The battle couldn&apos;t start: {state.error}</p>
            <button type="button" onClick={onRematch} className="mt-3 rounded-xl bg-teal-300 px-4 py-2 text-sm font-bold text-slate-950">
              Try again
            </button>
          </div>
        ) : (
          <div className="relative">
            <BattleField view={view} cue={state.cue} />
            {state.status === "loading" && (
              <div className="absolute inset-0 grid place-items-center rounded-2xl bg-black/50 text-sm text-zinc-200" role="status">
                Loading the simulator…
              </div>
            )}
            {over && <ResultOverlay winner={view.winner} playerName={config.playerName} onRematch={onRematch} onLeave={onLeave} />}
          </div>
        )}
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

function ResultOverlay({ winner, playerName, onRematch, onLeave }: { winner: string | null; playerName: string; onRematch: () => void; onLeave: () => void }) {
  const won = winner === playerName;
  const title = winner === "" ? "It's a tie" : won ? "You won!" : "You lost";
  return (
    <div className="absolute inset-0 z-20 grid place-items-center rounded-2xl bg-black/65 p-4 backdrop-blur-sm">
      <div className="w-full max-w-xs rounded-2xl border border-white/15 bg-zinc-900/95 p-5 text-center shadow-2xl" role="dialog" aria-label="Battle result">
        <p className={`text-2xl font-bold ${won ? "text-amber-200" : "text-white"}`}>{title}</p>
        <div className="mt-4 flex flex-col gap-2">
          <button type="button" autoFocus onClick={onRematch} className="rounded-xl bg-teal-300 px-4 py-2.5 text-sm font-bold text-slate-950 hover:bg-teal-200">
            Rematch
          </button>
          <button type="button" onClick={onLeave} className="rounded-xl border border-white/15 px-4 py-2.5 text-sm font-semibold text-zinc-200 hover:bg-white/5">
            Change settings
          </button>
        </div>
      </div>
    </div>
  );
}
