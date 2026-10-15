"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ScannerLink } from "../scanner-link";
import { formatByKey } from "@/lib/battle/formats";
import { newTeamId, upsertTeam } from "@/lib/battle/my-teams";
import type { RecommendedTeam } from "@/lib/battle/recommended";
import { isRoomCode, newRoomCode } from "@/lib/battle/room-protocol";
import { BattleSession } from "./battle-session";
import { Lobby } from "./lobby";
import { RoomScreen } from "./room-screen";
import { createKey, parseSettings, SETTINGS_KEY, type BattleSettings } from "./settings";
import { resolvePick } from "./team-source";
import { useMyTeams } from "./use-my-teams";
import { useStored } from "./use-stored";
import type { BattleConfig } from "./use-battle-session";

export function BattleApp() {
  const [rawSettings, setRawSettings] = useStored(SETTINGS_KEY);
  const settings = useMemo(() => parseSettings(rawSettings), [rawSettings]);
  const { store, save } = useMyTeams();
  const [run, setRun] = useState<{ id: number; config: BattleConfig } | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const router = useRouter();
  const roomParam = useSearchParams().get("room");
  const update = (next: BattleSettings) => setRawSettings(JSON.stringify(next));
  const begin = (config: BattleConfig) => setRun((previous) => ({ id: (previous?.id ?? 0) + 1, config }));

  // Builds the battle's settings. "Bring your own team" formats also need the player's team and a recommended team for the CPU (a big file, loaded now).
  const start = async () => {
    const format = formatByKey(settings.formatKey);
    const base: BattleConfig = { format, difficulty: settings.difficulty, playerName: settings.name.trim() || "Trainer", turnLimit: settings.turnLimit };
    if (!format.custom) return begin(base);
    setStarting(true);
    setStartError(null);
    try {
      const mine = await resolvePick(settings.teams[format.key], store);
      if (!mine) throw new Error("Choose one of your teams, or a recommended one.");
      const { cpuTeamFor } = await import("@/lib/battle/recommended");
      const opponent = cpuTeamFor(format.key, mine.source === "recommended" ? mine.id : null);
      if (!opponent) throw new Error(`There is no recommended team for the CPU to use in ${format.label}.`);
      begin({ ...base, teams: { player: mine.sets, cpu: opponent.sets } });
    } catch (error) {
      setStartError(error instanceof Error ? error.message : "The battle couldn't start.");
    } finally {
      setStarting(false);
    }
  };

  // Inviting a friend: make a room code, remember what kind of battle it is for this tab, and go to the room. The code is the whole secret.
  const invite = () => {
    const code = newRoomCode();
    try {
      sessionStorage.setItem(createKey(code), JSON.stringify({ formatKey: settings.formatKey, turnLimit: settings.turnLimit }));
    } catch {
      /* the room then opens without a kind of battle and says so */
    }
    router.push(`/battle?room=${code}`);
  };

  const copyRecommended = async (team: RecommendedTeam) => {
    const { toSavedTeam } = await import("@/lib/battle/recommended");
    save(upsertTeam(store, toSavedTeam(team, newTeamId(), Date.now())));
  };

  return (
    <main className="mx-auto w-full max-w-6xl px-4 pb-10 pt-4">
      <nav className="flex items-center justify-between">
        <ScannerLink href="/">Back to Pokédex</ScannerLink>
      </nav>
      {roomParam !== null ? (
        <RoomScreen code={isRoomCode(roomParam) ? roomParam : null} onLeave={() => router.push("/battle")} />
      ) : run ? (
        // Keyed by run, so "Rematch" mounts a fresh battle (with a new recommended team for the CPU, if the format has teams).
        <BattleSession
          key={run.id}
          spec={{ kind: "cpu", config: run.config }}
          onRematch={() => (run.config.format.custom ? void start() : begin({ ...run.config }))}
          onLeave={() => setRun(null)}
        />
      ) : (
        <Lobby settings={settings} onChange={update} onStart={() => void start()} onInvite={invite} store={store} onCopyRecommended={(team) => void copyRecommended(team)} starting={starting} startError={startError} />
      )}
    </main>
  );
}
