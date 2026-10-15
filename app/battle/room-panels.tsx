"use client";

import { useEffect, useRef, useState } from "react";
import { inviteUrl } from "@/lib/battle/room-config";
import type { SideId } from "@/lib/battle/protocol";
import type { ConnectionState } from "@/lib/battle/online-engine";
import type { RoomState } from "./use-battle-session";

/** The private link to send, with Copy and (where the browser has it) Share. */
export function InviteLink({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const url = typeof window === "undefined" ? "" : inviteUrl(window.location.origin, code);
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      input.current?.select(); // clipboard blocked: leave it selected for the person to copy
    }
  };

  return (
    <div className="flex items-stretch gap-2">
      <input
        ref={input}
        readOnly
        value={url}
        aria-label="Invite link"
        onFocus={(e) => e.currentTarget.select()}
        className="min-w-0 flex-1 rounded-xl border border-white/10 bg-zinc-950/70 px-3 py-2 font-mono text-xs text-teal-100"
      />
      <button type="button" onClick={copy} className="shrink-0 rounded-xl bg-teal-300 px-4 py-2 text-sm font-bold text-slate-950 hover:bg-teal-200">
        {copied ? "Copied" : "Copy link"}
      </button>
      {canShare && (
        <button type="button" onClick={() => void navigator.share({ title: "Pokémon battle", text: "Battle me!", url }).catch(() => {})} className="shrink-0 rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold text-zinc-200 hover:bg-white/5">
          Share
        </button>
      )}
    </div>
  );
}

/** What the creator sees until their friend arrives: the private link to send. */
export function WaitingPanel({ code, connection, onLeave }: { code: string; connection: ConnectionState; onLeave: () => void }) {
  return (
    <div className="mx-auto mt-6 w-full max-w-xl space-y-5 rounded-2xl border border-white/10 bg-zinc-900/60 p-6 text-center" role="status">
      <div className="mx-auto size-10 rounded-full border-2 border-teal-300/70 motion-safe:animate-pulse" aria-hidden />
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Waiting for your friend</h1>
        <p className="mt-1 text-sm text-zinc-400">Send them this link. The battle starts the moment they open it. Only the two of you can ever be in it.</p>
      </div>
      <InviteLink code={code} />
      {connection !== "open" && <p className="text-xs text-amber-200">Connection lost: reconnecting…</p>}
      <p className="text-xs text-zinc-500">Keep this page open (a refresh is fine). Your friend can use any browser.</p>
      <button type="button" onClick={onLeave} className="text-sm text-zinc-400 underline-offset-4 hover:text-white hover:underline">
        Cancel and go back
      </button>
    </div>
  );
}

const ERROR_TEXT: Record<string, { title: string; body: string }> = {
  full: { title: "This battle is full", body: "It already has two players. Ask your friend for a new link." },
  "not-found": { title: "No battle here", body: "The link may be wrong, or the battle has expired. Ask your friend for a new link." },
  "bad-code": { title: "That isn't a battle link", body: "Check that the whole link was copied." },
};

export function RoomError({ code, message, onLeave }: { code: string | null; message: string | null; onLeave: () => void }) {
  const text = (code && ERROR_TEXT[code]) || { title: "Couldn't join the battle", body: message ?? "Something went wrong." };
  return (
    <div className="mx-auto mt-6 w-full max-w-xl space-y-4 rounded-2xl border border-red-400/30 bg-red-950/30 p-6 text-center" role="alert">
      <h1 className="text-2xl font-bold tracking-tight">{text.title}</h1>
      <p className="text-sm text-red-100/80">{text.body}</p>
      <button type="button" onClick={onLeave} className="rounded-xl bg-teal-300 px-4 py-2 text-sm font-bold text-slate-950 hover:bg-teal-200">
        Back to the lobby
      </button>
    </div>
  );
}

/** Shown while the connection to the room is down; it reconnects by itself and the battle carries on where it was. */
export function ConnectionBanner({ connection }: { connection: ConnectionState }) {
  if (connection === "open") return null;
  return (
    <p className="rounded-lg border border-amber-300/40 bg-amber-300/10 px-3 py-1.5 text-center text-xs font-semibold text-amber-100" role="status">
      {connection === "connecting" ? "Connecting…" : "Connection lost: reconnecting. Your battle is safe on the server."}
    </p>
  );
}

/** The friend has gone: how long until they forfeit. */
export function AwayBanner({ room, ownSide }: { room: RoomState; ownSide: SideId }) {
  const away = room.players.find((p) => p.side !== ownSide && !p.connected && p.forfeitInMs !== null);
  if (!away) return null;
  return <AwayCountdown key={`${away.side}:${room.statusAt}`} name={away.name} forfeitInMs={away.forfeitInMs!} since={room.statusAt} />;
}

function AwayCountdown({ name, forfeitInMs, since }: { name: string; forfeitInMs: number; since: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, []);
  const seconds = Math.max(0, Math.ceil((forfeitInMs - (now - since)) / 1000));
  return (
    <p className="rounded-lg border border-amber-300/40 bg-amber-300/10 px-3 py-1.5 text-center text-xs font-semibold text-amber-100" role="status">
      {name} has disconnected.{" "}
      {seconds > 0 ? `If they aren't back in ${seconds} s they forfeit and you win.` : "Forfeiting now…"}
    </p>
  );
}
