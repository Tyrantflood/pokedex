"use client";

import { useMemo } from "react";
import type { PokemonSet } from "@pkmn/sets";
import type { FormatTools } from "@/lib/battle/team-check";
import {
  applyPreset,
  calcStats,
  EV_PRESETS,
  EV_STAT_CAP,
  EV_TOTAL_CAP,
  evTotal,
  fullTable,
  hasAbilities,
  hasEvBudget,
  hasNatures,
  hasTera,
  natureEffect,
  NATURES,
  natureLabel,
  setEv,
  setIv,
  STAT_LABEL,
  STATS,
  type StatId,
} from "@/lib/battle/team-edit";
import { TypeChip } from "../ui";
import { MovePicker } from "./move-picker";

type CheckModule = typeof import("@/lib/battle/team-check");

const field = "block w-full rounded-lg border border-white/10 bg-zinc-950/70 px-2.5 py-2 text-sm text-white focus:border-teal-300/60 focus:outline-none";
const label = "text-xs font-semibold uppercase tracking-wider text-zinc-400";

/** Everything about one team member: ability, item, moves, nature, EVs, IVs, Tera type, and the stats those add up to. */
export function MemberEditor({
  set,
  tools,
  check,
  onChange,
  onChangeSpecies,
  onRemove,
  errors,
}: {
  set: PokemonSet;
  tools: FormatTools;
  check: CheckModule;
  onChange: (next: PokemonSet) => void;
  onChangeSpecies: () => void;
  onRemove: () => void;
  errors: string[];
}) {
  const gen = tools.gen;
  const facts = useMemo(() => check.speciesFacts(tools, set.species), [check, tools, set.species]);
  const moves = useMemo(() => check.legalMoves(tools, set.species), [check, tools, set.species]);
  const items = useMemo(() => check.itemChoices(tools), [check, tools]);
  const teraTypes = useMemo(() => check.teraTypes(tools), [check, tools]);
  const stats = useMemo(() => (facts ? calcStats(facts.baseStats, set, gen) : null), [facts, set, gen]);
  if (!facts) return <p className="text-sm text-red-200">{set.species} isn&apos;t in this format&apos;s Pokédex.</p>;

  const total = evTotal(set.evs);
  const itemKnown = set.item === "" || items.some((i) => i.name === set.item);
  const itemInfo = items.find((i) => i.name === set.item);
  const statRows = STATS.filter((s) => !(gen === 1 && s === "spd"));

  const pickMove = (slot: number, name: string) => {
    const next = [...set.moves];
    next[slot] = name;
    let updated: PokemonSet = { ...set, moves: next.filter(Boolean) };
    // Hidden Power's type comes from the IVs (Gens 2-7): choosing "Hidden Power Fire" sets the IVs that make it Fire.
    const hp = /^Hidden Power (\w+)$/.exec(name);
    if (hp && gen <= 7) updated = { ...updated, ivs: check.hiddenPowerIvs(tools, hp[1]), hpType: hp[1] };
    onChange(updated);
  };
  const clearMove = (slot: number) => onChange({ ...set, moves: set.moves.filter((_, i) => i !== slot) });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- third-party sprite */}
        <img src={`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${facts.spriteId}.png`} alt="" width={64} height={64} className="size-16 [image-rendering:pixelated]" draggable={false} />
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-bold text-white">{set.species}</h2>
          <p className="mt-0.5 flex flex-wrap gap-1.5">
            {facts.types.map((t) => (
              <TypeChip key={t} type={t.toLowerCase()} />
            ))}
          </p>
        </div>
        <button type="button" onClick={onChangeSpecies} className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-semibold text-zinc-200 hover:bg-white/5">
          Change Pokémon
        </button>
        <button type="button" onClick={onRemove} className="rounded-lg border border-red-400/40 px-3 py-1.5 text-xs font-semibold text-red-200 hover:bg-red-400/10">
          Remove
        </button>
      </div>

      {errors.length > 0 && (
        <ul role="alert" className="space-y-1 rounded-xl border border-red-400/40 bg-red-950/30 p-3 text-sm text-red-100">
          {errors.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {hasAbilities(gen) && (
          <label className="block">
            <span className={label}>Ability</span>
            <select value={set.ability} onChange={(e) => onChange({ ...set, ability: e.target.value })} className={`${field} mt-1`}>
              {!facts.abilities.includes(set.ability) && <option value={set.ability}>{set.ability || "Choose an ability"}</option>}
              {facts.abilities.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-[11px] text-zinc-500">{check.abilityText(tools, set.ability)}</span>
          </label>
        )}
        {gen >= 2 && (
          <label className="block">
            <span className={label}>Item</span>
            <input
              list="battle-items"
              value={set.item}
              onChange={(e) => {
                const hit = items.find((i) => i.name.toLowerCase() === e.target.value.trim().toLowerCase());
                onChange({ ...set, item: hit ? hit.name : e.target.value });
              }}
              placeholder="No item"
              aria-invalid={!itemKnown}
              className={`${field} mt-1 ${itemKnown ? "" : "border-red-400/60"}`}
            />
            <datalist id="battle-items">
              {items.map((i) => (
                <option key={i.name} value={i.name} />
              ))}
            </datalist>
            <span className="mt-1 block text-[11px] text-zinc-500">{itemInfo ? itemInfo.description : itemKnown ? "" : "Not an item this format allows."}</span>
          </label>
        )}
        {hasNatures(gen) && (
          <label className="block">
            <span className={label}>Nature</span>
            <select value={set.nature} onChange={(e) => onChange({ ...set, nature: e.target.value })} className={`${field} mt-1`}>
              {NATURES.map((n) => (
                <option key={n} value={n}>
                  {natureLabel(n)}
                </option>
              ))}
            </select>
          </label>
        )}
        {hasTera(gen) && (
          <label className="block">
            <span className={label}>Tera type</span>
            <select value={set.teraType ?? ""} onChange={(e) => onChange({ ...set, teraType: e.target.value as PokemonSet["teraType"] })} className={`${field} mt-1`}>
              {teraTypes.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <fieldset>
        <legend className={label}>Moves</legend>
        <div className="mt-1 grid gap-2 sm:grid-cols-2">
          {[0, 1, 2, 3].map((slot) => (
            <div key={slot} className="flex items-start gap-1.5">
              <div className="min-w-0 flex-1">
                <MovePicker label={`Move ${slot + 1}`} value={set.moves[slot] ?? ""} moves={moves} taken={set.moves} onPick={(name) => pickMove(slot, name)} />
              </div>
              {set.moves[slot] && (
                <button type="button" aria-label={`Clear move ${slot + 1}`} onClick={() => clearMove(slot)} className="mt-1.5 rounded-md px-2 py-1 text-zinc-400 hover:bg-white/10 hover:text-white">
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
        <p className="mt-1.5 text-[11px] text-zinc-500">Only moves this Pokémon can legally have in {tools.formatId.split("@@@")[0]} are listed ({moves.length}).</p>
      </fieldset>

      {hasEvBudget(gen) ? (
        <fieldset>
          <legend className={label}>EVs</legend>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {EV_PRESETS.map((preset) => (
              <button
                key={preset.key}
                type="button"
                title={preset.hint}
                onClick={() => onChange(applyPreset(set, preset, gen))}
                className="rounded-full border border-white/15 px-3 py-1 text-xs font-semibold text-zinc-200 hover:border-teal-300/50 hover:bg-teal-300/10"
              >
                {preset.label}
              </button>
            ))}
            <button type="button" onClick={() => onChange({ ...set, evs: fullTable(0) })} className="rounded-full border border-white/10 px-3 py-1 text-xs text-zinc-400 hover:bg-white/5">
              Clear
            </button>
            <span className={`ml-auto text-xs font-semibold ${total === EV_TOTAL_CAP ? "text-teal-200" : "text-zinc-300"}`} aria-live="polite">
              {total} / {EV_TOTAL_CAP} used · {EV_TOTAL_CAP - total} left
            </span>
          </div>
          <div className="mt-2 space-y-1.5">
            {statRows.map((stat) => (
              <EvRow key={stat} stat={stat} value={set.evs[stat]} nature={set.nature} onChange={(v) => onChange({ ...set, evs: setEv(set.evs, stat, v, gen) })} />
            ))}
          </div>
          <p className="mt-1.5 text-[11px] text-zinc-500">At most {EV_STAT_CAP} in one stat and {EV_TOTAL_CAP} in all; the sliders stop when the total is used up.</p>
        </fieldset>
      ) : (
        <p className="rounded-xl border border-white/10 bg-zinc-900/40 p-3 text-xs text-zinc-400">
          Generation {gen} has no EVs to spend or natures to choose: every Pokémon has maximum stat experience, so there is nothing to set here.
        </p>
      )}

      {hasEvBudget(gen) && (
        <fieldset>
          <legend className={label}>IVs</legend>
          <div className="mt-1 grid grid-cols-3 gap-2 sm:grid-cols-6">
            {statRows.map((stat) => (
              <label key={stat} className="block text-center">
                <span className="text-[11px] text-zinc-400">{STAT_LABEL[stat]}</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={31}
                  value={set.ivs[stat]}
                  onChange={(e) => onChange({ ...set, ivs: setIv(set.ivs, stat, Number(e.target.value)) })}
                  className={`${field} text-center`}
                />
              </label>
            ))}
          </div>
          <button type="button" onClick={() => onChange({ ...set, ivs: fullTable(31) })} className="mt-1.5 text-xs text-teal-200 underline-offset-4 hover:underline">
            Reset all IVs to 31
          </button>
        </fieldset>
      )}

      {stats && (
        <fieldset>
          <legend className={label}>Stats at level {set.level}</legend>
          <table className="mt-1 w-full text-sm" aria-label="Calculated stats">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-zinc-500">
                <th className="py-1 font-semibold">Stat</th>
                <th className="py-1 font-semibold">Base</th>
                <th className="hidden py-1 font-semibold sm:table-cell" />
                <th className="py-1 text-right font-semibold">Final</th>
              </tr>
            </thead>
            <tbody>
              {statRows.map((stat) => {
                const effect = hasNatures(gen) ? natureEffect(set.nature) : null;
                const tone = effect?.[0] === stat ? "text-emerald-300" : effect?.[1] === stat ? "text-rose-300" : "text-white";
                return (
                  <tr key={stat} className="border-t border-white/5">
                    <td className="py-1 text-zinc-300">{gen === 1 && stat === "spa" ? "Special" : STAT_LABEL[stat]}</td>
                    <td className="py-1 text-zinc-400">{facts.baseStats[stat]}</td>
                    <td className="hidden w-1/2 py-1 sm:table-cell">
                      <div className="h-1.5 rounded-full bg-white/10" role="presentation">
                        <div className="h-full rounded-full bg-teal-300/70" style={{ width: `${Math.min(100, (stats[stat] / (stat === "hp" ? 500 : 400)) * 100)}%` }} />
                      </div>
                    </td>
                    <td className={`py-1 text-right font-mono font-bold ${tone}`}>{stats[stat]}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {hasNatures(gen) && natureEffect(set.nature) && <p className="mt-1 text-[11px] text-zinc-500">Green is raised by the nature, red lowered.</p>}
        </fieldset>
      )}
    </div>
  );
}

function EvRow({ stat, value, nature, onChange }: { stat: StatId; value: number; nature: string; onChange: (value: number) => void }) {
  const effect = natureEffect(nature);
  const mark = effect?.[0] === stat ? "+" : effect?.[1] === stat ? "−" : "";
  return (
    <div className="flex items-center gap-2">
      <span className="w-12 text-xs font-semibold text-zinc-300">
        {STAT_LABEL[stat]}
        {mark && <span className={mark === "+" ? "text-emerald-300" : "text-rose-300"}> {mark}</span>}
      </span>
      <input
        type="range"
        min={0}
        max={EV_STAT_CAP}
        step={4}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={`${STAT_LABEL[stat]} EVs`}
        className="h-1 min-w-0 flex-1 cursor-pointer accent-teal-300"
      />
      <input
        type="number"
        inputMode="numeric"
        min={0}
        max={EV_STAT_CAP}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={`${STAT_LABEL[stat]} EV value`}
        className="w-16 rounded-lg border border-white/10 bg-zinc-950/70 px-2 py-1 text-center text-sm text-white focus:border-teal-300/60 focus:outline-none"
      />
    </div>
  );
}
