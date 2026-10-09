"use client";

import { AnimatePresence, MotionConfig } from "framer-motion";
import type { CardRects } from "./card-rects";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { PokemonType } from "@/lib/pokemon-types";
import type { PokemonSummary } from "@/lib/summary";
import { CompareTray } from "./compare-tray";
import { CompareView } from "./compare-view";
import { Controls } from "./controls";
import { DetailView } from "./detail-view";
import { PokemonCard } from "./pokemon-card";
import { useCardDrag } from "./use-card-drag";

const GAP = 16;
const MIN_CARD_WIDTH = 172;
const CARD_HEIGHT = 248;
const ROW_HEIGHT = CARD_HEIGHT + GAP;
/** Extra rows rendered above and below the viewport. */
const OVERSCAN_ROWS = 2;
/** How long after a filter change removed cards animate out (vs. vanishing on scroll). */
const FILTER_ANIM_MS = 600;
const STAGGER_STEP_S = 0.03;
const STAGGER_MAX_CARDS = 30;

// The boot intro (boot-intro.tsx) sets <html data-boot> while it plays. Wait for it to
// clear so the staggered entrance happens in view rather than behind the overlay.
function subscribeBoot(notify: () => void) {
  const observer = new MutationObserver(notify);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-boot"] });
  return () => observer.disconnect();
}
const bootFinished = () => !document.documentElement.dataset.boot;
const bootFinishedOnServer = () => false;

export function PokedexBrowser({ pokemon }: { pokemon: PokemonSummary[] }) {
  const [query, setQuery] = useState("");
  const [types, setTypes] = useState<PokemonType[]>([]);
  const [generation, setGeneration] = useState<number | null>(null);
  const [animateExit, setAnimateExit] = useState(false);
  const [introDone, setIntroDone] = useState(false);
  const [layout, setLayout] = useState({ width: 0, margin: 0 });
  const [selected, setSelected] = useState<{ pokemon: PokemonSummary; origin: CardRects } | null>(null);
  const [rowRange, setRowRange] = useState({ first: 0, last: 6 });
  // Comparison: `pending` is the first Pokémon picked, waiting for a second; `comparison` is the open view.
  const [pending, setPending] = useState<PokemonSummary | null>(null);
  const [comparison, setComparison] = useState<{ a: PokemonSummary; b: PokemonSummary } | null>(null);

  const listRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<HTMLDivElement>(null);
  const exitTimer = useRef(0);

  const ready = useSyncExternalStore(subscribeBoot, bootFinished, bootFinishedOnServer);
  const deferredQuery = useDeferredValue(query);

  // Measure the list's width and its document offset (the virtualizer's scroll margin).
  useEffect(() => {
    const list = listRef.current;
    const controls = controlsRef.current;
    if (!list) return;
    const measure = () => {
      const width = list.clientWidth;
      const margin = list.getBoundingClientRect().top + window.scrollY;
      setLayout((prev) => (prev.width === width && Math.abs(prev.margin - margin) < 1 ? prev : { width, margin }));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    if (controls) observer.observe(controls);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => setIntroDone(true), 2200);
    return () => clearTimeout(t);
  }, [ready]);

  useEffect(() => () => clearTimeout(exitTimer.current), []);

  const searchKeys = useMemo(() => pokemon.map((p) => p.name.replace(/-/g, " ")), [pokemon]);

  const filtered = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase().replace(/^#/, "");
    const nameQuery = q.replace(/-/g, " ");
    const numberQuery = /^\d+$/.test(q) ? q.replace(/^0+/, "") : "";
    return pokemon.filter((p, i) => {
      if (generation !== null && p.generation !== generation) return false;
      if (types.length > 0 && !types.every((t) => p.types.includes(t))) return false;
      if (!q) return true;
      if (numberQuery && String(p.number).startsWith(numberQuery)) return true;
      return searchKeys[i].includes(nameQuery);
    });
  }, [pokemon, searchKeys, deferredQuery, types, generation]);

  // Called by every filter handler: lets removed cards animate out for a moment and
  // brings the top of the results back into view if the user had scrolled down.
  const onFiltersChange = useCallback(() => {
    setAnimateExit(true);
    clearTimeout(exitTimer.current);
    exitTimer.current = window.setTimeout(() => setAnimateExit(false), FILTER_ANIM_MS);
    const list = listRef.current;
    if (list) {
      const listTop = list.getBoundingClientRect().top + window.scrollY;
      const target = Math.max(0, listTop - (controlsRef.current?.offsetHeight ?? 0) - 16);
      if (window.scrollY > target) window.scrollTo({ top: target });
    }
  }, []);

  const openComparison = useCallback((a: PokemonSummary, b: PokemonSummary) => {
    setPending(null);
    setComparison({ a, b });
  }, []);
  // Pressing Compare picks the first Pokémon, then the second opens the comparison.
  const startCompare = useCallback(
    (p: PokemonSummary) => {
      if (!pending) setPending(p);
      else if (pending.id === p.id) setPending(null);
      else openComparison(pending, p);
    },
    [pending, openComparison],
  );
  // While a first Pokémon is waiting, choosing any other card (not just its Compare button) completes the pair.
  const openDetail = useCallback(
    (pokemon: PokemonSummary, origin: CardRects) => {
      if (pending && pending.id !== pokemon.id) openComparison(pending, pokemon);
      else {
        setPending(null);
        setSelected({ pokemon, origin });
      }
    },
    [pending, openComparison],
  );
  // Evolution stages are species; resolve each to its default form for the detail view.
  const defaultForms = useMemo(() => new Map(pokemon.filter((p) => p.base).map((p) => [p.species, p])), [pokemon]);
  const resolveSpecies = useCallback((species: string) => defaultForms.get(species), [defaultForms]);
  const closeDetail = useCallback(() => setSelected(null), []);
  const closeComparison = useCallback(() => setComparison(null), []);

  const byId = useMemo(() => new Map(pokemon.map((p) => [p.id, p])), [pokemon]);
  const lookup = useCallback((id: number) => byId.get(id), [byId]);
  useCardDrag({ listRef, lookup, onDrop: openComparison, topInset: () => controlsRef.current?.offsetHeight ?? 0 });

  useEffect(() => {
    if (!pending) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setPending(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pending]);

  const changeQuery = (q: string) => {
    setQuery(q);
    onFiltersChange();
  };
  const toggleType = (t: PokemonType) => {
    setTypes((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
    onFiltersChange();
  };
  const changeGeneration = (g: number | null) => {
    setGeneration(g);
    onFiltersChange();
  };
  const clearAll = () => {
    setQuery("");
    setTypes([]);
    setGeneration(null);
    onFiltersChange();
  };

  const { width } = layout;
  const columns = Math.max(1, Math.floor((width + GAP) / (MIN_CARD_WIDTH + GAP)));
  const cardWidth = width > 0 ? (width - (columns - 1) * GAP) / columns : MIN_CARD_WIDTH;
  const rowCount = Math.ceil(filtered.length / columns);

  // Windowing: rows are a fixed height, so the visible range comes straight from scrollY.
  // State only changes when the range itself changes (about once per row of scrolling),
  // so ordinary scroll events never re-render the grid.
  const margin = layout.margin;
  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const top = window.scrollY - margin;
      const first = Math.max(0, Math.floor(top / ROW_HEIGHT) - OVERSCAN_ROWS);
      const last = Math.min(rowCount - 1, Math.floor((top + window.innerHeight) / ROW_HEIGHT) + OVERSCAN_ROWS);
      setRowRange((prev) => (prev.first === first && prev.last === last ? prev : { first, last }));
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [margin, rowCount]);

  const firstIndex = rowRange.first * columns;
  const lastIndex = Math.min(filtered.length, (rowRange.last + 1) * columns);
  const visible = ready && width > 0 ? filtered.slice(firstIndex, lastIndex) : [];

  return (
    <MotionConfig reducedMotion="user">
      <div ref={controlsRef} className="sticky top-0 z-30 -mx-4 mb-4 bg-[#0a0e13]/95 px-4 pb-3 pt-4">
        <div className="mb-3 flex items-baseline gap-3">
          <h1 className="text-3xl font-bold tracking-tight">Pokédex</h1>
          <span className="font-mono text-xs uppercase tracking-widest text-teal-300/70">Dex-Link</span>
        </div>
        <Controls
          query={query}
          onQuery={changeQuery}
          types={types}
          onToggleType={toggleType}
          generation={generation}
          onGeneration={changeGeneration}
          shown={filtered.length}
          total={pokemon.length}
          onClear={clearAll}
        />
      </div>

      <div
        ref={listRef}
        role="list"
        aria-label="Pokémon"
        data-comparing={pending ? "true" : undefined}
        className="relative"
        style={{ height: rowCount > 0 ? rowCount * ROW_HEIGHT - GAP : 0 }}
      >
        <AnimatePresence custom={animateExit}>
          {visible.map((p, i) => {
            const index = firstIndex + i;
            return (
              <PokemonCard
                key={p.id}
                pokemon={p}
                x={(index % columns) * (cardWidth + GAP)}
                y={Math.floor(index / columns) * ROW_HEIGHT}
                width={cardWidth}
                height={CARD_HEIGHT}
                delay={introDone ? 0 : Math.min(index, STAGGER_MAX_CARDS) * STAGGER_STEP_S}
                animateIn={!introDone || animateExit}
                onOpen={openDetail}
                onCompare={startCompare}
                picked={pending?.id === p.id}
              />
            );
          })}
        </AnimatePresence>
      </div>

      {ready && filtered.length === 0 && (
        <div className="py-16 text-center text-zinc-400">
          <p className="text-lg">No Pokémon match those filters.</p>
          <button type="button" onClick={clearAll} className="mt-3 rounded-lg border border-white/20 px-4 py-2 text-sm hover:bg-white/10">
            Clear filters
          </button>
        </div>
      )}
      {selected && (
        <DetailView
          key={selected.pokemon.id}
          pokemon={selected.pokemon}
          origin={selected.origin}
          resolveSpecies={resolveSpecies}
          onClosed={closeDetail}
        />
      )}
      <AnimatePresence>{pending && !selected && !comparison && <CompareTray key="tray" first={pending} onCancel={() => setPending(null)} />}</AnimatePresence>
      <AnimatePresence>{comparison && <CompareView key={`${comparison.a.id}-${comparison.b.id}`} a={comparison.a} b={comparison.b} onClose={closeComparison} />}</AnimatePresence>
    </MotionConfig>
  );
}
