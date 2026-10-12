"use client";

import { motion } from "framer-motion";
import { seeded, typeFx, type ParticleMotion, type ParticleShape } from "@/lib/battle/move-fx";
import type { Point } from "./geometry";
import { Shape } from "./shapes";

interface Motion {
  x: number[];
  y: number[];
  scale: number[];
  opacity: number[];
  rotate: number[];
  /** Seconds, before time scaling. */
  duration: number;
  delay: number;
}

const FACES_OUTWARD: ParticleShape[] = ["streak", "shard", "claw", "slash", "bolt"];

/** The path of one particle. Every value is a transform or opacity keyframe; nothing here touches layout or paint properties. */
function pathFor(kind: ParticleMotion, rnd: () => number, i: number, n: number, reach: number, outward: boolean): Motion {
  const angle = (i / n) * Math.PI * 2 + (rnd() - 0.5) * 0.6;
  const turn = (a: number) => (outward ? (a * 180) / Math.PI + 90 : (rnd() - 0.5) * 120);
  switch (kind) {
    case "burst": {
      const d = reach * (0.55 + 0.75 * rnd());
      return { x: [0, Math.cos(angle) * d * 0.8, Math.cos(angle) * d], y: [0, Math.sin(angle) * d * 0.8, Math.sin(angle) * d], scale: [0.3, 1.2, 1], opacity: [1, 1, 0], rotate: [turn(angle), turn(angle), turn(angle)], duration: 0.55, delay: 0 };
    }
    case "rise": {
      const sway = (rnd() - 0.5) * reach * 0.6;
      return { x: [(rnd() - 0.5) * reach * 0.5, sway], y: [reach * 0.15, -reach * (0.7 + 0.6 * rnd())], scale: [0.5, 1.1], opacity: [0.95, 0], rotate: [0, (rnd() - 0.5) * 40], duration: 0.7, delay: rnd() * 0.25 };
    }
    case "splash": {
      const dx = (rnd() - 0.5) * reach * 1.6;
      return { x: [0, dx * 0.5, dx], y: [0, -reach * (0.7 + 0.5 * rnd()), reach * 0.45], scale: [0.6, 1, 0.7], opacity: [1, 1, 0], rotate: [0, 0, 0], duration: 0.65, delay: rnd() * 0.12 };
    }
    case "swirl": {
      const r0 = reach * 0.2;
      const r1 = reach * (0.7 + 0.3 * rnd());
      const pts = [0, 1, 2, 3, 4].map((k) => ({ a: angle + k * 1.15, r: r0 + ((r1 - r0) * k) / 4 }));
      return { x: pts.map((p) => Math.cos(p.a) * p.r), y: pts.map((p) => Math.sin(p.a) * p.r * 0.7), scale: [0.4, 1, 1, 1, 0.5], opacity: [0, 1, 1, 1, 0], rotate: [0, 90, 180, 270, 360], duration: 0.85, delay: rnd() * 0.15 };
    }
    case "sweep": {
      const y = (rnd() - 0.5) * reach * 0.8;
      return { x: [-reach * 1.1, reach * 1.1], y: [y, y - reach * 0.25], scale: [0.7, 1.3], opacity: [0, 1, 0], rotate: [-24, -24, -24], duration: 0.5, delay: i * 0.07 };
    }
    case "pulse":
      return { x: [0, 0], y: [0, 0], scale: [0.2, 2.4], opacity: [0.95, 0], rotate: [0, 0], duration: 0.7, delay: i * 0.13 };
    case "fall": {
      const x = (rnd() - 0.5) * reach * 1.2;
      return { x: [x, x * 0.8], y: [-reach * 1.5, reach * 0.05], scale: [0.8, 1], opacity: [0, 1, 1, 0], rotate: [rnd() * 90, rnd() * 360], duration: 0.55, delay: rnd() * 0.3 };
    }
    case "swarm": {
      const pt = () => (rnd() - 0.5) * reach * 1.3;
      return { x: [pt(), pt(), pt(), pt(), pt()], y: [pt(), pt(), pt(), pt(), pt()], scale: [1, 1, 1, 1, 1], opacity: [0, 1, 1, 1, 0], rotate: [0, 0, 0, 0, 0], duration: 0.8, delay: rnd() * 0.2 };
    }
    case "float": {
      const x = (rnd() - 0.5) * reach * 0.7;
      return { x: [x, x + 14, x - 8], y: [reach * 0.2, -reach * 0.35, -reach * 0.9], scale: [0.6, 1, 1.25], opacity: [0, 0.95, 0], rotate: [0, 8, -8], duration: 1.0, delay: rnd() * 0.3 };
    }
    case "twinkle": {
      const x = (rnd() - 0.5) * reach * 1.5;
      const y = (rnd() - 0.5) * reach * 1.3;
      return { x: [x, x, x], y: [y, y, y], scale: [0, 1.25, 0], opacity: [0, 1, 0], rotate: [0, 45, 90], duration: 0.55, delay: rnd() * 0.55 };
    }
  }
}

/**
 * A cloud of particles in a type's look (see TYPE_FX), centred on `at`. `seed` makes the scatter repeatable; `timeScale` shortens it
 * for the Fast toggle; `delayS` (seconds, before scaling) holds it back until its beat.
 */
export function Particles({
  type,
  at,
  seed,
  timeScale,
  delayS = 0,
  reach = 64,
  size = 22,
  count,
  override,
}: {
  type: string;
  at: Point;
  seed: number;
  timeScale: number;
  delayS?: number;
  reach?: number;
  size?: number;
  count?: number;
  /** Use another type's shape/motion with this type's colours (an iconic move can borrow a look). */
  override?: Partial<{ shape: ParticleShape; motion: ParticleMotion }>;
}) {
  const fx = typeFx(type);
  const shape = override?.shape ?? fx.shape;
  const kind = override?.motion ?? fx.motion;
  const n = count ?? fx.count;
  const rnd = seeded(seed);
  const outward = FACES_OUTWARD.includes(shape);
  const big = shape === "ring" ? size * 2.4 : size;
  return (
    <div aria-hidden className="pointer-events-none absolute" style={{ left: at.x, top: at.y, width: 0, height: 0 }}>
      {Array.from({ length: n }, (_, i) => {
        const m = pathFor(kind, rnd, i, n, reach, outward);
        const colorIsAccent = i % 3 === 2;
        return (
          <motion.span
            key={i}
            className="absolute"
            style={{ left: -big / 2, top: -big / 2, width: big, height: big }}
            initial={{ opacity: 0 }}
            animate={{ x: m.x, y: m.y, scale: m.scale, opacity: m.opacity, rotate: m.rotate }}
            transition={{ duration: m.duration * timeScale, delay: (delayS + m.delay) * timeScale, ease: "easeOut" }}
          >
            <Shape shape={shape} color={colorIsAccent ? fx.colors[1] : fx.colors[0]} accent={colorIsAccent ? fx.colors[0] : fx.colors[1]} size={big} />
          </motion.span>
        );
      })}
    </div>
  );
}
