"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import type { PokemonType } from "@/lib/pokemon-types";
import type { PokemonSummary } from "@/lib/summary";
import { analyseTeam, memberCount, suggestCoverage, TEAM_SIZE, teamMembers, type Candidate, type Team, type TypeExposure } from "@/lib/team";
import { TYPE_COLORS } from "@/lib/type-colors";
import type { CardRects } from "./card-rects";

/** The sprite inside a slot is this many px; flights scale from the dragged sprite's size to it. */
export const SLOT_SPRITE_PX = 36;

/** How the newest member travels to its slot: from where it was let go (offsets in px from the slot's centre). */
export interface Flight {
  slot: number;
  /** Changes with every add, so the same Pokémon added twice in a row still animates. */
  token: number;
  x: number;
  y: number;
  scale: number;
}

const pretty = (name: string) => name.replace(/-/g, " ");
const capitalise = (text: string) => text[0].toUpperCase() + text.slice(1);

interface Props {
  team: Team;
  loaded: boolean;
  byId: Map<number, PokemonSummary>;
  candidates: Candidate[];
  flight: Flight | null;
  notice: string | null;
  onRemove: (slot: number) => void;
  onClear: () => void;
  /** Add a suggested Pokémon; `origin` is its sprite on screen, for the flight into the team. */
  onAdd: (pokemon: PokemonSummary, origin: DOMRect | null) => void;
  onOpen: (pokemon: PokemonSummary, rects: CardRects) => void;
}

/**
 * The six-slot team bar along the bottom of the screen, with a panel above it (opened from the bar) that combines the team's
 * weaknesses and resistances, flags what the whole team is weak to and suggests who would cover the gaps.
 * Cards are dragged into a slot (mouse/pen) or added with the card's own "Add to team" button (touch and keyboard).
 */
export function TeamDock({ team, loaded, byId, candidates, flight, notice, onRemove, onClear, onAdd, onOpen }: Props) {
  const [open, setOpen] = useState(false);
  const reduce = useReducedMotion() ?? false;
  const count = memberCount(team);

  // Escape closes the panel (but leaves it to a detail view or comparison when one is open on top).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector("[role=dialog]")) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[35] flex justify-center px-2 pb-2 sm:px-4 sm:pb-3">
      <div data-team-dock className="team-bar pointer-events-auto w-full max-w-3xl rounded-2xl border border-white/15 bg-[#0a0e13]/95 shadow-[0_10px_40px_rgba(0,0,0,0.55)] backdrop-blur">
        <AnimatePresence initial={false}>
          {open && (
            <motion.section
              key="panel"
              id="team-panel"
              aria-label="Team analysis"
              className="max-h-[58vh] overflow-y-auto overscroll-contain border-b border-white/10"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: reduce ? 0 : 0.22, ease: [0.22, 1, 0.36, 1] }}
            >
              <TeamPanel team={team} byId={byId} candidates={candidates} onAdd={onAdd} onClear={onClear} />
            </motion.section>
          )}
        </AnimatePresence>

        <div className="flex items-center gap-2 p-2 sm:gap-3 sm:p-2.5">
          <button
            type="button"
            aria-expanded={open}
            aria-controls="team-panel"
            onClick={() => setOpen((v) => !v)}
            className="flex shrink-0 flex-col items-start rounded-xl px-2 py-1 text-left hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300"
          >
            <span className="font-mono text-[10px] uppercase tracking-widest text-teal-300/80">Team {open ? "▾" : "▴"}</span>
            <span className="font-mono text-sm font-semibold text-white">
              {count}/{TEAM_SIZE}
            </span>
          </button>

          <ol aria-label="Team slots" className="flex min-w-0 flex-1 items-center gap-1 sm:gap-2.5">
            {team.slots.map((slot, index) => (
              <TeamSlot
                key={index}
                index={index}
                pokemon={slot ? byId.get(slot.pokemonId) : undefined}
                flight={flight && flight.slot === index ? flight : null}
                loaded={loaded}
                onRemove={onRemove}
                onOpen={onOpen}
              />
            ))}
          </ol>

          <div className="hidden shrink-0 flex-col items-end gap-1 sm:flex">
            {count > 0 && (
              <button
                type="button"
                onClick={onClear}
                className="rounded-lg px-2 py-0.5 text-xs text-white/65 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        <p role="status" aria-live="polite" className={`px-3 pb-2 text-xs ${notice ? "text-amber-200" : "sr-only"}`}>
          {notice ?? `${count} of ${TEAM_SIZE} team slots filled`}
        </p>
      </div>
    </div>
  );
}

function TeamSlot({
  index,
  pokemon,
  flight,
  loaded,
  onRemove,
  onOpen,
}: {
  index: number;
  pokemon: PokemonSummary | undefined;
  flight: Flight | null;
  loaded: boolean;
  onRemove: (slot: number) => void;
  onOpen: (pokemon: PokemonSummary, rects: CardRects) => void;
}) {
  const color = pokemon ? (TYPE_COLORS[pokemon.types[0]] ?? TYPE_COLORS.unknown) : undefined;
  const reduce = useReducedMotion() ?? false;
  return (
    <li
      data-team-slot={index}
      aria-label={pokemon ? `Slot ${index + 1}: ${pretty(pokemon.name)}` : `Slot ${index + 1}: empty`}
      className="team-slot group relative aspect-square min-w-0 max-w-12 flex-1 rounded-xl border"
      style={pokemon ? { borderColor: `color-mix(in srgb, ${color} 70%, transparent)`, background: `color-mix(in srgb, ${color} 18%, #0d1117)` } : undefined}
    >
      {pokemon ? (
        <>
          <button
            type="button"
            aria-label={`Open ${pretty(pokemon.name)}`}
            onClick={(e) => {
              const slot = e.currentTarget.closest("li")!.getBoundingClientRect();
              const sprite = e.currentTarget.querySelector("img")!.getBoundingClientRect();
              onOpen(pokemon, { card: slot, sprite });
            }}
            className="absolute inset-0 grid place-items-center rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300"
          >
            {/* The key restarts the flight for each add; a team loaded from storage has no flight and just appears. */}
            <motion.img
              key={`${pokemon.id}:${flight?.token ?? 0}`}
              data-team-sprite
              src={pokemon.sprite}
              alt=""
              draggable={false}
              className={`relative z-10 h-[88%] w-[88%] object-contain ${pokemon.pixel ? "[image-rendering:pixelated]" : ""}`}
              initial={flight && loaded && !reduce ? { x: flight.x, y: flight.y, scale: flight.scale, opacity: 0.85 } : false}
              animate={{ x: 0, y: 0, scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 230, damping: 21, mass: 0.9 }}
            />
          </button>
          <button
            type="button"
            aria-label={`Remove ${pretty(pokemon.name)} from the team`}
            onClick={() => onRemove(index)}
            className="team-remove"
          >
            ×
          </button>
          {flight && !reduce && (
            <motion.span
              key={flight.token}
              aria-hidden
              className="pointer-events-none absolute inset-0 rounded-xl"
              style={{ boxShadow: `0 0 0 2px ${color}, 0 0 18px ${color}` }}
              initial={{ opacity: 0.9, scale: 1.25 }}
              animate={{ opacity: 0, scale: 1 }}
              transition={{ duration: 0.7, delay: 0.15 }}
            />
          )}
        </>
      ) : (
        <span className="absolute inset-0 grid place-items-center font-mono text-xs text-white/35">{index + 1}</span>
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------------------------------------------------

function TypePill({ type, children }: { type: PokemonType; children?: React.ReactNode }) {
  return (
    <span className="inline-flex items-center overflow-hidden rounded-full text-[11px] font-semibold uppercase tracking-wide text-black/80" style={{ background: TYPE_COLORS[type] }}>
      <span className="px-2 py-0.5">{type}</span>
      {children}
    </span>
  );
}

function ExposureChip({ exposure, count, tone, members }: { exposure: TypeExposure; count: number; tone: "weak" | "resist"; members: string }) {
  return (
    <li title={members}>
      <TypePill type={exposure.type}>
        <span
          className="px-1.5 py-0.5 font-mono"
          style={{ background: tone === "weak" ? (exposure.worst >= 4 ? "#7f1d1d" : "#dc2626") : "#166534", color: "#fff" }}
          aria-label={`${count} ${count === 1 ? "member" : "members"}${tone === "weak" && exposure.worst >= 4 ? ", at least one takes four times damage" : ""}`}
        >
          {count}
          {tone === "weak" && exposure.worst >= 4 ? "·4×" : ""}
        </span>
      </TypePill>
    </li>
  );
}

function TeamPanel({
  team,
  byId,
  candidates,
  onAdd,
  onClear,
}: {
  team: Team;
  byId: Map<number, PokemonSummary>;
  candidates: Candidate[];
  onAdd: (pokemon: PokemonSummary, origin: DOMRect | null) => void;
  onClear: () => void;
}) {
  const members = useMemo(() => teamMembers(team).flatMap((m) => (byId.get(m.pokemonId) ? [byId.get(m.pokemonId)!] : [])), [team, byId]);
  const analysis = useMemo(() => analyseTeam(members.map((p) => p.types)), [members]);
  const full = memberCount(team) >= TEAM_SIZE;
  const suggestions = useMemo(
    () => (full ? [] : suggestCoverage(analysis, candidates, { ids: new Set(members.map((p) => p.id)), species: new Set(members.map((p) => p.species)) })),
    [analysis, candidates, members, full],
  );

  /** "Charizard ×4, Blastoise ×2": who is behind a chip's number. */
  const who = (e: TypeExposure) =>
    members
      .map((p, i) => ({ name: capitalise(pretty(p.name)), m: e.perMember[i] }))
      .filter(({ m }) => m !== 1)
      .map(({ name, m }) => `${name} ${m === 0 ? "immune" : m === 0.25 ? "×¼" : m === 0.5 ? "×½" : `×${m}`}`)
      .join(", ");

  if (members.length === 0) {
    return <p className="p-4 text-sm text-white/70">Drag a card into a slot, or press the + on a card, to start building a team. Its weaknesses and resistances will show up here.</p>;
  }

  return (
    <div className="space-y-4 p-4">
      {analysis.flagged.length > 0 && (
        <div role="alert" className="rounded-xl border border-red-400/60 bg-red-500/15 p-3">
          <p className="text-sm font-semibold text-red-100">⚠ The whole team is weak to {analysis.flagged.length === 1 ? "this type" : "these types"}</p>
          <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Types the whole team is weak to">
            {analysis.flagged.map((type) => (
              <li key={type}>
                <TypePill type={type} />
              </li>
            ))}
          </ul>
        </div>
      )}

      <section aria-label="Team weaknesses">
        <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-widest text-white/70">Weak to <span className="normal-case tracking-normal text-white/50">· how many members</span></h3>
        {analysis.weaknesses.length === 0 ? (
          <p className="text-sm text-white/60">Nothing yet.</p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {analysis.weaknesses.map((e) => (
              <ExposureChip key={e.type} exposure={e} count={e.weak} tone="weak" members={who(e)} />
            ))}
          </ul>
        )}
        {analysis.weaknesses.some((e) => e.worst >= 4) && <p className="mt-1.5 text-xs text-white/50">·4× means at least one of them takes four times the damage.</p>}
      </section>

      <section aria-label="Team resistances">
        <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-widest text-white/70">Resists or immune <span className="normal-case tracking-normal text-white/50">· how many members</span></h3>
        {analysis.resistances.length === 0 ? (
          <p className="text-sm text-white/60">Nothing yet.</p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {analysis.resistances.map((e) => (
              <ExposureChip key={e.type} exposure={e} count={e.resist + e.immune} tone="resist" members={who(e)} />
            ))}
          </ul>
        )}
      </section>

      {analysis.gaps.length > 0 && (
        <section aria-label="Gaps">
          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-widest text-white/70">No answer on the team</h3>
          <p className="mb-1.5 text-xs text-white/60">Somebody is weak to these and nobody resists them.</p>
          <ul className="flex flex-wrap gap-1.5">
            {analysis.gaps.map((type) => (
              <li key={type}>
                <TypePill type={type} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex justify-end sm:hidden">
        <button
          type="button"
          onClick={onClear}
          className="rounded-lg border border-white/25 px-3 py-1 text-xs text-white/80 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300"
        >
          Clear team
        </button>
      </div>

      <section aria-label="Suggestions">
        <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-widest text-white/70">Cover the gaps</h3>
        {analysis.gaps.length === 0 ? (
          <p className="text-sm text-white/60">{members.length < 2 ? "Add a second Pokémon to see where the team has gaps." : "No gaps: every type the team is weak to has an answer."}</p>
        ) : full ? (
          <p className="text-sm text-white/60">Your team is full. Remove a member to see who could cover the gaps.</p>
        ) : suggestions.length === 0 ? (
          <p className="text-sm text-white/60">Nobody in the Pokédex covers these without piling on other weaknesses.</p>
        ) : (
          <ul className="space-y-1.5">
            {suggestions.map(({ candidate, covers, piles }) => {
              const pokemon = byId.get(candidate.id);
              if (!pokemon) return null;
              return (
                <li key={candidate.id} className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-black/25 p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img data-suggest-sprite src={pokemon.sprite} alt="" draggable={false} className={`h-10 w-10 shrink-0 object-contain ${pokemon.pixel ? "[image-rendering:pixelated]" : ""}`} />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
                      <span className="font-semibold capitalize text-white">{pretty(pokemon.name)}</span>
                      <span className="flex gap-1">
                        {pokemon.types.map((type) => (
                          <TypePill key={type} type={type} />
                        ))}
                      </span>
                    </p>
                    <p className="mt-0.5 text-xs text-white/70">
                      Resists <span className="text-emerald-200">{covers.join(", ")}</span>
                      {piles.length > 0 && <span className="text-white/50"> · also weak to {piles.join(", ")}</span>}
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label={`Add ${pretty(pokemon.name)} to the team`}
                    onClick={(e) => onAdd(pokemon, e.currentTarget.closest("li")!.querySelector("[data-suggest-sprite]")!.getBoundingClientRect())}
                    className="shrink-0 rounded-lg border border-teal-300/50 px-3 py-1 text-xs font-semibold text-teal-100 hover:bg-teal-300/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300"
                  >
                    Add
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
