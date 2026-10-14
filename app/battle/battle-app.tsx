"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ScannerLink } from "../scanner-link";
import { formatByKey } from "@/lib/battle/formats";
import { isRoomCode, newRoomCode } from "@/lib/battle/room-protocol";
import { BattleSession } from "./battle-session";
import { Lobby } from "./lobby";
import { RoomScreen } from "./room-screen";
import { createKey, parseSettings, SETTINGS_KEY, type BattleSettings } from "./settings";
import { useStored } from "./use-stored";
import type { BattleConfig } from "./use-battle-session";

export function BattleApp() {
  const [rawSettings, setRawSettings] = useStored(SETTINGS_KEY);
  const settings = useMemo(() => parseSettings(rawSettings), [rawSettings]);
  const [run, setRun] = useState<{ id: number; config: BattleConfig } | null>(null);
  const router = useRouter();
  const roomParam = useSearchParams().get("room");
  const update = (next: BattleSettings) => setRawSettings(JSON.stringify(next));
  const begin = (config: BattleConfig) => setRun((previous) => ({ id: (previous?.id ?? 0) + 1, config }));
  const start = () => begin({ format: formatByKey(settings.formatKey), difficulty: settings.difficulty, playerName: settings.name.trim() || "Trainer", turnLimit: settings.turnLimit });

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

  return (
    <main className="mx-auto w-full max-w-6xl px-4 pb-10 pt-4">
      <nav className="flex items-center justify-between">
        <ScannerLink href="/">Back to Pokédex</ScannerLink>
      </nav>
      {roomParam !== null ? (
        <RoomScreen code={isRoomCode(roomParam) ? roomParam : null} onLeave={() => router.push("/battle")} />
      ) : run ? (
        // Keyed by run, so "Rematch" mounts a fresh battle.
        <BattleSession key={run.id} spec={{ kind: "cpu", config: run.config }} onRematch={() => begin({ ...run.config })} onLeave={() => setRun(null)} />
      ) : (
        <Lobby settings={settings} onChange={update} onStart={start} onInvite={invite} />
      )}
    </main>
  );
}
