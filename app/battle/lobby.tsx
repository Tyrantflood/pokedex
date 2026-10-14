"use client";

import { FORMATS } from "@/lib/battle/formats";
import type { Difficulty } from "@/lib/battle/cpu-player";
import { TURN_LIMITS } from "@/lib/battle/turn-limit";
import type { BattleSettings } from "./settings";

const DIFFICULTIES: { key: Difficulty; label: string; note: string }[] = [
  { key: "easy", label: "Easy", note: "Picks moves at random." },
  { key: "normal", label: "Normal", note: "Favours super effective and same-type moves, avoids immunities, sometimes switches out of a bad matchup." },
];

export function Lobby({ settings, onChange, onStart, onInvite }: { settings: BattleSettings; onChange: (settings: BattleSettings) => void; onStart: () => void; onInvite: () => void }) {
  const format = FORMATS.find((f) => f.key === settings.formatKey) ?? FORMATS[0];
  const name = settings.name.trim();
  return (
    <form
      className="mx-auto w-full max-w-2xl space-y-6 py-6"
      onSubmit={(e) => {
        e.preventDefault();
        if (name) onStart();
      }}
    >
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Battle</h1>
        <p className="mt-1 text-sm text-zinc-400">Random teams of six, one Pokémon out at a time. Play the CPU right here in your browser, or invite a friend with a link.</p>
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
        <legend className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Format</legend>
        <div className="mt-1 grid grid-cols-3 gap-2">
          {FORMATS.map((f, i) => (
            <label
              key={f.key}
              className={`cursor-pointer rounded-xl border p-3 transition-colors has-focus-visible:outline-2 has-focus-visible:outline-teal-300 ${i === 0 ? "col-span-3" : "text-center"} ${
                settings.formatKey === f.key ? "border-teal-300/60 bg-teal-300/10" : "border-white/10 bg-zinc-900/60 hover:border-white/25"
              }`}
            >
              <input type="radio" name="format" value={f.key} checked={settings.formatKey === f.key} onChange={() => onChange({ ...settings, formatKey: f.key })} className="sr-only" />
              <span className="block text-sm font-bold text-white">{i === 0 ? f.label : f.label.replace("Generation ", "Gen ")}</span>
              {i === 0 &&<span className="mt-0.5 block text-xs text-zinc-400">{f.note}</span>}
            </label>
          ))}
        </div>
        {format.key !== "natdex" && <p className="mt-2 text-xs text-zinc-400">{format.note}</p>}
      </fieldset>

      <fieldset>
        <legend className="text-xs font-semibold uppercase tracking-wider text-zinc-400">CPU</legend>
        <div className="mt-1 grid grid-cols-2 gap-2">
          {DIFFICULTIES.map((d) => (
            <label
              key={d.key}
              className={`cursor-pointer rounded-xl border p-3 transition-colors has-focus-visible:outline-2 has-focus-visible:outline-teal-300 ${
                settings.difficulty === d.key ? "border-teal-300/60 bg-teal-300/10" : "border-white/10 bg-zinc-900/60 hover:border-white/25"
              }`}
            >
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
            <label
              key={limit}
              className={`cursor-pointer rounded-xl border p-3 text-center transition-colors has-focus-visible:outline-2 has-focus-visible:outline-teal-300 ${
                settings.turnLimit === limit ? "border-teal-300/60 bg-teal-300/10" : "border-white/10 bg-zinc-900/60 hover:border-white/25"
              }`}
            >
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

      <button
        type="submit"
        disabled={!name}
        className="w-full rounded-xl bg-teal-300 px-4 py-3 text-base font-bold text-slate-950 transition-colors hover:bg-teal-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-300 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Battle the CPU
      </button>
      <button
        type="button"
        disabled={!name}
        onClick={onInvite}
        className="w-full rounded-xl border border-teal-300/50 px-4 py-3 text-base font-bold text-teal-100 transition-colors hover:bg-teal-300/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-300 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Invite a friend
      </button>
      <p className="-mt-3 text-center text-xs text-zinc-500">A friend battle uses the format and turn limit above and a private link only you and your friend have.</p>
    </form>
  );
}
