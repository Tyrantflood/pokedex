"use client";

import { GENERATIONS } from "@/lib/generations";
import type { PokemonType } from "@/lib/pokemon-types";
import { FILTER_TYPES, TYPE_COLORS } from "@/lib/type-colors";

interface Props {
  query: string;
  onQuery: (q: string) => void;
  types: PokemonType[];
  onToggleType: (t: PokemonType) => void;
  generation: number | null;
  onGeneration: (g: number | null) => void;
  shown: number;
  total: number;
  onClear: () => void;
}

const chipRow = "flex gap-1.5 overflow-x-auto pb-1 md:flex-wrap md:overflow-visible md:pb-0 [scrollbar-width:none]";

export function Controls({ query, onQuery, types, onToggleType, generation, onGeneration, shown, total, onClear }: Props) {
  const filtered = query !== "" || types.length > 0 || generation !== null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <input
          type="search"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Search by name or number…"
          aria-label="Search Pokémon by name or number"
          className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-teal-300/70 focus:ring-2 focus:ring-teal-300/30"
        />
        <p aria-live="polite" className="shrink-0 font-mono text-xs text-zinc-400">
          {shown.toLocaleString()} / {total.toLocaleString()}
        </p>
        {filtered && (
          <button
            type="button"
            onClick={onClear}
            className="shrink-0 rounded-lg border border-white/15 px-3 py-2 text-xs text-zinc-300 hover:bg-white/10"
          >
            Clear
          </button>
        )}
      </div>

      <div role="group" aria-label="Filter by type (must match all selected)" className={chipRow}>
        {FILTER_TYPES.map((t) => {
          const on = types.includes(t);
          const color = TYPE_COLORS[t];
          return (
            <button
              key={t}
              type="button"
              aria-pressed={on}
              onClick={() => onToggleType(t)}
              className="shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide transition-colors"
              style={
                on
                  ? { background: color, borderColor: color, color: "rgba(0,0,0,0.85)" }
                  : { borderColor: `${color}80`, color: "rgba(255,255,255,0.8)" }
              }
            >
              {t}
            </button>
          );
        })}
      </div>

      <div role="group" aria-label="Filter by generation" className={chipRow}>
        <GenButton active={generation === null} onClick={() => onGeneration(null)} label="All gens" />
        {GENERATIONS.map((g) => (
          <GenButton
            key={g.id}
            active={generation === g.id}
            onClick={() => onGeneration(generation === g.id ? null : g.id)}
            label={g.numeral}
            title={`Generation ${g.numeral} · ${g.region}`}
          />
        ))}
      </div>
    </div>
  );
}

function GenButton({ active, onClick, label, title }: { active: boolean; onClick: () => void; label: string; title?: string }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      title={title}
      onClick={onClick}
      className={`shrink-0 rounded-md border px-2.5 py-1 font-mono text-[11px] transition-colors ${
        active ? "border-teal-300 bg-teal-300 text-black" : "border-white/20 text-zinc-300 hover:bg-white/10"
      }`}
    >
      {label}
    </button>
  );
}
