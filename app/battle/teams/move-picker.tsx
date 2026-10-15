"use client";

import { useId, useMemo, useState } from "react";
import type { MoveChoice } from "@/lib/battle/team-check";
import { TypeChip } from "../ui";

/**
 * One move slot: shows the chosen move, and typing in it lists the legal moves that match (type, category, power, accuracy). `taken` are the
 * moves already on the set, which can't be picked twice.
 */
export function MovePicker({
  label,
  value,
  moves,
  taken,
  disabled,
  onPick,
}: {
  label: string;
  value: string;
  moves: MoveChoice[];
  taken: string[];
  disabled?: boolean;
  onPick: (name: string) => void;
}) {
  const [text, setText] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const listId = useId();
  const query = (text ?? "").trim().toLowerCase();
  const shown = useMemo(() => {
    const found = moves.filter((m) => !taken.includes(m.name) && (query === "" || m.name.toLowerCase().includes(query)));
    // Names that start with the text come first.
    return found.sort((a, b) => Number(b.name.toLowerCase().startsWith(query)) - Number(a.name.toLowerCase().startsWith(query)) || a.name.localeCompare(b.name)).slice(0, 40);
  }, [moves, taken, query]);
  const current = moves.find((m) => m.name === value);

  const choose = (name: string) => {
    onPick(name);
    setText(null);
    setOpen(false);
  };

  return (
    <div className="relative">
      <label className="block">
        <span className="sr-only">{label}</span>
        <input
          value={text ?? value}
          disabled={disabled}
          placeholder={disabled ? "Loading moves…" : "Choose a move"}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          onFocus={(e) => {
            setText("");
            setOpen(true);
            e.currentTarget.select();
          }}
          onChange={(e) => {
            setText(e.target.value);
            setOpen(true);
          }}
          onBlur={() => {
            // A click on a suggestion happens after blur; let it land first.
            setTimeout(() => {
              setOpen(false);
              setText(null);
            }, 150);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && shown.length > 0) {
              e.preventDefault();
              choose(shown[0].name);
            } else if (e.key === "Escape") {
              setOpen(false);
              setText(null);
            }
          }}
          className="block w-full rounded-lg border border-white/10 bg-zinc-950/70 px-2.5 py-2 text-sm text-white placeholder:text-zinc-500 focus:border-teal-300/60 focus:outline-none disabled:opacity-50"
        />
      </label>
      {!open && current && (
        <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-zinc-400">
          <TypeChip type={current.type.toLowerCase()} />
          <span>
            {current.category} · {current.basePower > 0 ? `${current.basePower} power` : "no damage"} · {current.accuracy === true ? "never misses" : `${current.accuracy}% accuracy`} · {current.pp} PP
          </span>
        </p>
      )}
      {open && (
        <ul id={listId} role="listbox" aria-label={`${label} suggestions`} className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-white/15 bg-zinc-900 shadow-2xl">
          {shown.length === 0 ? (
            <li className="px-3 py-2 text-sm text-zinc-400">No legal move matches.</li>
          ) : (
            shown.map((m) => (
              <li key={m.name} role="option" aria-selected={m.name === value}>
                <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => choose(m.name)} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-white/10 focus-visible:bg-white/10 focus-visible:outline-none">
                  <span className="min-w-0 flex-1 truncate font-semibold text-white">{m.name}</span>
                  <TypeChip type={m.type.toLowerCase()} />
                  <span className="w-20 shrink-0 text-right text-[11px] text-zinc-400">
                    {m.category.slice(0, 4)} {m.basePower > 0 ? m.basePower : "—"}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
