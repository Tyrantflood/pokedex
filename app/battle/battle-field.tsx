"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { animate as animateTo, AnimatePresence, motion, useAnimate, useReducedMotion } from "framer-motion";
import { BANNER_MS, isBigHit } from "@/lib/battle/move-fx";
import { activeMon, type BattleView, type MonView, type SideId } from "@/lib/battle/protocol";
import { LogOverlay } from "./battle-log";
import { FxLayer, MoveBanner } from "./fx/fx-layer";
import { centerOf, spotFor, type Size } from "./fx/geometry";
import type { PlayedCue } from "./use-battle-session";
import { HpBar, SpriteImage, StatusChip, TypeChip } from "./ui";

const STAT_SHORT: Record<string, string> = { atk: "Atk", def: "Def", spa: "SpA", spd: "SpD", spe: "Spe", accuracy: "Acc", evasion: "Eva" };

/** The field's pixel size, and the sprite scale that follows from its width. */
function useFieldSize() {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<Size>({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, size, Math.max(1, Math.min(2.4, size.w / 340))] as const;
}

/** Keyframes for a shake that settles: alternating offsets with falling amplitude. */
function shakeKeyframes(amplitude: number, swings: number) {
  const x: number[] = [0];
  const y: number[] = [0];
  for (let i = 0; i < swings; i++) {
    const a = amplitude * (1 - i / (swings + 1));
    x.push((i % 2 === 0 ? -1 : 1) * a);
    y.push((i % 3 === 0 ? 0.5 : -0.4) * a);
  }
  x.push(0);
  y.push(0);
  return { x, y };
}

export function BattleField({ view, cue, cues, turnLimit = 0, ownSide = "p1" }: { view: BattleView; cue: PlayedCue | null; cues: PlayedCue[]; turnLimit?: number; ownSide?: SideId }) {
  const [ref, size, scale] = useFieldSize();
  const enemySide: SideId = ownSide === "p1" ? "p2" : "p1";
  const reduced = useReducedMotion();
  const [stage, animateStage] = useAnimate();
  const shaken = useRef(0);

  // Screen shake: on a big hit, and for the two moves that shake the world. Only the scene moves, never the plates and text.
  useEffect(() => {
    if (!cue || reduced || cue.reduced || cue.id === shaken.current || !stage.current) return;
    shaken.current = cue.id;
    const ts = cue.timeScale;
    if (cue.kind === "damage" && !cue.fromEffect && isBigHit(cue.amount ?? 0, !!cue.hit?.crit)) {
      const k = shakeKeyframes(cue.hit?.crit ? 10 : 7, 7);
      void animateStage(stage.current, k, { duration: 0.42 * ts });
    } else if (cue.kind === "move" && cue.fx?.style === "earthquake") {
      const k = shakeKeyframes(7, 18);
      void animateStage(stage.current, k, { duration: 1.0 * ts, delay: (BANNER_MS / 1000 + 0.1) * ts });
    } else if (cue.kind === "move" && cue.fx?.style === "hyperbeam") {
      const k = shakeKeyframes(5, 12);
      void animateStage(stage.current, k, { duration: 0.7 * ts, delay: (BANNER_MS / 1000 + (cue.fx.durationMs / 1000) * 0.42) * ts });
    }
  }, [cue, reduced, animateStage, stage]);

  return (
    <div
      ref={ref}
      className="relative aspect-square w-full overflow-hidden rounded-2xl border border-white/10 bg-linear-to-b from-sky-900/70 via-slate-800 to-emerald-950 sm:aspect-16/10"
      role="img"
      aria-label={`Battle field. ${describe(view, ownSide)}`}
      // The HP bars drain in step with the current speed (700 ms at the base timings), so a bar is done before the next line plays.
      style={{ "--hp-ms": `${Math.round(700 * (cue?.timeScale ?? 1))}ms` } as CSSProperties}
    >
      <div ref={stage} className="absolute inset-0">
        {/* ground, and a platform under each side */}
        <div className="absolute inset-x-0 bottom-0 h-[58%] bg-linear-to-b from-emerald-900/50 to-emerald-950/80" aria-hidden />
        {(["p1", "p2"] as const).map((side) => (
          <div
            key={side}
            aria-hidden
            className="absolute h-[9%] w-[36%] -translate-x-1/2 -translate-y-1/2 rounded-[50%] bg-black/35"
            style={{ left: `${spotFor(side, ownSide).x}%`, top: `${spotFor(side, ownSide).y - 1}%` }}
          />
        ))}
        <WeatherLayer weather={view.weather} />

        {(["p2", "p1"] as const).map((side) => (
          <Combatant key={side} view={view} side={side} ownSide={ownSide} facing={side === ownSide ? "back" : "front"} scale={scale} cue={cue} size={size} />
        ))}
        <FxLayer cues={cues} size={size} />
      </div>

      <div className="absolute left-2 right-2 top-2 flex flex-wrap items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-white/80">
        <span className={`rounded px-1.5 py-0.5 ${turnLimit && view.turn >= turnLimit - 4 ? "bg-amber-500/40 text-amber-100" : "bg-black/40"}`}>{turnLimit ? `Turn ${view.turn}/${turnLimit}` : `Turn ${view.turn}`}</span>
        {view.weather && <span className="rounded bg-sky-500/30 px-1.5 py-0.5">{weatherName(view.weather)}</span>}
        {view.terrain && <span className="rounded bg-emerald-500/30 px-1.5 py-0.5">{view.terrain}</span>}
        {view.fieldEffects.map((e) => (
          <span key={e} className="rounded bg-violet-500/30 px-1.5 py-0.5">
            {e}
          </span>
        ))}
      </div>
      {/* the latest move's banner stays mounted after the next cue arrives and fades on its own timeline */}
      <MoveBanner cue={[...cues].reverse().find((c) => c.kind === "move") ?? null} />

      <Plate view={view} side={enemySide} className="left-2 top-9 sm:top-10" own={false} />
      <Plate view={view} side={ownSide} className="bottom-15 right-2 sm:bottom-2" own />
      <LogOverlay log={view.log} />
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

function Combatant({ view, side, ownSide, facing, scale, cue, size }: { view: BattleView; side: SideId; ownSide: SideId; facing: "front" | "back"; scale: number; cue: PlayedCue | null; size: Size }) {
  const mon = activeMon(view, side);
  const reduced = useReducedMotion();
  const [scope, animate] = useAnimate();
  const lastCue = useRef<number>(0);
  const outer = useRef<HTMLDivElement>(null);

  // A Pokémon on the field is never left faded out. A switch-in or a hit blink can be cut short (fast clicking, the Fast toggle, a
  // second cue arriving mid-animation); a moment after anything settles, anything still see-through is put back.
  const present = !!mon && !mon.fainted;
  useEffect(() => {
    if (!present) return;
    const timer = setTimeout(() => {
      for (const el of [outer.current, scope.current as HTMLElement | null]) {
        if (el && Number(getComputedStyle(el).opacity) < 0.99) animateTo(el, { opacity: 1, scale: 1, y: 0, x: 0 }, { duration: 0.15 });
      }
    }, 1800);
    return () => clearTimeout(timer);
  }, [present, mon?.nickname, mon?.spriteId, cue?.id, scope]);

  useEffect(() => {
    if (!cue || cue.id === lastCue.current || reduced || cue.reduced || !scope.current) return;
    lastCue.current = cue.id;
    const ts = cue.timeScale;
    const wait = BANNER_MS / 1000; // a move's own animation starts after its banner
    const el = scope.current;
    if (cue.kind === "move" && cue.side === side && cue.fx) {
      const style = cue.fx.style;
      if (style === "lunge") {
        // Physical: into the target and back; the contact is at 85 % of the way, just before the impact lands.
        const from = centerOf(side, size, cue.own);
        const to = centerOf(cue.target ?? side, size, cue.own);
        const vx = (to.x - from.x) * 0.8;
        const vy = (to.y - from.y) * 0.8;
        void animate(el, { x: [0, vx, 0], y: [0, vy, 0], scale: [1, 1.08, 1] }, { duration: (cue.fx.durationMs / 1000) * ts, delay: wait * ts, times: [0, 0.85, 1], ease: "easeIn" });
      } else if (style === "projectile" || style === "beam" || style === "thunderbolt" || style === "surf" || style === "hyperbeam") {
        // Special: lean back and pop forward as the attack leaves.
        const back = side === "p1" ? -1 : 1;
        void animate(el, { x: [0, back * 7, 0], scale: [1, 1.1, 1] }, { duration: 0.4 * ts, delay: (wait + (style === "hyperbeam" ? 0.5 : 0)) * ts });
      } else if (style === "earthquake") {
        void animate(el, { y: [0, -14, 0, -9, 0] }, { duration: 0.7 * ts, delay: wait * ts });
      } else if (style === "swordsdance") {
        void animate(el, { rotate: [0, -6, 6, -6, 6, 0], scale: [1, 1.06, 1.06, 1.06, 1.06, 1] }, { duration: (cue.fx.durationMs / 1000) * 0.9 * ts, delay: wait * ts });
      } else if (style === "aura" || style === "pulse") {
        void animate(el, { scale: [1, 1.1, 1] }, { duration: 0.5 * ts, delay: wait * ts });
      }
    } else if (cue.kind === "damage" && cue.side === side && !cue.fromEffect) {
      // Hit: a shake and a blink (opacity only); harder for a big hit.
      const hard = isBigHit(cue.amount ?? 0, !!cue.hit?.crit);
      const a = hard ? 11 : 7;
      void animate(el, { x: [0, -a, a, -a * 0.7, a * 0.7, 0], opacity: [1, 0.3, 1, 0.3, 1, 1] }, { duration: 0.42 * ts });
    } else if (cue.kind === "damage" && cue.side === side) {
      void animate(el, { x: [0, -4, 4, 0] }, { duration: 0.25 * ts });
    } else if (cue.kind === "tera" && cue.side === side) {
      void animate(el, { scale: [1, 1.18, 1] }, { duration: 0.6 * ts });
    }
  }, [cue, side, reduced, animate, scope, size]);

  const spot = spotFor(side, ownSide);
  return (
    <div className="absolute" style={{ left: `${spot.x}%`, top: `${spot.y}%`, transform: "translate(-50%, -100%)" }}>
      <AnimatePresence mode="popLayout">
        {mon && !mon.fainted && (
          <motion.div
            ref={outer}
            key={`${mon.nickname}:${mon.spriteId}`}
            initial={reduced ? false : { scale: 0.2, opacity: 0.3, y: 12 }}
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

// ---------------------------------------------------------------------------------------------------------------------

function Plate({ view, side, className, own }: { view: BattleView; side: SideId; className: string; own: boolean }) {
  const s = view.sides[side];
  const mon = activeMon(view, side);
  return (
    <div className={`absolute z-10 w-[52%] max-w-65 rounded-xl border border-white/10 bg-black/70 p-2 shadow-lg sm:w-[40%] ${className}`}>
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
