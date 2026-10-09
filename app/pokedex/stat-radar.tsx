"use client";

import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "framer-motion";
import { useEffect } from "react";
import type { PokemonStats } from "@/lib/pokemon-types";
import { RADAR_AXES, radarMax, radarPoint, radarPolygon } from "@/lib/radar";

const W = 360;
const H = 330;
const CX = W / 2;
const CY = 168;
const R = 104;
const RINGS = [0.25, 0.5, 0.75, 1];

interface Side {
  name: string;
  stats: PokemonStats;
  color: string;
}

const total = (s: PokemonStats) => s.hp + s.attack + s.defense + s.specialAttack + s.specialDefense + s.speed;

/** Both base-stat shapes on one shared scale, growing out from the centre when the view opens. */
export function StatRadar({ a, b }: { a: Side; b: Side }) {
  const reduce = useReducedMotion();
  const max = radarMax(a.stats, b.stats);
  const progress = useMotionValue(reduce ? 1 : 0);
  const pointsA = useTransform(progress, (p) => radarPolygon(a.stats, max, p, CX, CY, R));
  const pointsB = useTransform(progress, (p) => radarPolygon(b.stats, max, p, CX, CY, R));

  useEffect(() => {
    if (reduce) {
      progress.set(1);
      return;
    }
    progress.set(0);
    const controls = animate(progress, 1, { duration: 1.2, ease: [0.22, 1, 0.36, 1], delay: 0.25 });
    return () => controls.stop();
  }, [progress, reduce, a.stats, b.stats]);

  const rings = RINGS.map((r) => RADAR_AXES.map((_, i) => radarPoint(i, r, CX, CY, R).map((n) => n.toFixed(1)).join(",")).join(" "));
  const summary = RADAR_AXES.map(({ key, label }) => `${label} ${a.stats[key]} versus ${b.stats[key]}`).join(", ");

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Base stats, ${a.name} versus ${b.name}: ${summary}`} className="mx-auto block w-full max-w-md">
        {rings.map((points, i) => (
          <polygon key={i} points={points} fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth={i === rings.length - 1 ? 1.2 : 0.8} />
        ))}
        {RADAR_AXES.map((_, i) => {
          const [x, y] = radarPoint(i, 1, CX, CY, R);
          return <line key={i} x1={CX} y1={CY} x2={x} y2={y} stroke="rgba(255,255,255,0.14)" />;
        })}
        {/* Ring values, along the first axis */}
        {RINGS.map((r) => (
          <text key={r} x={CX + 4} y={CY - R * r + 3} fontSize="8" fill="rgba(255,255,255,0.4)">
            {Math.round(max * r)}
          </text>
        ))}

        <motion.polygon points={pointsB} fill={b.color} fillOpacity={0.22} stroke={b.color} strokeWidth={2} strokeLinejoin="round" data-radar="b" />
        <motion.polygon points={pointsA} fill={a.color} fillOpacity={0.22} stroke={a.color} strokeWidth={2} strokeLinejoin="round" data-radar="a" />

        {RADAR_AXES.map(({ key, label }, i) => {
          const [x, y] = radarPoint(i, 1.2, CX, CY, R);
          const anchor = x < CX - 6 ? "end" : x > CX + 6 ? "start" : "middle";
          const dy = i === 0 ? -8 : i === 3 ? 12 : 0;
          return (
            <g key={key} fontSize="11" textAnchor={anchor} transform={`translate(0 ${dy})`}>
              <text x={x} y={y - 3} fill="rgba(255,255,255,0.78)">
                {label}
              </text>
              <text x={x} y={y + 11} fontFamily="ui-monospace, monospace" fontSize="11">
                <tspan fill={a.color}>{a.stats[key]}</tspan>
                <tspan fill="rgba(255,255,255,0.45)"> · </tspan>
                <tspan fill={b.color}>{b.stats[key]}</tspan>
              </text>
            </g>
          );
        })}
      </svg>

      <div className="mt-1 flex flex-wrap items-center justify-center gap-x-6 gap-y-1 text-sm">
        {[a, b].map((s) => (
          <span key={s.name} className="flex items-center gap-2">
            <span className="h-2.5 w-5 rounded-full" style={{ background: s.color }} />
            <span className="capitalize text-white">{s.name}</span>
            <span className="font-mono text-xs text-white/70">total {total(s.stats)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
