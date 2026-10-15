"use client";

import dynamic from "next/dynamic";
import { useRef, useState } from "react";
import { ScannerLink } from "../../scanner-link";
import { formatByKey, TEAM_FORMATS } from "@/lib/battle/formats";
import { copyTeam, exportBackup, findTeam, importBackup, MAX_TEAMS, newTeamId, removeTeam, upsertTeam, type SavedTeam } from "@/lib/battle/my-teams";
import { toSavedTeam, type RecommendedTeam } from "@/lib/battle/recommended";
import { TeamIcons } from "../team-ui";
import { useMyTeams } from "../use-my-teams";
import { useTeamTools } from "../use-team-tools";

// The editor and the recommended list are big (they bring the simulator's helpers and the team data), so they load when first opened.
const TeamEditor = dynamic(() => import("./team-editor").then((m) => m.TeamEditor), { loading: () => <p className="py-6 text-sm text-zinc-400">Loading the team builder…</p> });
const RecommendedBrowser = dynamic(() => import("./recommended-browser").then((m) => m.RecommendedBrowser), { loading: () => <p className="py-6 text-sm text-zinc-400">Loading recommended teams…</p> });

type View = { kind: "list" } | { kind: "edit"; team: SavedTeam; fresh: boolean } | { kind: "recommended" } | { kind: "import" };

const button = "rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold text-zinc-100 transition-colors hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-300";

export function TeamsApp() {
  const { store, save } = useMyTeams();
  const [view, setView] = useState<View>({ kind: "list" });
  const [newFormat, setNewFormat] = useState("team-gen9ou");
  const [notice, setNotice] = useState<string | null>(null);
  const restore = useRef<HTMLInputElement>(null);

  const startNew = () =>
    setView({ kind: "edit", fresh: true, team: { id: newTeamId(), name: "", formatKey: newFormat, sets: [], updatedAt: Date.now(), check: null, icons: [] } });

  const copyRecommended = (team: RecommendedTeam) => {
    if (store.teams.length >= MAX_TEAMS) return setNotice(`You can keep ${MAX_TEAMS} teams. Delete one first.`);
    save(upsertTeam(store, toSavedTeam(team, newTeamId(), Date.now())));
    setNotice(`Copied "${team.name}" into My Teams.`);
  };

  const download = () => {
    const blob = new Blob([exportBackup(store, Date.now())], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `pokedex-battle-teams-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const readBackup = async (file: File | undefined) => {
    if (!file) return;
    const result = importBackup(await file.text(), store);
    if (!result.ok) return setNotice(result.reason);
    save(result.store);
    setNotice(`Restored ${result.added} ${result.added === 1 ? "team" : "teams"}${result.skipped ? ` (${result.skipped} already here or over the limit)` : ""}.`);
  };

  return (
    <main className="mx-auto w-full max-w-6xl px-4 pb-16 pt-4">
      <nav className="flex flex-wrap items-center gap-2">
        <ScannerLink href="/battle">Back to Battle</ScannerLink>
        <ScannerLink href="/">Pokédex</ScannerLink>
      </nav>

      {view.kind === "edit" ? (
        <div className="mt-4">
          <h1 className="mb-4 text-3xl font-bold tracking-tight">{view.fresh ? "New team" : "Edit team"}</h1>
          <TeamEditor
            initial={view.team}
            onSave={(team) => {
              save(upsertTeam(store, team));
              setNotice(team.check?.ok ? `Saved "${team.name}". It's legal in ${formatByKey(team.formatKey).label}.` : `Saved "${team.name}", but it isn't legal yet (see the notes).`);
              setView({ kind: "list" });
            }}
            onCancel={() => setView({ kind: "list" })}
            onDelete={
              view.fresh
                ? undefined
                : () => {
                    if (window.confirm(`Delete "${view.team.name}"? This can't be undone.`)) {
                      save(removeTeam(store, view.team.id));
                      setView({ kind: "list" });
                    }
                  }
            }
          />
        </div>
      ) : view.kind === "recommended" ? (
        <div className="mt-4">
          <RecommendedBrowser onCopy={copyRecommended} onBack={() => setView({ kind: "list" })} />
          {notice && (
            <p role="status" className="fixed inset-x-4 bottom-4 z-40 mx-auto max-w-md rounded-xl border border-teal-300/40 bg-zinc-900 px-4 py-3 text-center text-sm text-teal-100 shadow-2xl">
              {notice}
            </p>
          )}
        </div>
      ) : view.kind === "import" ? (
        <ImportPanel
          onCancel={() => setView({ kind: "list" })}
          onImported={(team) => {
            save(upsertTeam(store, team));
            setNotice(`Imported "${team.name}".`);
            setView({ kind: "list" });
          }}
        />
      ) : (
        <div className="mt-4 space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">My Teams</h1>
              <p className="mt-1 max-w-2xl text-sm text-zinc-400">Build teams for the battler&apos;s &quot;Bring your own team&quot; formats. They are saved in this browser only, so back them up if you care about them.</p>
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-2 rounded-2xl border border-white/10 bg-zinc-900/40 p-3">
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">New team for</span>
              <select value={newFormat} onChange={(e) => setNewFormat(e.target.value)} className="mt-1 block rounded-xl border border-white/10 bg-zinc-900/70 px-3 py-2 text-sm text-white focus:border-teal-300/60 focus:outline-none">
                {TEAM_FORMATS.map((f) => (
                  <option key={f.key} value={f.key}>
                    {f.label}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" onClick={startNew} disabled={store.teams.length >= MAX_TEAMS} className="rounded-xl bg-teal-300 px-4 py-2 text-sm font-bold text-slate-950 hover:bg-teal-200 disabled:opacity-40">
              Create team
            </button>
            <span className="mx-1 hidden h-8 w-px bg-white/10 sm:block" aria-hidden />
            <button type="button" onClick={() => setView({ kind: "import" })} className={button}>
              Import from Showdown
            </button>
            <button type="button" onClick={() => setView({ kind: "recommended" })} className={button}>
              Recommended teams
            </button>
            <span className="ml-auto flex flex-wrap gap-2">
              <button type="button" onClick={download} disabled={store.teams.length === 0} className={`${button} disabled:opacity-40`}>
                Back up all teams
              </button>
              <button type="button" onClick={() => restore.current?.click()} className={button}>
                Restore backup
              </button>
              <input
                ref={restore}
                type="file"
                accept="application/json,.json"
                hidden
                onChange={(e) => {
                  void readBackup(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </span>
          </div>

          {notice && (
            <p role="status" className="rounded-xl border border-teal-300/40 bg-teal-300/10 px-4 py-2.5 text-sm text-teal-100">
              {notice}
            </p>
          )}

          {store.teams.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/15 p-8 text-center">
              <p className="text-base font-semibold text-white">No teams yet</p>
              <p className="mx-auto mt-1 max-w-md text-sm text-zinc-400">Create one, paste one from Pokémon Showdown, or copy a recommended team to start from.</p>
            </div>
          ) : (
            <ul className="grid gap-3 md:grid-cols-2" aria-label="Saved teams">
              {store.teams.map((team) => (
                <TeamCard
                  key={team.id}
                  team={team}
                  onEdit={() => setView({ kind: "edit", team, fresh: false })}
                  onDuplicate={() => {
                    save(upsertTeam(store, copyTeam(team, `${team.name} (copy)`, newTeamId(), Date.now())));
                    setNotice(`Duplicated "${team.name}".`);
                  }}
                  onDelete={() => {
                    if (window.confirm(`Delete "${team.name}"? This can't be undone.`)) {
                      save(removeTeam(store, team.id));
                      setNotice(`Deleted "${team.name}".`);
                    }
                  }}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </main>
  );
}

function TeamCard({ team, onEdit, onDuplicate, onDelete }: { team: SavedTeam; onEdit: () => void; onDuplicate: () => void; onDelete: () => void }) {
  const format = formatByKey(team.formatKey);
  const [exporting, setExporting] = useState(false);
  const status = team.sets.length === 0 ? { text: "Empty", tone: "text-zinc-400" } : !team.check ? { text: "Not checked yet", tone: "text-amber-200" } : team.check.ok ? { text: "Legal", tone: "text-emerald-300" } : { text: `${team.check.errors.length} ${team.check.errors.length === 1 ? "problem" : "problems"}`, tone: "text-red-300" };
  return (
    <li className="flex flex-col rounded-2xl border border-white/10 bg-zinc-900/60 p-4">
      <div className="flex items-start gap-2">
        <h2 className="min-w-0 flex-1 truncate text-base font-bold text-white">{team.name}</h2>
        <span className={`shrink-0 text-xs font-semibold ${status.tone}`}>{status.text}</span>
      </div>
      <p className="text-xs text-zinc-400">
        {format.label} · {team.sets.length} {team.sets.length === 1 ? "Pokémon" : "Pokémon"}
      </p>
      <div className="mt-2">
        <TeamIcons icons={team.icons} size={32} />
      </div>
      {team.check && !team.check.ok && team.check.errors[0] && <p className="mt-2 text-xs text-red-200">{team.check.errors[0]}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" onClick={onEdit} className="rounded-lg bg-teal-300 px-3 py-1.5 text-xs font-bold text-slate-950 hover:bg-teal-200">
          Edit
        </button>
        <button type="button" onClick={() => setExporting((e) => !e)} aria-expanded={exporting} disabled={team.sets.length === 0} className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-semibold text-zinc-200 hover:bg-white/5 disabled:opacity-40">
          Export
        </button>
        <button type="button" onClick={onDuplicate} className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-semibold text-zinc-200 hover:bg-white/5">
          Duplicate
        </button>
        <button type="button" onClick={onDelete} className="ml-auto rounded-lg px-3 py-1.5 text-xs font-semibold text-red-300 hover:bg-red-400/10">
          Delete
        </button>
      </div>
      {exporting && <ExportBox team={team} />}
    </li>
  );
}

/** A team as Showdown text with a Copy button. Loads the simulator's helpers when opened (they write the text). */
function ExportBox({ team }: { team: SavedTeam }) {
  const { check } = useTeamTools(null);
  const [copied, setCopied] = useState(false);
  const text = check ? check.exportText(team.sets) : "";
  return (
    <div className="mt-3 space-y-2">
      <textarea readOnly value={check ? text : "Loading…"} rows={8} aria-label={`${team.name} in Showdown text format`} onFocus={(e) => e.currentTarget.select()} className="block w-full rounded-lg border border-white/10 bg-zinc-950/70 p-2 font-mono text-xs text-zinc-200" />
      <button
        type="button"
        disabled={!text}
        onClick={() => {
          void navigator.clipboard?.writeText(text).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          });
        }}
        className="rounded-lg bg-teal-300 px-3 py-1.5 text-xs font-bold text-slate-950 hover:bg-teal-200 disabled:opacity-40"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

/** Paste a team in Showdown's text format; it is read, put through the validator for the chosen format, and saved either way. */
function ImportPanel({ onImported, onCancel }: { onImported: (team: SavedTeam) => void; onCancel: () => void }) {
  const [text, setText] = useState("");
  const [formatKey, setFormatKey] = useState("team-gen9ou");
  const [name, setName] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const format = formatByKey(formatKey);
  const { check, tools } = useTeamTools(format.formatId);

  const submit = () => {
    if (!check || !tools) return;
    const first = check.importText(text, format.gen);
    if (!first) return setProblem("Couldn't find any Pokémon in that text. Paste a team exported from Pokémon Showdown.");
    // A "=== [gen9ou] Name ===" header picks the format when this site has it.
    const headerFormat = first.formatId && TEAM_FORMATS.find((f) => f.formatId.split("@@@")[0] === first.formatId);
    const key = headerFormat ? headerFormat.key : formatKey;
    const useFormat = formatByKey(key);
    const imported = headerFormat && useFormat.gen !== format.gen ? (check.importText(text, useFormat.gen) ?? first) : first;
    const useTools = check.toolsFor(useFormat.formatId);
    const verdict = check.validateSets(useTools, imported.sets);
    const facts = imported.sets.map((s) => check.speciesFacts(useTools, s.species));
    onImported({
      id: newTeamId(),
      name: (name.trim() || imported.name || "Imported team").slice(0, 40),
      formatKey: key,
      sets: imported.sets,
      updatedAt: Date.now(),
      check: { ok: verdict.ok, errors: verdict.errors.slice(0, 30), formatId: useFormat.formatId },
      icons: facts.flatMap((f) => (f ? [f.spriteId] : [])),
    });
  };

  return (
    <div className="mt-4 max-w-2xl space-y-4">
      <h1 className="text-3xl font-bold tracking-tight">Import a team</h1>
      <p className="text-sm text-zinc-400">Paste a team in Pokémon Showdown&apos;s text format (the &quot;Export&quot; box in its teambuilder). It is checked against the format you choose; a team with problems is still saved so you can fix it.</p>
      <div className="flex flex-wrap gap-3">
        <label className="block min-w-48 flex-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Name (optional)</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} className="mt-1 block w-full rounded-xl border border-white/10 bg-zinc-900/70 px-3 py-2 text-sm text-white focus:border-teal-300/60 focus:outline-none" />
        </label>
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Format</span>
          <select value={formatKey} onChange={(e) => setFormatKey(e.target.value)} className="mt-1 block rounded-xl border border-white/10 bg-zinc-900/70 px-3 py-2 text-sm text-white focus:border-teal-300/60 focus:outline-none">
            {TEAM_FORMATS.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="block">
        <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Team text</span>
        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setProblem(null);
          }}
          rows={14}
          placeholder={"Great Tusk @ Leftovers\nAbility: Protosynthesis\nTera Type: Steel\nEVs: 252 HP / 4 Atk / 252 Def\nImpish Nature\n- Rapid Spin\n- Headlong Rush\n- Knock Off\n- Ice Spinner"}
          className="mt-1 block w-full rounded-xl border border-white/10 bg-zinc-950/70 p-3 font-mono text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-teal-300/60 focus:outline-none"
        />
      </label>
      {problem && (
        <p role="alert" className="rounded-xl border border-red-400/40 bg-red-950/30 p-3 text-sm text-red-100">
          {problem}
        </p>
      )}
      <div className="flex gap-2">
        <button type="button" onClick={submit} disabled={!text.trim() || !tools} className="rounded-xl bg-teal-300 px-5 py-2.5 text-sm font-bold text-slate-950 hover:bg-teal-200 disabled:opacity-40">
          {tools ? "Import" : "Loading…"}
        </button>
        <button type="button" onClick={onCancel} className={button}>
          Cancel
        </button>
      </div>
    </div>
  );
}

// Used by the list to find a team by id when the store changes under an open editor.
export { findTeam };
