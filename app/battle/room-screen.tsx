"use client";

import { useMemo, useState } from "react";
import { battleHost } from "@/lib/battle/room-config";
import { sanitizeName, type RoomConfig } from "@/lib/battle/room-protocol";
import { BattleSession } from "./battle-session";
import { clientId } from "./client-id";
import { RoomError } from "./room-panels";
import type { SessionSpec } from "./use-battle-session";
import { createKey, parseSettings, SETTINGS_KEY } from "./settings";
import { useStored } from "./use-stored";

/**
 * /battle?room=CODE: a friend battle. Whoever created the room (this tab remembers that, with the kind of battle) says what it is when
 * it connects; the friend following the link only needs a name. Names are kept in this browser, like every other setting.
 */
export function RoomScreen({ code, onLeave }: { code: string | null; onLeave: () => void }) {
  const [rawSettings, setRawSettings] = useStored(SETTINGS_KEY);
  const settings = useMemo(() => parseSettings(rawSettings), [rawSettings]);
  const [draft, setDraft] = useState("");
  const name = sanitizeName(settings.name || "") === "Guest" && !settings.name.trim() ? "" : sanitizeName(settings.name);

  if (!code) return <RoomError code="bad-code" message={null} onLeave={onLeave} />;

  if (!name) {
    // A friend who has never played here: just a name, and straight in.
    return (
      <form
        className="mx-auto mt-6 w-full max-w-md space-y-4 rounded-2xl border border-white/10 bg-zinc-900/60 p-6"
        onSubmit={(e) => {
          e.preventDefault();
          const chosen = sanitizeName(draft);
          if (draft.trim()) setRawSettings(JSON.stringify({ ...settings, name: chosen }));
        }}
      >
        <h1 className="text-2xl font-bold tracking-tight">You&apos;ve been invited to a battle</h1>
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Your name</span>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={18}
            required
            autoFocus
            autoComplete="nickname"
            placeholder="Any name you like"
            className="mt-1 block w-full rounded-xl border border-white/10 bg-zinc-950/70 px-3 py-2.5 text-base text-white placeholder:text-zinc-500 focus:border-teal-300/60 focus:outline-none"
          />
        </label>
        <button type="submit" disabled={!draft.trim()} className="w-full rounded-xl bg-teal-300 px-4 py-3 text-base font-bold text-slate-950 hover:bg-teal-200 disabled:cursor-not-allowed disabled:opacity-40">
          Join the battle
        </button>
        <p className="text-xs text-zinc-500">The name stays in this browser. No account needed.</p>
      </form>
    );
  }
  return <Room code={code} name={name} onLeave={onLeave} />;
}

function Room({ code, name, onLeave }: { code: string; name: string; onLeave: () => void }) {
  // Built once per room and name (the hook starts a new connection for a new object), and only in the browser: it reads storage.
  const spec = useMemo<SessionSpec>(() => {
    let create: RoomConfig | undefined;
    try {
      const saved = sessionStorage.getItem(createKey(code));
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed.formatKey === "string" && typeof parsed.turnLimit === "number") create = { formatKey: parsed.formatKey, turnLimit: parsed.turnLimit };
      }
    } catch {
      /* no saved kind of battle: this tab joins rather than creates */
    }
    return { kind: "online", room: { host: battleHost(process.env.NEXT_PUBLIC_BATTLE_HOST, window.location.hostname), code, clientId: clientId(), name, create } };
  }, [code, name]);
  return <BattleSession spec={spec} onLeave={onLeave} />;
}
