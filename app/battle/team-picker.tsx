"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { BattleFormat } from "@/lib/battle/formats";
import type { TeamStore } from "@/lib/battle/my-teams";
import type { RecommendedTeam } from "@/lib/battle/recommended";
import type { TeamPick } from "./settings";
import { TagChip, TeamIcons } from "./team-ui";

/** Loads a format's recommended teams (a big file, so only when a picker is on screen). Null while loading. */
export function useRecommended(formatKey: string): RecommendedTeam[] | null {
  const [loaded, setLoaded] = useState<{ key: string; teams: RecommendedTeam[] } | null>(null);
  useEffect(() => {
    let alive = true;
    import("@/lib/battle/recommended")
      .then((m) => alive && setLoaded({ key: formatKey, teams: m.recommendedFor(formatKey) }))
      .catch(() => alive && setLoaded({ key: formatKey, teams: [] }));
    return () => {
      alive = false;
    };
  }, [formatKey]);
  return loaded && loaded.key === formatKey ? loaded.teams : null;
}

/**
 * Choose the team to bring: one of your own (My Teams: only those built for this format that passed the validator) or a recommended one.
 * Used in the lobby (against the CPU) and in a friend's room before the battle.
 */
export function TeamPicker({
  format,
  store,
  value,
  onChange,
  onCopy,
  disabled = false,
}: {
  format: BattleFormat;
  store: TeamStore;
  value: TeamPick | undefined;
  onChange: (pick: TeamPick) => void;
  onCopy?: (team: RecommendedTeam) => void;
  disabled?: boolean;
}) {
  const recommended = useRecommended(format.key);
  const [copied, setCopied] = useState<string | null>(null);

  return (
    <div className="space-y-4" aria-label={`Choose your team for ${format.label}`}>
      <section>
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">My teams</h3>
          <Link href="/battle/teams" className="text-xs text-teal-200 underline-offset-4 hover:underline">
            Build or import teams
          </Link>
        </div>
        {store.teams.length === 0 ? (
          <p className="mt-1.5 rounded-xl border border-dashed border-white/15 p-3 text-sm text-zinc-400">You haven&apos;t saved any teams yet. Use a recommended one below, or build your own.</p>
        ) : (
          <ul className="mt-1.5 max-h-56 space-y-1.5 overflow-y-auto" role="radiogroup" aria-label="My teams">
            {store.teams.map((team) => {
              const sameFormat = team.formatKey === format.key;
              const ready = sameFormat && team.check?.ok === true && team.check.formatId === format.formatId && team.sets.length > 0;
              const reason = !sameFormat
                ? "Built for another format"
                : team.sets.length === 0
                  ? "No Pokémon yet"
                  : !team.check
                    ? "Not checked yet: open it and save"
                    : team.check.ok
                      ? null
                      : `Has problems (${team.check.errors.length}): open it to fix`;
              const selected = value?.source === "mine" && value.id === team.id;
              return (
                <li key={team.id}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    disabled={!ready || disabled}
                    onClick={() => onChange({ source: "mine", id: team.id })}
                    className={`flex w-full items-center gap-3 rounded-xl border p-2.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-teal-300 disabled:cursor-not-allowed ${
                      selected ? "border-teal-300/60 bg-teal-300/10" : ready ? "border-white/10 bg-zinc-900/60 hover:border-white/25" : "border-white/5 bg-zinc-900/30 opacity-60"
                    }`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-white">{team.name}</span>
                      <span className="block text-xs text-zinc-400">{reason ?? "Ready"}</span>
                    </span>
                    <TeamIcons icons={team.icons} size={24} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Recommended</h3>
        {recommended === null ? (
          <p className="mt-1.5 text-sm text-zinc-400" role="status">
            Loading…
          </p>
        ) : recommended.length === 0 ? (
          <p className="mt-1.5 text-sm text-zinc-400">No recommended teams for this format.</p>
        ) : (
          <ul className="mt-1.5 max-h-80 space-y-1.5 overflow-y-auto" role="radiogroup" aria-label="Recommended teams">
            {recommended.map((team) => {
              const selected = value?.source === "recommended" && value.id === team.id;
              return (
                <li key={team.id} className={`rounded-xl border transition-colors ${selected ? "border-teal-300/60 bg-teal-300/10" : "border-white/10 bg-zinc-900/60 hover:border-white/25"}`}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    disabled={disabled}
                    onClick={() => onChange({ source: "recommended", id: team.id })}
                    className="block w-full rounded-xl p-2.5 text-left focus-visible:outline-2 focus-visible:outline-teal-300"
                  >
                    <span className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-white">{team.name}</span>
                      <TagChip tag={team.tag} />
                    </span>
                    <span className="mt-1 block">
                      <TeamIcons icons={team.icons} size={24} />
                    </span>
                    <span className="mt-1 block text-xs text-zinc-400">{team.why}</span>
                    <span className="mt-1 block text-[11px] text-zinc-500">By {team.author} · from Smogon&apos;s sample teams</span>
                  </button>
                  {onCopy && (
                    <div className="border-t border-white/5 px-2.5 py-1.5 text-right">
                      <button
                        type="button"
                        onClick={() => {
                          onCopy(team);
                          setCopied(team.id);
                        }}
                        className="text-xs font-semibold text-teal-200 underline-offset-4 hover:underline"
                      >
                        {copied === team.id ? "Copied to My Teams" : "Copy into My Teams to edit"}
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
