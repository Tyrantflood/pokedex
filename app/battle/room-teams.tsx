"use client";

import { useMemo, useState } from "react";
import { formatByKey } from "@/lib/battle/formats";
import { newTeamId, upsertTeam } from "@/lib/battle/my-teams";
import type { RecommendedTeam } from "@/lib/battle/recommended";
import type { SideId } from "@/lib/battle/protocol";
import { InviteLink } from "./room-panels";
import { parseSettings, SETTINGS_KEY, type TeamPick } from "./settings";
import { TeamPicker } from "./team-picker";
import { pickUsable, resolvePick } from "./team-source";
import { useMyTeams } from "./use-my-teams";
import { useStored } from "./use-stored";
import { useTeamTools } from "./use-team-tools";
import type { RoomState } from "./use-battle-session";

/**
 * Before a "bring your own team" friend battle: pick a team and press Ready. The server checks the team against the format and starts the
 * battle when both players are ready. The other player sees only that you are ready, never which team.
 */
export function RoomTeams({
  room,
  ownSide,
  waitingForFriend,
  teamResult,
  onSubmit,
  onWithdraw,
  onLeave,
}: {
  room: RoomState;
  ownSide: SideId;
  /** The friend has not arrived yet (the invite link is shown). */
  waitingForFriend: boolean;
  teamResult: { ok: boolean; errors: string[] } | null;
  onSubmit: (packed: string) => void;
  onWithdraw: () => void;
  onLeave: () => void;
}) {
  const format = formatByKey(room.config.formatKey);
  const [rawSettings, setRawSettings] = useStored(SETTINGS_KEY);
  const settings = useMemo(() => parseSettings(rawSettings), [rawSettings]);
  const { store, save } = useMyTeams();
  const { check, tools } = useTeamTools(format.formatId);
  const [problems, setProblems] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const pick = settings.teams[format.key];
  const you = room.players.find((p) => p.side === ownSide);
  const friend = room.players.find((p) => p.side !== ownSide);
  const ready = !!you?.ready;
  const usable = pickUsable(pick, store, format);

  const setPick = (next: TeamPick) => setRawSettings(JSON.stringify({ ...settings, teams: { ...settings.teams, [format.key]: next } }));
  const copy = async (team: RecommendedTeam) => {
    const { toSavedTeam } = await import("@/lib/battle/recommended");
    save(upsertTeam(store, toSavedTeam(team, newTeamId(), Date.now())));
  };

  const submit = async () => {
    if (!check || !tools) return;
    setBusy(true);
    setProblems([]);
    try {
      const chosen = await resolvePick(pick, store);
      if (!chosen) return setProblems(["That team isn't available any more. Choose another."]);
      // Checked here first for an instant answer; the server checks again, and its word is final.
      const verdict = check.validateSets(tools, chosen.sets);
      if (!verdict.ok) return setProblems(verdict.errors);
      onSubmit(check.packSets(verdict.sets));
    } finally {
      setBusy(false);
    }
  };

  const errors = problems.length ? problems : teamResult && !teamResult.ok ? teamResult.errors : [];
  const friendLine = waitingForFriend
    ? "Your friend hasn't opened the link yet. You can pick your team while you wait."
    : friend?.ready
      ? `${friend.name} is ready.`
      : `${friend?.name ?? "Your friend"} is choosing a team…`;

  return (
    <div className="mx-auto mt-6 w-full max-w-2xl space-y-5 rounded-2xl border border-white/10 bg-zinc-900/60 p-5 sm:p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{format.label}: choose your team</h1>
        <p className="mt-1 text-sm text-zinc-400" role="status">
          {friendLine}
        </p>
      </div>

      {waitingForFriend && <InviteLink code={room.code} />}
      {room.connection !== "open" && <p className="text-xs text-amber-200">Connection lost: reconnecting…</p>}

      {ready ? (
        <div className="space-y-3 rounded-xl border border-teal-300/40 bg-teal-300/10 p-4 text-center" role="status">
          <p className="font-semibold text-teal-100">Your team is in.</p>
          <p className="text-sm text-zinc-300">{waitingForFriend ? "The battle starts when your friend arrives and picks a team." : friend?.ready ? "Starting…" : `The battle starts when ${friend?.name ?? "your friend"} is ready.`}</p>
          <button type="button" onClick={onWithdraw} className="rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold text-zinc-200 hover:bg-white/5">
            Change my team
          </button>
        </div>
      ) : (
        <>
          <TeamPicker format={format} store={store} value={pick} onChange={setPick} onCopy={(team) => void copy(team)} />
          {errors.length > 0 && (
            <div role="alert" className="rounded-xl border border-red-400/40 bg-red-950/30 p-3 text-sm text-red-100">
              <p className="font-semibold">That team can&apos;t be used in {format.label}:</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                {errors.slice(0, 6).map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </div>
          )}
          <button
            type="button"
            disabled={!usable || busy || !tools}
            onClick={() => void submit()}
            className="w-full rounded-xl bg-teal-300 px-4 py-3 text-base font-bold text-slate-950 transition-colors hover:bg-teal-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-300 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {!tools ? "Loading the rules…" : usable ? "Ready" : "Choose a team"}
          </button>
        </>
      )}

      <button type="button" onClick={onLeave} className="block text-sm text-zinc-400 underline-offset-4 hover:text-white hover:underline">
        Leave this battle
      </button>
    </div>
  );
}
