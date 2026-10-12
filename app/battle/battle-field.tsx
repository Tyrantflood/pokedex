"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useAnimate, useReducedMotion } from "framer-motion";
import { activeMon, type BattleView, type MonView, type SideId } from "@/lib/battle/protocol";
import { TYPE_COLORS } from "@/lib/type-colors";
import type { PokemonType } from "@/lib/pokemon-types";
import type { PlayedCue } from "./use-local-battle";
import { HpBar, SpriteImage, StatusChip, TypeChip } from "./ui";

/** Where each side's Pokémon stands, as a percentage of the field: horizontal centre and the bottom edge of the sprite. */
const SPOT: Record<SideId, { x: number; y: number }> = { p1: { x: 27, y: 88 }, p2: { x: 72, y: 50 } };

const STAT_SHORT: Record<string, string> = { atk: "Atk", def: "Def", spa: "SpA", spd: "SpD", spe: "Spe", accuracy: "Acc", evasion: "Eva" };

function useFieldScale() {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1.6);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setScale(Math.max(1, Math.min(2.4, el.clientWidth / 340)));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, scale] as const;
}

export function BattleField({ view, cue, ownSide = "p1" }: { view: BattleView; cue: PlayedCue | null; ownSide?: SideId }) {
  const [ref, scale] = useFieldScale();
  const enemySide: SideId = ownSide === "p1" ? "p2" : "p1";
  return (
    <div
      ref={ref}
      className="relative aspect-square w-full overflow-hidden rounded-2xl border border-white/10 bg-linear-to-b from-sky-900/70 via-slate-800 to-emerald-950 sm:aspect-16/10"
      role="img"
      aria-label={`Battle field. ${describe(view, ownSide)}`}
    >
      {/* ground, and a platform under each side */}
      <div className="absolute inset-x-0 bottom-0 h-[58%] bg-linear-to-b from-emerald-900/50 to-emerald-950/80" aria-hidden />
      {(["p1", "p2"] as const).map((side) => (
        <div
          key={side}
          aria-hidden
          className="absolute h-[9%] w-[36%] -translate-x-1/2 -translate-y-1/2 rounded-[50%] bg-black/35"
          style={{ left: `${SPOT[side].x}%`, top: `${SPOT[side].y - 1}%` }}
        />
      ))}
      <WeatherLayer weather={view.weather} />

      <div className="absolute left-2 right-2 top-2 flex flex-wrap items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-white/80">
        <span className="rounded bg-black/40 px-1.5 py-0.5">Turn {view.turn}</span>
        {view.weather && <span className="rounded bg-sky-500/30 px-1.5 py-0.5">{weatherName(view.weather)}</span>}
        {view.terrain && <span className="rounded bg-emerald-500/30 px-1.5 py-0.5">{view.terrain}</span>}
        {view.fieldEffects.map((e) => (
          <span key={e} className="rounded bg-violet-500/30 px-1.5 py-0.5">
            {e}
          </span>
        ))}
      </div>

      {(["p2", "p1"] as const).map((side) => (
        <Combatant key={side} view={view} side={side} facing={side === ownSide ? "back" : "front"} scale={scale} cue={cue} />
      ))}
      {cue && <CueEffects key={cue.id} cue={cue} />}

      <Plate view={view} side={enemySide} className="left-2 top-9 sm:top-10" own={false} />
      <Plate view={view} side={ownSide} className="bottom-2 right-2" own />
    </div>
  );
}

function describe(view: BattleView, ownSide: SideId) {
  const mine = activeMon(view, ownSide);
  const theirs = activeMon(view, ownSide === "p1" ? "p2" : "p1");
  return `${mine ? `Your ${mine.species}` : "No Pokémon"} against ${theirs ? `the opposing ${theirs.species}` : "no Pokémon"}.`;
}

const weatherName = (w: string) =>
  ({ RainDance: "Rain", PrimordialSea: "Heavy rain", SunnyDay: "Harsh sun", DesolateLand: "Extreme sun", Sandstorm: "Sandstorm", Hail: "Hail", Snow: "Snow", DeltaStream: "Strong winds" })[w] ?? w;

function WeatherLayer({ weather }: { weather: string }) {
  const tint: Record<string, string> = {
    RainDance: "bg-blue-900/30",
    PrimordialSea: "bg-blue-900/45",
    SunnyDay: "bg-amber-400/15",
    DesolateLand: "bg-orange-500/25",
    Sandstorm: "bg-yellow-700/30",
    Hail: "bg-cyan-200/15",
    Snow: "bg-cyan-100/15",
    DeltaStream: "bg-slate-300/10",
  };
  if (!weather || !tint[weather]) return null;
  return <div aria-hidden className={`pointer-events-none absolute inset-0 ${tint[weather]}`} />;
}

// ---------------------------------------------------------------------------------------------------------------------

function Combatant({ view, side, facing, scale, cue }: { view: BattleView; side: SideId; facing: "front" | "back"; scale: number; cue: PlayedCue | null }) {
  const mon = activeMon(view, side);
  const reduced = useReducedMotion();
  const [scope, animate] = useAnimate();
  const lastCue = useRef<number>(0);

  useEffect(() => {
    if (!cue || cue.id === lastCue.current || reduced || !scope.current) return;
    lastCue.current = cue.id;
    // A step toward the other side's Pokémon, as if lunging; and a shake with a flash when hit.
    const toward = side === "p1" ? 1 : -1;
    if (cue.kind === "move" && cue.side === side) {
      void animate(scope.current, { x: [0, toward * 44, 0], y: [0, -toward * 14, 0] }, { duration: 0.42, ease: "easeOut" });
    } else if (cue.kind === "damage" && cue.side === side) {
      void animate(scope.current, { x: [0, -8, 8, -6, 6, 0] }, { duration: 0.4 });
    } else if (cue.kind === "tera" && cue.side === side) {
      void animate(scope.current, { scale: [1, 1.18, 1] }, { duration: 0.6 });
    }
  }, [cue, side, reduced, animate, scope]);

  const spot = SPOT[side];
  return (
    <div className="absolute" style={{ left: `${spot.x}%`, top: `${spot.y}%`, transform: "translate(-50%, -100%)" }}>
      <AnimatePresence mode="popLayout">
        {mon && !mon.fainted && (
          <motion.div
            key={`${mon.nickname}:${mon.spriteId}`}
            initial={reduced ? false : { scale: 0.2, opacity: 0, y: 12 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: 36, scale: 0.85, transition: { duration: 0.55 } }}
            transition={{ type: "spring", stiffness: 260, damping: 20 }}
          >
            <div ref={scope} className="relative flex items-end justify-center">
              <SpriteImage spriteId={mon.spriteId} facing={facing} scale={scale} alt={`${mon.species}${mon.status ? `, ${mon.status}` : ""}`} />
              {mon.volatiles.includes("Substitute") && (
                <span aria-hidden className="absolute -bottom-1 -right-3 rounded bg-black/50 px-1 text-[9px] font-bold uppercase text-white/80">
                  Sub
                </span>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** One-off effects for the current cue: a coloured burst where a move lands, floating text, a Terastal ring. */
function CueEffects({ cue }: { cue: PlayedCue }) {
  const reduced = useReducedMotion();
  const spot = SPOT[cue.side];
  const color = TYPE_COLORS[cue.lastMoveType as PokemonType] ?? "#ffffff";
  const labelTone =
    cue.kind === "heal" || cue.kind === "boost" || cue.effect === "super" || cue.effect === "crit"
      ? "text-emerald-300"
      : cue.kind === "damage" || cue.kind === "unboost" || cue.effect === "resisted" || cue.effect === "immune" || cue.kind === "miss"
        ? "text-red-300"
        : "text-amber-200";
  const burstColor = cue.kind === "heal" ? "#34d399" : cue.kind === "tera" ? (TYPE_COLORS[cue.moveType as PokemonType] ?? "#fff") : color;
  const showBurst = (cue.kind === "damage" || cue.kind === "heal" || cue.kind === "tera") && !reduced;
  return (
    <>
      {showBurst && (
        <motion.div
          aria-hidden
          className="pointer-events-none absolute size-24 rounded-full"
          style={{ left: `${spot.x}%`, top: `${spot.y - 12}%`, marginLeft: -48, marginTop: -48, background: `radial-gradient(circle, ${burstColor}ee 0%, ${burstColor}66 45%, transparent 70%)` }}
          initial={{ scale: 0.3, opacity: 0.95 }}
          animate={{ scale: 1.9, opacity: 0 }}
          transition={{ duration: 0.55, ease: "easeOut" }}
        />
      )}
      {cue.label && (
        <motion.span
          aria-hidden
          className={`pointer-events-none absolute z-10 -translate-x-1/2 whitespace-nowrap rounded bg-black/65 px-1.5 py-0.5 text-xs font-bold ${labelTone}`}
          style={{ left: `${spot.x}%`, top: `${spot.y - 26}%` }}
          initial={{ y: 4, opacity: 0 }}
          animate={reduced ? { y: 0, opacity: [0, 1, 1, 0] } : { y: -18, opacity: [0, 1, 1, 0] }}
          transition={{ duration: 1.1, times: [0, 0.15, 0.7, 1] }}
        >
          {cue.label}
        </motion.span>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------------------------------------------------

function Plate({ view, side, className, own }: { view: BattleView; side: SideId; className: string; own: boolean }) {
  const s = view.sides[side];
  const mon = activeMon(view, side);
  return (
    <div className={`absolute z-10 w-[52%] max-w-65 rounded-xl border border-white/10 bg-black/55 p-2 shadow-lg backdrop-blur-sm sm:w-[40%] ${className}`}>
      <div className="mb-1 truncate text-[10px] font-semibold uppercase tracking-wider text-teal-200/80">{own ? "You" : "Opponent"} · {s.name}</div>
      {mon ? <PlateMon mon={mon} own={own} /> : <div className="py-3 text-center text-xs text-zinc-400">—</div>}
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <TeamPips mons={s.mons} size={s.teamSize} />
        {s.conditions.length > 0 && (
          <div className="flex flex-wrap justify-end gap-1">
            {s.conditions.map((c) => (
              <span key={c} className="rounded bg-violet-500/30 px-1 text-[9px] font-semibold uppercase text-violet-100">
                {c}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PlateMon({ mon, own }: { mon: MonView; own: boolean }) {
  const fraction = mon.maxHp ? mon.hp / mon.maxHp : 0;
  const boosts = Object.entries(mon.boosts).filter(([, v]) => v !== 0);
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-sm font-bold text-white">
          {mon.species}
          <span className="ml-1 text-[11px] font-normal text-zinc-300">{mon.gender === "M" ? "♂" : mon.gender === "F" ? "♀" : ""}</span>
        </span>
        <span className="shrink-0 text-[11px] text-zinc-300">Lv {mon.level}</span>
      </div>
      <div className="mt-1 flex items-center gap-1.5">
        <HpBar fraction={fraction} className="flex-1" />
        <StatusChip status={mon.status} />
      </div>
      <div className="mt-0.5 text-right text-[10px] tabular-nums text-zinc-300">{own ? `${mon.hp}/${mon.maxHp}` : `${Math.round(fraction * 100)}%`}</div>
      <div className="mt-0.5 flex flex-wrap gap-1">
        {mon.tera && <TypeChip type={mon.tera.toLowerCase()} className="text-[9px]!" />}
        {boosts.map(([stat, value]) => (
          <span key={stat} className={`rounded px-1 text-[9px] font-bold ${value > 0 ? "bg-emerald-500/30 text-emerald-100" : "bg-red-500/30 text-red-100"}`}>
            {STAT_SHORT[stat] ?? stat} {value > 0 ? `+${value}` : value}
          </span>
        ))}
      </div>
    </div>
  );
}

function TeamPips({ mons, size }: { mons: MonView[]; size: number }) {
  const unseen = Math.max(0, size - mons.length);
  return (
    <div className="flex gap-1" aria-label={`${mons.filter((m) => !m.fainted).length + unseen} of ${size} Pokémon left`}>
      {mons.map((m) => (
        <span key={m.nickname} title={m.species} className={`size-2.5 rounded-full ring-1 ring-black/40 ${m.fainted ? "bg-zinc-600" : m.status ? "bg-amber-400" : "bg-red-400"}`} />
      ))}
      {Array.from({ length: unseen }, (_, i) => (
        <span key={`unseen-${i}`} className="size-2.5 rounded-full bg-red-400/60 ring-1 ring-black/40" />
      ))}
    </div>
  );
}
