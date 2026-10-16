"use client";

import Link from "next/link";
import { formatByKey, previewNote, RANDOM_FORMATS, TEAM_FORMATS } from "@/lib/battle/formats";
import type { Difficulty } from "@/lib/battle/cpu-player";
import type { TeamStore } from "@/lib/battle/my-teams";
import type { RecommendedTeam } from "@/lib/battle/recommended";
import { TURN_LIMITS } from "@/lib/battle/turn-limit";
import type { BattleSettings, TeamPick } from "./settings";
import { TeamPicker } from "./team-picker";
import { pickUsable } from "./team-source";

const DIFFICULTIES: { key: Difficulty; label: string; note: string }[] = [
  { key: "easy", label: "Easy", note: "Picks moves at random." },
  { key: "normal", label: "Normal", note: "Favours super effective and same-type moves, avoids immunities, sometimes switches out of a bad matchup." },
];

const choiceClass = (selected: boolean) =>
  `cursor-pointer rounded-xl border p-3 transition-colors has-focus-visible:outline-2 has-focus-visible:outline-teal-300 ${selected ? "border-teal-300/60 bg-teal-300/10" : "border-white/10 bg-zinc-900/60 hover:border-white/25"}`;

export function Lobby({
  settings,
  onChange,
  onStart,
  onInvite,
  store,
  onCopyRecommended,
  starting,
  startError,
}: {
  settings: BattleSettings;
  onChange: (settings: BattleSettings) => void;
  onStart: () => void;
  onInvite: () => void;
  store: TeamStore;
  onCopyRecommended: (team: RecommendedTeam) => void;
  /** Resolving the teams for a battle (the CPU's recommended team is loaded on demand). */
  starting: boolean;
  startError: string | null;
}) {
  const format = formatByKey(settings.formatKey);
  const name = settings.name.trim();
  const pick = settings.teams[format.key];
  const teamReady = !format.custom || pickUsable(pick, store, format);
  const setPick = (next: TeamPick) => onChange({ ...settings, teams: { ...settings.teams, [format.key]: next } });
  return (
    <form
      className="mx-auto w-full max-w-2xl space-y-6 py-6"
      onSubmit={(e) => {
        e.preventDefault();
        if (name && teamReady && !starting) onStart();
      }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Battle</h1>
          <p className="mt-1 text-sm text-zinc-400">Random teams or your own, one Pokémon out at a time. Play the CPU right here in your browser, or invite a friend with a link.</p>
        </div>
        <Link
          href="/battle/teams"
          className="shrink-0 rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold text-zinc-100 transition-colors hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-300"
        >
          My Teams
          {store.teams.length > 0 && <span className="ml-1.5 text-zinc-400">({store.teams.length})</span>}
        </Link>
      </div>

      <label className="block">
        <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Trainer name</span>
        <input
          value={settings.name}
          onChange={(e) => onChange({ ...settings, name: e.target.value })}
          maxLength={18}
          required
          autoComplete="nickname"
          placeholder="Your name"
          className="mt-1 block w-full rounded-xl border border-white/10 bg-zinc-900/70 px-3 py-2.5 text-base text-white placeholder:text-zinc-500 focus:border-teal-300/60 focus:outline-none"
        />
      </label>

      <fieldset>
        <legend className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Random teams</legend>
        <div className="mt-1 grid grid-cols-3 gap-2">
          {RANDOM_FORMATS.map((f, i) => (
            <label key={f.key} className={`${choiceClass(settings.formatKey === f.key)} ${i === 0 ? "col-span-3" : "text-center"}`}>
              <input type="radio" name="format" value={f.key} checked={settings.formatKey === f.key} onChange={() => onChange({ ...settings, formatKey: f.key })} className="sr-only" />
              <span className="block text-sm font-bold text-white">{i === 0 ? f.label : f.label.replace("Generation ", "Gen ")}</span>
              {i === 0 && <span className="mt-0.5 block text-xs text-zinc-400">{f.note}</span>}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Bring your own team</legend>
        <div className="mt-1 grid grid-cols-3 gap-2">
          {TEAM_FORMATS.map((f) => (
            <label key={f.key} className={`${choiceClass(settings.formatKey === f.key)} text-center`}>
              <input type="radio" name="format" value={f.key} checked={settings.formatKey === f.key} onChange={() => onChange({ ...settings, formatKey: f.key })} className="sr-only" />
              <span className="block text-sm font-bold text-white">{f.label}</span>
            </label>
          ))}
        </div>
        <p className="mt-2 text-xs text-zinc-400">{format.note}</p>
        {format.custom && <p className="mt-1 text-xs text-zinc-500">Teams are checked against the format&apos;s rules. {previewNote(format)}</p>}
      </fieldset>

      {format.custom && (
        <section aria-label="Your team" className="rounded-2xl border border-white/10 bg-zinc-900/40 p-4">
          <h2 className="mb-3 text-sm font-bold text-white">Your team for {format.label}</h2>
          <TeamPicker format={format} store={store} value={pick} onChange={setPick} onCopy={onCopyRecommended} />
          <p className="mt-3 text-xs text-zinc-500">Against the CPU, it plays a recommended team from Smogon&apos;s sample teams. In a friend battle you each pick your team in the room.</p>
        </section>
      )}

      <fieldset>
        <legend className="text-xs font-semibold uppercase tracking-wider text-zinc-400">CPU</legend>
        <div className="mt-1 grid grid-cols-2 gap-2">
          {DIFFICULTIES.map((d) => (
            <label key={d.key} className={choiceClass(settings.difficulty === d.key)}>
              <input type="radio" name="difficulty" value={d.key} checked={settings.difficulty === d.key} onChange={() => onChange({ ...settings, difficulty: d.key })} className="sr-only" />
              <span className="block text-sm font-bold text-white">{d.label}</span>
            </label>
          ))}
        </div>
        <p className="mt-2 text-xs text-zinc-400">{DIFFICULTIES.find((d) => d.key === settings.difficulty)?.note}</p>
      </fieldset>

      <fieldset>
        <legend className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Turn limit</legend>
        <div className="mt-1 grid grid-cols-4 gap-2">
          {TURN_LIMITS.map((limit) => (
            <label key={limit} className={`${choiceClass(settings.turnLimit === limit)} text-center`}>
              <input type="radio" name="turn-limit" value={limit} checked={settings.turnLimit === limit} onChange={() => onChange({ ...settings, turnLimit: limit })} className="sr-only" />
              <span className="block text-sm font-bold text-white">{limit === 0 ? "Off" : limit}</span>
            </label>
          ))}
        </div>
        <p className="mt-2 text-xs text-zinc-400">
          {settings.turnLimit === 0
            ? "No limit: the battle goes on until one side is out of Pokémon (the simulator still ends endless loops)."
            : `At turn ${settings.turnLimit} the side with more Pokémon left wins, then the higher total HP %; otherwise it's a draw.`}
        </p>
      </fieldset>

      {startError && (
        <p role="alert" className="rounded-xl border border-red-400/40 bg-red-950/30 p-3 text-sm text-red-100">
          {startError}
        </p>
      )}
      <button
        type="submit"
        disabled={!name || !teamReady || starting}
        className="w-full rounded-xl bg-teal-300 px-4 py-3 text-base font-bold text-slate-950 transition-colors hover:bg-teal-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-300 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {starting ? "Getting ready…" : format.custom && !teamReady ? "Choose a team to battle the CPU" : "Battle the CPU"}
      </button>
      <button
        type="button"
        disabled={!name}
        onClick={onInvite}
        className="w-full rounded-xl border border-teal-300/50 px-4 py-3 text-base font-bold text-teal-100 transition-colors hover:bg-teal-300/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-300 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Invite a friend
      </button>
      <p className="-mt-3 text-center text-xs text-zinc-500">
        A friend battle uses the format and turn limit above and a private link only you and your friend have.
        {format.custom ? " You each choose a team in the room before it starts." : ""}
      </p>
    </form>
  );
}
