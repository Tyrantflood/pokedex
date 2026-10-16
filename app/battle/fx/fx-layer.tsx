"use client";

import { memo } from "react";
import { useReducedMotion } from "framer-motion";
import { BANNER_MS, isBigHit, typeFx } from "@/lib/battle/move-fx";
import { TYPE_COLORS } from "@/lib/type-colors";
import type { PokemonType } from "@/lib/pokemon-types";
import type { PlayedCue } from "../use-battle-session";
import { centerOf, type Point, type Size } from "./geometry";
import { MoveAnimation } from "./move-animations";
import { Particles } from "./particles";
import { Wa } from "./wa";

const STATUS_LOOK: Record<string, string> = { brn: "fire", par: "electric", psn: "poison", tox: "poison", frz: "ice", slp: "ghost" };

/** "Charizard used Flamethrower!", over the field for the whole move. Opacity only under reduced motion. */
export function MoveBanner({ cue }: { cue: PlayedCue | null }) {
  const reduced = useReducedMotion();
  if (!cue || cue.kind !== "move" || !cue.banner) return null;
  // Reduced motion shortens waits a lot, but the banner must stay readable: about as long as the move's hold (650 ms) plus a beat.
  const total = cue.reduced || reduced ? 0.85 : ((BANNER_MS + (cue.fx?.durationMs ?? 0) + 250) / 1000) * cue.timeScale;
  const color = TYPE_COLORS[(cue.moveType ?? "normal") as PokemonType] ?? "#a8a77a";
  return (
    <Wa as="div"
      key={cue.id}
      aria-hidden
      className="pointer-events-none absolute inset-x-2 top-2 z-20 flex justify-center"
      initial={{ opacity: 0 }}
      animate={reduced ? { opacity: [0, 1, 1, 0] } : { opacity: [0, 1, 1, 0], y: [8, 0, 0, -4] }}
      transition={{ duration: Math.max(0.3, total), times: [0, 0.08, 0.85, 1], ease: "easeOut" }}
    >
      <span
        className="flex max-w-full items-center gap-2 rounded-xl border bg-black/75 px-3 py-1.5 text-sm font-bold text-white shadow-lg sm:text-base"
        style={{ borderColor: color, boxShadow: `0 0 0 1px ${color}55` }}
      >
        <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
        <span className="truncate">{cue.banner}</span>
        <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-zinc-300">{cue.moveCategory}</span>
      </span>
    </Wa>
  );
}

/** Everything that happens on the field itself: attack animations, impacts, auras, floating text. Each cue mounts once and plays out. */
export function FxLayer({ cues, size }: { cues: PlayedCue[]; size: Size }) {
  const reduced = useReducedMotion();
  if (size.w === 0) return null;
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {cues.map((cue) => (
        <CueFx key={cue.id} cue={cue} size={size} reduced={!!reduced || cue.reduced} />
      ))}
    </div>
  );
}

// Memoised: a cue never changes once played, so a new cue arriving must not re-render the ones still playing out.
const CueFx = memo(function CueFx({ cue, size, reduced }: { cue: PlayedCue; size: Size; reduced: boolean }) {
  const ts = cue.timeScale;
  const here = centerOf(cue.side, size, cue.own);
  const unit = Math.max(0.8, Math.min(1.7, size.w / 340));
  const label = cue.label ? <FloatLabel cue={cue} at={here} reduced={reduced} /> : null;

  // Reduced motion: no movement at all; a hit is a brief flash over the target, everything else is the text.
  if (reduced) {
    if (cue.kind === "damage" && !cue.fromEffect) return <>{label}<HitFlash at={here} px={90} /></>;
    return label;
  }

  switch (cue.kind) {
    case "move":
      return <MoveAnimation cue={cue} size={size} ts={ts} />;
    case "damage": {
      const big = isBigHit(cue.amount ?? 0, !!cue.hit?.crit);
      return (
        <>
          {!cue.fromEffect && (
            <>
              <Particles type={cue.lastMoveType} at={here} seed={cue.id} timeScale={ts} count={big ? undefined : 8} reach={(big ? 92 : 68) * unit} size={30 * unit} />
              <ImpactRing at={here} color={typeFx(cue.lastMoveType).colors[0]} ts={ts} big={big} />
            </>
          )}
          {cue.hit?.crit && <CritFlash ts={ts} />}
          {label}
        </>
      );
    }
    case "heal":
      return (
        <>
          <Particles type="heal" at={here} seed={cue.id} timeScale={ts} reach={64 * unit} size={26 * unit} />
          {label}
        </>
      );
    case "boost":
    case "unboost":
      return (
        <>
          <Particles type={cue.kind} at={here} seed={cue.id} timeScale={ts} reach={64 * unit} size={22 * unit} />
          {label}
        </>
      );
    case "status":
      return (
        <>
          <Particles type={STATUS_LOOK[(cue.label ?? "").toLowerCase()] ?? "ghost"} at={here} seed={cue.id} timeScale={ts} reach={58 * unit} count={8} size={26 * unit} />
          {label}
        </>
      );
    case "switch":
      return <Particles type="normal" at={here} seed={cue.id} timeScale={ts} reach={50 * unit} count={6} size={18 * unit} />;
    case "mega":
      return <ImpactRing at={here} color="#ffffff" ts={ts} big />;
    case "tera":
      return (
        <>
          <ImpactRing at={here} color={TYPE_COLORS[(cue.moveType ?? "normal") as PokemonType] ?? "#fff"} ts={ts} big />
          <Particles type={cue.moveType ?? "normal"} at={here} seed={cue.id} timeScale={ts} reach={78 * unit} count={10} size={26 * unit} />
        </>
      );
    case "block":
      return <ShieldFlash at={here} ts={ts} />;
    default:
      return label;
  }
});

function FloatLabel({ cue, at, reduced }: { cue: PlayedCue; at: Point; reduced: boolean }) {
  const tone =
    cue.kind === "heal" || cue.kind === "boost" || cue.effect === "super" || cue.effect === "crit"
      ? "text-emerald-300"
      : cue.kind === "damage" || cue.kind === "unboost" || cue.effect === "resisted" || cue.effect === "immune" || cue.kind === "miss"
        ? "text-red-300"
        : "text-amber-200";
  return (
    <Wa
      className={`absolute z-10 -translate-x-1/2 whitespace-nowrap rounded bg-black/65 px-1.5 py-0.5 text-xs font-bold ${tone}`}
      style={{ left: at.x, top: at.y - 38 }}
      initial={{ opacity: 0 }}
      animate={reduced ? { opacity: [0, 1, 1, 0] } : { y: [4, -18], opacity: [0, 1, 1, 0] }}
      transition={{ duration: reduced ? 1 : 1.1 * cue.timeScale + 0.25, times: [0, 0.15, 0.7, 1] }}
    >
      {cue.label}
    </Wa>
  );
}

function ImpactRing({ at, color, ts, big }: { at: Point; color: string; ts: number; big: boolean }) {
  const px = big ? 110 : 76;
  return (
    <div className="absolute" style={{ left: at.x, top: at.y, width: 0, height: 0 }}>
      <Wa
        className="absolute rounded-full"
        style={{ left: -px / 2, top: -px / 2, width: px, height: px, background: `radial-gradient(circle, #ffffffcc 0%, ${color}aa 40%, ${color}00 70%)` }}
        initial={{ opacity: 0 }}
        animate={{ scale: [0.3, big ? 2.1 : 1.6], opacity: [0.95, 0] }}
        transition={{ duration: 0.5 * ts, ease: "easeOut" }}
      />
    </div>
  );
}

function HitFlash({ at, px }: { at: Point; px: number }) {
  return (
    <div className="absolute" style={{ left: at.x, top: at.y, width: 0, height: 0 }}>
      <Wa
        className="absolute rounded-full bg-white"
        style={{ left: -px / 2, top: -px / 2, width: px, height: px }}
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0.5, 0] }}
        transition={{ duration: 0.25 }}
      />
    </div>
  );
}

function CritFlash({ ts }: { ts: number }) {
  return <Wa as="div" className="absolute inset-0 bg-white" initial={{ opacity: 0 }} animate={{ opacity: [0, 0.7, 0] }} transition={{ duration: 0.3 * ts, times: [0, 0.2, 1] }} />;
}

function ShieldFlash({ at, ts }: { at: Point; ts: number }) {
  const r = 58;
  return (
    <div className="absolute" style={{ left: at.x, top: at.y, width: 0, height: 0 }}>
      <Wa
        className="absolute rounded-full"
        style={{ left: -r, top: -r, width: r * 2, height: r * 2, border: "3px solid rgba(125,240,255,0.95)", background: "radial-gradient(circle, rgba(125,240,255,0.12) 55%, rgba(125,240,255,0.5) 100%)" }}
        initial={{ opacity: 0 }}
        animate={{ scale: [0.8, 1.12, 1.05], opacity: [0, 1, 0] }}
        transition={{ duration: 0.45 * ts, ease: "easeOut" }}
      />
    </div>
  );
}
