"use client";

import { useState } from "react";
import { TEAM_FORMATS } from "@/lib/battle/formats";
import { CREDIT, recommendedFormat, type RecommendedTeam } from "@/lib/battle/recommended";
import { TagChip, TeamIcons } from "../team-ui";

/** A set written out plainly, from the stored data (no simulator needed): "Great Tusk @ Booster Energy · Earthquake / Rapid Spin / …". */
function setLine(set: RecommendedTeam["sets"][number]): string {
  return `${set.species}${set.item ? ` @ ${set.item}` : ""}${set.ability ? ` · ${set.ability}` : ""} — ${set.moves.join(" / ")}`;
}

/**
 * The recommended teams for each format, with who made them and why they work, and a button to copy one into My Teams. These are Smogon's
 * published sample teams; the tag and the sentence are worked out from the team itself (see lib/battle/team-style.ts).
 */
export function RecommendedBrowser({ onCopy, onBack }: { onCopy: (team: RecommendedTeam) => void; onBack: () => void }) {
  const [formatKey, setFormatKey] = useState("team-gen9ou");
  const [open, setOpen] = useState<string | null>(null);
  const [copied, setCopied] = useState<Set<string>>(new Set());
  const data = recommendedFormat(formatKey);
  const format = TEAM_FORMATS.find((f) => f.key === formatKey)!;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Recommended teams</h1>
          <p className="mt-1 max-w-2xl text-sm text-zinc-400">
            Real teams from Smogon&apos;s sample teams, one list per format. Use one straight away when you battle, or copy it into My Teams to change it.
          </p>
        </div>
        <button type="button" onClick={onBack} className="rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold text-zinc-200 hover:bg-white/5">
          Back to My Teams
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Format">
        {TEAM_FORMATS.map((f) => (
          <button
            key={f.key}
            type="button"
            role="tab"
            aria-selected={f.key === formatKey}
            onClick={() => {
              setFormatKey(f.key);
              setOpen(null);
            }}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${f.key === formatKey ? "border-teal-300/60 bg-teal-300/15 text-teal-100" : "border-white/15 text-zinc-300 hover:border-white/30"}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {data && data.teams.length > 0 ? (
        <>
          <p className="text-xs text-zinc-500">
            {data.published} sample {data.published === 1 ? "team was" : "teams were"} published for {format.label}; {data.valid} still {data.valid === 1 ? "passes" : "pass"} today&apos;s rules
            {data.teams.length < data.valid ? `, and these ${data.teams.length} have the best type synergy` : ""}. Teams the current rules reject are left out.
          </p>
          <ul className="grid gap-3 md:grid-cols-2">
            {data.teams.map((team) => (
              <li key={team.id} className="flex flex-col rounded-2xl border border-white/10 bg-zinc-900/60 p-4">
                <div className="flex items-start gap-2">
                  <h2 className="min-w-0 flex-1 text-base font-bold text-white">{team.name}</h2>
                  <TagChip tag={team.tag} />
                </div>
                <div className="mt-2">
                  <TeamIcons icons={team.icons} size={32} />
                </div>
                <p className="mt-2 flex-1 text-sm text-zinc-300">{team.why}</p>
                <p className="mt-2 text-[11px] text-zinc-500">
                  Team by {team.author} · <a href={CREDIT.url} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">Smogon</a> sample teams{team.title ? ` · posted as “${team.title}”` : ""}
                </p>
                {open === team.id && (
                  <ul className="mt-2 space-y-1 rounded-xl bg-black/30 p-2.5 text-xs text-zinc-300">
                    {team.sets.map((set, i) => (
                      <li key={i}>{setLine(set)}</li>
                    ))}
                  </ul>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      onCopy(team);
                      setCopied((c) => new Set(c).add(team.id));
                    }}
                    disabled={copied.has(team.id)}
                    className="rounded-lg bg-teal-300 px-3 py-1.5 text-xs font-bold text-slate-950 hover:bg-teal-200 disabled:bg-teal-300/30 disabled:text-teal-100"
                  >
                    {copied.has(team.id) ? "Copied to My Teams" : "Copy into My Teams"}
                  </button>
                  <button type="button" onClick={() => setOpen(open === team.id ? null : team.id)} aria-expanded={open === team.id} className="text-xs font-semibold text-teal-200 underline-offset-4 hover:underline">
                    {open === team.id ? "Hide sets" : "Show sets"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="rounded-xl border border-dashed border-white/15 p-4 text-sm text-zinc-400">No recommended teams for {format.label}.</p>
      )}

      <footer className="rounded-xl border border-white/10 bg-zinc-900/40 p-3 text-xs leading-relaxed text-zinc-400">
        <p>
          Teams and their names are posted by members of the <a href={CREDIT.url} target="_blank" rel="noreferrer" className="text-teal-200 underline-offset-2 hover:underline">Smogon</a> forums, collected by the{" "}
          <a href={CREDIT.via} target="_blank" rel="noreferrer" className="text-teal-200 underline-offset-2 hover:underline">pkmn/smogon</a> project. The playstyle tag and the one-line description are generated from each team&apos;s own moves, abilities and types; they are not Smogon&apos;s words. Every team here passes the simulator&apos;s team validator for its format.
        </p>
      </footer>
    </div>
  );
}
