"use client";

import { useEffect, useMemo, useState } from "react";
import { loadEncounters, type EncountersResult } from "@/app/actions";
import type { EncounterEntry, EncounterLocation } from "@/lib/encounter-data";
import { planRows } from "@/lib/encounter-data";
import { conditionLabel, formatChance, levelRange, methodName } from "@/lib/encounter-format";
import { gameName } from "@/lib/games";
import type { PokemonSummary } from "@/lib/summary";

/** Games shown before "Show more games"; locations shown per game before "Show more locations"; methods shown per location. */
const GAMES_SHOWN = 4;
const LOCATIONS_SHOWN = 3;
const METHODS_SHOWN = 3;

// One request per Pokémon per page load; failures aren't kept, so Retry really retries.
const requests = new Map<number, Promise<EncountersResult>>();
function fetchEncounters(id: number): Promise<EncountersResult> {
  let request = requests.get(id);
  if (!request) {
    request = loadEncounters(id)
      .catch((): EncountersResult => ({ ok: false, error: "Couldn't reach the server." }))
      .then((result) => {
        if (!result.ok) requests.delete(id);
        return result;
      });
    requests.set(id, request);
  }
  return request;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Where this Pokémon can be found in the wild, by game, from PokéAPI's encounter data. The data has real gaps
 * (starters, gifts, trades and the newest games), so "no data" is worded as exactly that and never as "not found".
 * Remount (key) per Pokémon.
 */
export function WhereToFind({ pokemon }: { pokemon: PokemonSummary }) {
  const [state, setState] = useState<EncountersResult | "loading">("loading");
  const [attempt, setAttempt] = useState(0);
  const [showAllGames, setShowAllGames] = useState(false);

  useEffect(() => {
    let live = true;
    fetchEncounters(pokemon.id).then((result) => {
      if (live) setState(result);
    });
    return () => {
      live = false;
    };
  }, [pokemon.id, attempt]);

  const rows = useMemo(() => (state !== "loading" && state.ok ? planRows(state.games, pokemon.generation) : []), [state, pokemon.generation]);
  const hasAnyData = state !== "loading" && state.ok && state.games.length > 0;
  const visibleRows = showAllGames ? rows : rows.slice(0, GAMES_SHOWN);

  return (
    <section aria-label="Where to find" aria-busy={state === "loading"}>
      <h3 className="fx-flick mb-2 text-xs font-semibold uppercase tracking-widest text-white/70">Where to find</h3>

      {state === "loading" && (
        <div role="status" aria-label="Loading encounter data" className="animate-pulse space-y-2">
          <div className="h-4 w-24 rounded bg-white/10" />
          <div className="h-10 w-full rounded-lg bg-black/25" />
          <div className="h-10 w-full rounded-lg bg-black/25" />
        </div>
      )}

      {state !== "loading" && !state.ok && (
        <div role="alert" className="flex items-center gap-3 text-sm text-white/80">
          <span>{state.error}</span>
          <button
            type="button"
            onClick={() => {
              setState("loading");
              setAttempt((n) => n + 1);
            }}
            className="rounded-lg border border-white/30 px-3 py-1 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300"
          >
            Retry
          </button>
        </div>
      )}

      {state !== "loading" && state.ok && !hasAnyData && (
        <p className="text-sm text-white/80">No wild encounter data for this Pokémon in any game.</p>
      )}

      {hasAnyData && (
        <div className="space-y-4">
          {visibleRows.map((row) =>
            row.kind === "game" ? (
              <GameBlock key={row.game.version} version={row.game.version} locations={row.game.locations} />
            ) : (
              <p key={row.games[0].slug} className="text-sm text-white/65">
                <span className="font-semibold text-white/80">{row.games.map((g) => g.name).join(" · ")}</span>
                {" "}
                <span className="ml-2">No wild encounter data</span>
              </p>
            ),
          )}
          {rows.length > GAMES_SHOWN && (
            <button
              type="button"
              aria-expanded={showAllGames}
              onClick={() => setShowAllGames((v) => !v)}
              className="text-sm font-semibold text-teal-200 hover:text-teal-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300"
            >
              {showAllGames ? "Show fewer games" : `Show ${plural(rows.length - GAMES_SHOWN, "more game entry", "more game entries")}`}
            </button>
          )}
        </div>
      )}

      <p className="mt-4 text-xs leading-relaxed text-white/60">
        Data from PokéAPI, which has gaps: starters, gifts, trades, special encounters and the newest games are often missing. “No wild encounter data”
        means the data has none, not that the Pokémon can’t be found there.
      </p>
    </section>
  );
}

function GameBlock({ version, locations }: { version: string; locations: EncounterLocation[] }) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? locations : locations.slice(0, LOCATIONS_SHOWN);
  const hidden = locations.length - LOCATIONS_SHOWN;
  return (
    <div>
      <h4 className="mb-1.5 text-sm font-semibold text-white">{gameName(version)}</h4>
      <ul className="space-y-1.5">
        {shown.map((loc) => (
          <li key={loc.name} className="rounded-lg border border-white/15 bg-black/25 px-3 py-1.5 text-sm">
            <span className="font-medium text-white">{loc.name}</span>
            <ul className="mt-0.5 space-y-0.5 text-xs text-white/75">
              {loc.entries.slice(0, METHODS_SHOWN).map((e) => (
                <li key={`${e.method}|${e.conditions.join(",")}`}>
                  <EntryLine entry={e} />
                </li>
              ))}
              {loc.entries.length > METHODS_SHOWN && <li className="text-white/55">+{plural(loc.entries.length - METHODS_SHOWN, "more method", "more methods")}</li>}
            </ul>
          </li>
        ))}
      </ul>
      {hidden > 0 && (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
          className="mt-1.5 text-xs font-semibold text-teal-200 hover:text-teal-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300"
        >
          {expanded ? "Show fewer locations" : `Show ${plural(hidden, "more location", "more locations")}`}
        </button>
      )}
    </div>
  );
}

function EntryLine({ entry }: { entry: EncounterEntry }) {
  const conditions = entry.conditions.map(conditionLabel).filter(Boolean);
  return (
    <>
      <span className="text-white/90">{methodName(entry.method)}</span>
      {conditions.length > 0 && <span className="text-white/60"> ({conditions.slice(0, 2).join(", ")}{conditions.length > 2 ? ", …" : ""})</span>}
      <span aria-hidden> · </span>
      <span className="font-mono">{levelRange(entry.minLevel, entry.maxLevel)}</span>
      <span aria-hidden> · </span>
      <span className="font-mono">{formatChance(entry.chance)}</span>
    </>
  );
}
