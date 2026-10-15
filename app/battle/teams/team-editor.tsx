"use client";

import { useMemo, useState } from "react";
import type { PokemonSet } from "@pkmn/sets";
import { TEAM_FORMATS, formatByKey } from "@/lib/battle/formats";
import { MAX_TEAM_NAME, TEAM_SIZE, type SavedTeam } from "@/lib/battle/my-teams";
import { matchesQuery, parseQuery, searchKey } from "@/lib/pokedex-search";
import type { PokemonType } from "@/lib/pokemon-types";
import { FILTER_TYPES, TYPE_COLORS } from "@/lib/type-colors";
import { CoverageSections } from "../../pokedex/team-coverage";
import { dexTypeMath } from "@/lib/battle/dex-facts";
import type { TypeChart } from "@/lib/team";
import { useTeamTools } from "../use-team-tools";
import { MemberEditor } from "./member-editor";

const SHOWN = 48;

/**
 * The team builder: name and format, up to six Pokémon found with the same search the Pokédex uses, each with its moves, item, ability,
 * nature, EVs, IVs and Tera type, the stats those make, the type coverage panel from the Pokédex team bar, and the simulator's validator
 * telling you what is illegal. Nothing is saved until Save.
 */
export function TeamEditor({
  initial,
  onSave,
  onCancel,
  onDelete,
}: {
  initial: SavedTeam;
  onSave: (team: SavedTeam) => void;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const [draft, setDraft] = useState<SavedTeam>(initial);
  const format = formatByKey(draft.formatKey);
  const { check, tools, error } = useTeamTools(format.formatId);
  const [selected, setSelected] = useState(0);
  const [picking, setPicking] = useState(initial.sets.length === 0);
  /** Picking a Pokémon to replace the selected one, rather than to add. */
  const [replacing, setReplacing] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const sets = draft.sets;
  const safeSelected = Math.min(selected, Math.max(0, sets.length - 1));

  const verdict = useMemo(() => (check && tools ? check.validateSets(tools, sets) : null), [check, tools, sets]);
  const memberErrors = useMemo(() => (check && tools ? sets.map((set) => check.validateMember(tools, set)) : []), [check, tools, sets]);
  const facts = useMemo(() => (check && tools ? sets.map((set) => check.speciesFacts(tools, set.species)) : []), [check, tools, sets]);
  const coverage = useMemo(
    () => sets.flatMap((set, i) => (facts[i] ? [{ name: set.species, types: facts[i]!.types.map((t) => t.toLowerCase() as PokemonType) }] : [])),
    [sets, facts],
  );

  // The selected format's own type chart, from the simulator's data for its generation (Gen 1 has no Dark, Steel or Fairy; Gens 2-5 have Steel resist Ghost and Dark; Gen 1 Ghost can't hit Psychic).
  const chart = useMemo<TypeChart | undefined>(() => {
    if (!tools) return undefined;
    const math = dexTypeMath(tools.dex);
    return (attack, defenders) => math.multiplier(attack, defenders);
  }, [tools]);

  const update = (patch: Partial<SavedTeam>) => setDraft((d) => ({ ...d, ...patch }));
  const setSet = (index: number, next: PokemonSet) => update({ sets: sets.map((s, i) => (i === index ? next : s)) });

  const addSpecies = (name: string) => {
    if (!check || !tools) return;
    const fresh = check.blankSet(tools, name);
    if (picking && sets.length > 0 && safeSelected < sets.length && replacing) {
      // Replace the selected member's Pokémon; the item carries over, the moves can't.
      setSet(safeSelected, { ...fresh, item: sets[safeSelected].item });
    } else {
      update({ sets: [...sets, fresh] });
      setSelected(sets.length);
    }
    setPicking(false);
    setReplacing(false);
  };
  const removeAt = (index: number) => {
    update({ sets: sets.filter((_, i) => i !== index) });
    setSelected(Math.max(0, index - 1));
    if (sets.length <= 1) setPicking(true);
  };

  const save = () => {
    const ok = verdict?.ok ?? false;
    onSave({
      ...draft,
      name: draft.name.trim().slice(0, MAX_TEAM_NAME) || "Untitled team",
      updatedAt: Date.now(),
      check: verdict ? { ok, errors: verdict.errors.slice(0, 30), formatId: format.formatId } : null,
      icons: facts.flatMap((f) => (f ? [f.spriteId] : [])),
    });
  };

  const exportText = check && sets.length ? check.exportText(sets) : "";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <label className="block min-w-48 flex-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Team name</span>
          <input
            value={draft.name}
            onChange={(e) => update({ name: e.target.value })}
            maxLength={MAX_TEAM_NAME}
            placeholder="Untitled team"
            className="mt-1 block w-full rounded-xl border border-white/10 bg-zinc-900/70 px-3 py-2.5 text-base text-white placeholder:text-zinc-500 focus:border-teal-300/60 focus:outline-none"
          />
        </label>
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Format</span>
          <select
            value={draft.formatKey}
            onChange={(e) => update({ formatKey: e.target.value })}
            className="mt-1 block rounded-xl border border-white/10 bg-zinc-900/70 px-3 py-2.5 text-base text-white focus:border-teal-300/60 focus:outline-none"
          >
            {TEAM_FORMATS.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
        <div className="flex gap-2">
          <button type="button" onClick={save} className="rounded-xl bg-teal-300 px-5 py-2.5 text-sm font-bold text-slate-950 hover:bg-teal-200">
            Save team
          </button>
          <button type="button" onClick={onCancel} className="rounded-xl border border-white/15 px-4 py-2.5 text-sm font-semibold text-zinc-200 hover:bg-white/5">
            Close
          </button>
        </div>
      </div>
      <p className="-mt-2 text-xs text-zinc-500">{format.note} The first Pokémon leads (no team preview).</p>

      {error && (
        <p role="alert" className="rounded-xl border border-red-400/40 bg-red-950/30 p-3 text-sm text-red-100">
          The team tools failed to load: {error}. Reload the page to try again.
        </p>
      )}

      {/* the six slots */}
      <ol className="grid grid-cols-3 gap-2 sm:grid-cols-6" aria-label="Team">
        {Array.from({ length: TEAM_SIZE }, (_, i) => {
          const set = sets[i];
          const f = facts[i];
          const bad = (memberErrors[i]?.length ?? 0) > 0;
          const active = set ? i === safeSelected && !picking : picking && i === sets.length;
          return (
            <li key={i}>
              <button
                type="button"
                onClick={() => {
                  if (set) {
                    setSelected(i);
                    setPicking(false);
                    setReplacing(false);
                  } else {
                    setPicking(true);
                    setReplacing(false);
                  }
                }}
                aria-current={active}
                className={`flex h-24 w-full flex-col items-center justify-center rounded-xl border p-1.5 text-center transition-colors focus-visible:outline-2 focus-visible:outline-teal-300 ${
                  active ? "border-teal-300/70 bg-teal-300/10" : bad ? "border-red-400/50 bg-red-950/20" : "border-white/10 bg-zinc-900/60 hover:border-white/25"
                }`}
              >
                {set ? (
                  <>
                    {f && (
                      // eslint-disable-next-line @next/next/no-img-element -- third-party sprite
                      <img src={`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${f.spriteId}.png`} alt="" width={48} height={48} className="size-12 [image-rendering:pixelated]" draggable={false} />
                    )}
                    <span className="mt-0.5 w-full truncate text-[11px] font-semibold text-white">{set.species}</span>
                    {bad && <span className="sr-only">has problems</span>}
                  </>
                ) : (
                  <span className="text-xs text-zinc-500">+ Add {i + 1}</span>
                )}
              </button>
            </li>
          );
        })}
      </ol>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        <div className="min-w-0 space-y-4">
          {!check || !tools ? (
            <p className="rounded-xl border border-white/10 bg-zinc-900/40 p-4 text-sm text-zinc-300" role="status">
              Loading the rules for {format.label}…
            </p>
          ) : picking || sets.length === 0 ? (
            <SpeciesPicker
              choices={check.speciesChoices(tools)}
              taken={sets.map((s) => s.species)}
              full={sets.length >= TEAM_SIZE && !replacing}
              replacing={replacing}
              onPick={addSpecies}
              onClose={sets.length ? () => (setPicking(false), setReplacing(false)) : undefined}
            />
          ) : (
            <MemberEditor
              key={`${safeSelected}:${sets[safeSelected].species}`}
              set={sets[safeSelected]}
              tools={tools}
              check={check}
              onChange={(next) => setSet(safeSelected, next)}
              onChangeSpecies={() => {
                setReplacing(true);
                setPicking(true);
              }}
              onRemove={() => removeAt(safeSelected)}
              errors={memberErrors[safeSelected] ?? []}
            />
          )}
        </div>

        <aside className="space-y-4 rounded-2xl border border-white/10 bg-zinc-900/40 p-4" aria-label="Team check">
          <section aria-label="Legality">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-white/70">Is it legal in {format.label}?</h2>
            {!verdict ? (
              <p className="mt-1.5 text-sm text-zinc-400">Checking…</p>
            ) : verdict.ok ? (
              <p className="mt-1.5 text-sm font-semibold text-emerald-200" role="status">
                ✓ Legal. This team can be used in {format.label}.
              </p>
            ) : (
              <ul className="mt-1.5 space-y-1 text-sm text-red-100" role="alert">
                {verdict.errors.slice(0, 8).map((e, i) => (
                  <li key={i}>• {e}</li>
                ))}
                {verdict.errors.length > 8 && <li className="text-zinc-400">…and {verdict.errors.length - 8} more.</li>}
              </ul>
            )}
          </section>
          <div className="space-y-4 border-t border-white/10 pt-4">
            <p className="text-xs text-zinc-500">Type coverage uses the Generation {format.gen} type chart{format.gen <= 5 ? " (older generations differ from today's in a few matchups)" : ""}.</p>
            {coverage.length === 0 ? <p className="text-sm text-white/60">Add a Pokémon to see what the team is weak to and resists.</p> : <CoverageSections members={coverage} chart={chart} />}
          </div>
          <div className="space-y-2 border-t border-white/10 pt-4">
            <button type="button" disabled={!sets.length || !check} onClick={() => setExportOpen((o) => !o)} aria-expanded={exportOpen} className="text-sm font-semibold text-teal-200 underline-offset-4 hover:underline disabled:opacity-40">
              {exportOpen ? "Hide" : "Export"} as Showdown text
            </button>
            {exportOpen && exportText && (
              <div className="space-y-2">
                <textarea readOnly value={exportText} rows={10} aria-label="Team in Showdown text format" onFocus={(e) => e.currentTarget.select()} className="block w-full rounded-lg border border-white/10 bg-zinc-950/70 p-2 font-mono text-xs text-zinc-200" />
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard?.writeText(exportText).then(() => {
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    });
                  }}
                  className="rounded-lg bg-teal-300 px-3 py-1.5 text-xs font-bold text-slate-950 hover:bg-teal-200"
                >
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
            )}
          </div>
          {onDelete && (
            <button type="button" onClick={onDelete} className="block text-sm text-red-300 underline-offset-4 hover:underline">
              Delete this team
            </button>
          )}
        </aside>
      </div>
    </div>
  );
}

function SpeciesPicker({
  choices,
  taken,
  full,
  replacing,
  onPick,
  onClose,
}: {
  choices: { id: string; name: string; num: number; types: string[]; spriteId: number }[];
  taken: string[];
  full: boolean;
  replacing: boolean;
  onPick: (name: string) => void;
  onClose?: () => void;
}) {
  const [text, setText] = useState("");
  const [type, setType] = useState<PokemonType | null>(null);
  const [limit, setLimit] = useState(SHOWN);
  const query = useMemo(() => parseQuery(text), [text]);
  const keys = useMemo(() => choices.map((c) => searchKey(c.name)), [choices]);
  const results = useMemo(() => choices.filter((c, i) => (!type || c.types.some((t) => t.toLowerCase() === type)) && matchesQuery(query, keys[i], c.num)), [choices, keys, query, type]);

  return (
    <section aria-label="Find a Pokémon" className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-bold text-white">{replacing ? "Choose a different Pokémon" : "Add a Pokémon"}</h2>
        {onClose && (
          <button type="button" onClick={onClose} className="text-sm text-zinc-400 underline-offset-4 hover:text-white hover:underline">
            Cancel
          </button>
        )}
      </div>
      {full ? (
        <p className="rounded-xl border border-white/10 bg-zinc-900/40 p-3 text-sm text-zinc-300">The team has six Pokémon. Select one above and use &quot;Change Pokémon&quot; to swap it, or remove one first.</p>
      ) : (
        <>
          <input
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setLimit(SHOWN);
            }}
            autoFocus
            type="search"
            placeholder="Search by name or number"
            aria-label="Search Pokémon"
            className="block w-full rounded-xl border border-white/10 bg-zinc-900/70 px-3 py-2.5 text-base text-white placeholder:text-zinc-500 focus:border-teal-300/60 focus:outline-none"
          />
          <div className="flex flex-wrap gap-1" role="group" aria-label="Filter by type">
            {FILTER_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={type === t}
                onClick={() => {
                  setType(type === t ? null : t);
                  setLimit(SHOWN);
                }}
                className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-black/85 transition-opacity ${type === t ? "border-white" : "border-transparent opacity-60 hover:opacity-100"}`}
                style={{ backgroundColor: TYPE_COLORS[t] }}
              >
                {t}
              </button>
            ))}
          </div>
          <p className="text-xs text-zinc-500" aria-live="polite">
            {results.length} Pokémon {results.length === 1 ? "is" : "are"} allowed here{text || type ? " and match" : ""}.
          </p>
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6" aria-label="Results">
            {results.slice(0, limit).map((c) => {
              const used = taken.includes(c.name);
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    disabled={used}
                    onClick={() => onPick(c.name)}
                    title={used ? "Already on the team" : `${c.name} (${c.types.join(" / ")})`}
                    className="flex h-24 w-full flex-col items-center justify-center rounded-xl border border-white/10 bg-zinc-900/60 p-1 text-center hover:border-teal-300/50 hover:bg-teal-300/5 focus-visible:outline-2 focus-visible:outline-teal-300 disabled:cursor-not-allowed disabled:opacity-35"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- third-party sprite */}
                    <img src={`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${c.spriteId}.png`} alt="" width={48} height={48} loading="lazy" className="size-12 [image-rendering:pixelated]" draggable={false} />
                    <span className="w-full truncate text-[11px] font-semibold text-white">{c.name}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          {results.length > limit && (
            <button type="button" onClick={() => setLimit((l) => l + SHOWN * 2)} className="w-full rounded-xl border border-white/15 py-2 text-sm font-semibold text-zinc-200 hover:bg-white/5">
              Show more ({results.length - limit} left)
            </button>
          )}
        </>
      )}
    </section>
  );
}
