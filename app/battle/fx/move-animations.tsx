"use client";

import type { ReactNode } from "react";
import { BANNER_MS, seeded, typeFx } from "@/lib/battle/move-fx";
import type { PlayedCue } from "../use-battle-session";
import { angleDeg, centerOf, distance, type Point, type Size } from "./geometry";
import { Particles } from "./particles";
import { Shape } from "./shapes";
import { Wa, type Frames, type Timing } from "./wa";

interface Props {
  cue: PlayedCue;
  size: Size;
  /** Multiplies every duration: 1 normally, smaller for Fast. */
  ts: number;
}

const at = (p: Point, children: ReactNode, key?: string) => (
  <div key={key} aria-hidden className="pointer-events-none absolute" style={{ left: p.x, top: p.y, width: 0, height: 0 }}>
    {children}
  </div>
);

/** An expanding ring: the staple of auras, shockwaves and pulses. */
function Ring({ color, px, delay, ts, duration = 0.6, from = 0.3, to = 2.2 }: { color: string; px: number; delay: number; ts: number; duration?: number; from?: number; to?: number }) {
  return (
    <Wa
      className="absolute rounded-full"
      style={{ left: -px / 2, top: -px / 2, width: px, height: px, border: `3px solid ${color}`, background: `radial-gradient(circle, ${color}22 0%, transparent 70%)` }}
      initial={{ opacity: 0 }}
      animate={{ scale: [from, to], opacity: [0.9, 0] }}
      transition={{ duration: duration * ts, delay: delay * ts, ease: "easeOut" }}
    />
  );
}

/** A glowing ball: radial gradient, so there is no blur filter to rasterise. */
function Orb({ color, px, animate, transition }: { color: string; px: number; animate: Frames; transition: Timing }) {
  return (
    <Wa
      className="absolute rounded-full"
      style={{ left: -px / 2, top: -px / 2, width: px, height: px, background: `radial-gradient(circle, #fff 0%, ${color} 38%, ${color}00 72%)` }}
      initial={{ opacity: 0 }}
      animate={animate}
      transition={transition}
    />
  );
}

export function MoveAnimation({ cue, size, ts }: Props) {
  const fx = cue.fx;
  if (!fx || cue.kind !== "move") return null;
  const from = centerOf(cue.side, size, cue.own);
  const to = cue.target && cue.target !== cue.side ? centerOf(cue.target, size, cue.own) : from;
  const start = BANNER_MS / 1000; // the banner is shown first
  const dur = fx.durationMs / 1000;
  const look = typeFx(fx.type);
  const [color, accent] = look.colors;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const rnd = seeded(cue.id * 7919);
  const unit = Math.max(0.6, Math.min(1.6, size.w / 340));

  switch (fx.style) {
    case "lunge":
      return null; // the attacker itself moves (Combatant); the impact comes with the damage

    case "projectile": {
      const flight = dur * 0.85;
      const trail = [0, 0.05, 0.1, 0.15];
      return at(
        from,
        trail.map((lag, i) => (
          <Wa
            key={i}
            className="absolute"
            style={{ left: -17 * unit, top: -17 * unit, width: 34 * unit, height: 34 * unit }}
            initial={{ opacity: 0 }}
            animate={{ x: [0, dx], y: [0, dy], opacity: [0, 1 - i * 0.22, 1 - i * 0.22, 0], scale: [0.5, 1 - i * 0.12, 1 - i * 0.12, 0.8], rotate: [0, look.shape === "streak" || look.shape === "shard" || look.shape === "slash" ? 0 : 360] }}
            transition={{ duration: flight * ts, delay: (start + lag) * ts, ease: "easeIn", times: [0, 0.1, 0.9, 1] }}
          >
            <span className="absolute inset-0 rounded-full" style={{ background: `radial-gradient(circle, ${color}cc 0%, ${color}00 70%)`, opacity: 0.8 }} />
            <span className="absolute inset-[18%]">
              <Shape shape={look.shape} color={color} accent={accent} size={20 * unit} />
            </span>
          </Wa>
        )),
      );
    }

    case "beam": {
      const len = distance(from, to);
      const angle = angleDeg(from, to);
      return at(
        from,
        <>
          <Orb color={color} px={46 * unit} animate={{ scale: [0.3, 1.2, 0.2], opacity: [0, 1, 0] }} transition={{ duration: dur * 0.5 * ts, delay: start * ts }} />
          <div style={{ position: "absolute", left: 0, top: 0, width: len, height: 0, transform: `rotate(${angle}deg)`, transformOrigin: "0 0" }}>
            <Wa
              className="absolute origin-left"
              style={{ left: 0, top: -13 * unit, width: len, height: 26 * unit, borderRadius: 999, background: `linear-gradient(90deg, ${accent}00, ${color}88 30%, ${color}88 70%, ${accent}00)` }}
              initial={{ opacity: 0 }}
              animate={{ scaleX: [0, 1, 1], opacity: [0, 1, 0] }}
              transition={{ duration: dur * 0.9 * ts, delay: (start + dur * 0.1) * ts, times: [0, 0.3, 1] }}
            />
            <Wa
              className="absolute origin-left"
              style={{ left: 0, top: -5 * unit, width: len, height: 10 * unit, borderRadius: 999, background: `linear-gradient(90deg, #ffffff, ${accent} 60%, ${color})` }}
              initial={{ opacity: 0 }}
              animate={{ scaleX: [0, 1, 1], opacity: [0, 1, 0] }}
              transition={{ duration: dur * 0.9 * ts, delay: (start + dur * 0.1) * ts, times: [0, 0.3, 1] }}
            />
          </div>
        </>,
      );
    }

    case "aura":
      return (
        <>
          {at(
            from,
            <>
              <Ring color={color} px={90 * unit} delay={start} ts={ts} />
              <Ring color={accent} px={90 * unit} delay={start + 0.2} ts={ts} />
              <Ring color={color} px={90 * unit} delay={start + 0.4} ts={ts} />
            </>,
          )}
          <Particles type={fx.type} at={from} seed={cue.id} timeScale={ts} delayS={start} reach={56 * unit} count={8} />
        </>
      );

    case "pulse":
      return (
        <>
          {at(
            to,
            <>
              <Ring color={color} px={80 * unit} delay={start} ts={ts} to={2.6} />
              <Ring color={accent} px={80 * unit} delay={start + 0.22} ts={ts} to={2.6} />
            </>,
          )}
          <Particles type={fx.type} at={to} seed={cue.id} timeScale={ts} delayS={start + 0.1} reach={52 * unit} count={8} />
        </>
      );

    case "earthquake": {
      // The whole field shakes (Field), dust and rubble jump off the ground, cracks open under both platforms.
      const base = size.h * 0.88;
      const crack = (p: Point, key: string, d: number) => {
        const tilt = (rnd() - 0.5) * 8;
        return at(
          { x: p.x, y: (p.y > size.h * 0.5 ? size.h * 0.89 : size.h * 0.51) },
          <Wa
            key={key}
            className="absolute origin-center"
            style={{ left: -size.w * 0.17, top: -2, width: size.w * 0.34, height: 4, background: "linear-gradient(90deg, transparent, #3b2a14 20%, #1a1208 50%, #3b2a14 80%, transparent)" }}
            initial={{ opacity: 0, scaleX: 0.1 }}
            animate={{ opacity: [0, 1, 1, 0], scaleX: [0.1, 1, 1, 1], rotate: tilt }}
            transition={{ duration: dur * 0.9 * ts, delay: (start + d) * ts, times: [0, 0.2, 0.75, 1] }}
          />,
          key,
        );
      };
      return (
        <>
          <Wa as="div"
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-amber-900"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.28, 0.12, 0.26, 0] }}
            transition={{ duration: dur * ts, delay: start * ts }}
          />
          {crack(from, "c1", 0)}
          {crack(to, "c2", 0.08)}
          {[0.2, 0.5, 0.8].map((fraction, i) => (
            <Particles key={i} type="ground" at={{ x: size.w * fraction, y: base }} seed={cue.id + i} timeScale={ts} delayS={start + 0.1 * i} reach={58 * unit} count={5} size={24 * unit} />
          ))}
          <Particles type="rock" at={to} seed={cue.id + 9} timeScale={ts} delayS={start + 0.35} reach={60 * unit} count={5} size={20 * unit} />
        </>
      );
    }

    case "hyperbeam": {
      const len = distance(from, to);
      const angle = angleDeg(from, to);
      return (
        <>
          {at(
            from,
            <>
              <Orb color="#ffb347" px={80 * unit} animate={{ scale: [0.15, 1.5, 1.8], opacity: [0, 1, 0] }} transition={{ duration: dur * 0.42 * ts, delay: start * ts, times: [0, 0.8, 1] }} />
              <div style={{ position: "absolute", left: 0, top: 0, width: len, height: 0, transform: `rotate(${angle}deg)`, transformOrigin: "0 0" }}>
                <Wa
                  className="absolute origin-left"
                  style={{ left: 0, top: -24 * unit, width: len, height: 48 * unit, borderRadius: 999, background: "linear-gradient(90deg, #ff8a3d00, #ff8a3dbb 20%, #ffd28099 80%, #ffd28000)" }}
                  initial={{ opacity: 0 }}
                  animate={{ scaleX: [0, 1, 1], opacity: [0, 1, 0] }}
                  transition={{ duration: dur * 0.58 * ts, delay: (start + dur * 0.4) * ts, times: [0, 0.22, 1] }}
                />
                <Wa
                  className="absolute origin-left"
                  style={{ left: 0, top: -11 * unit, width: len, height: 22 * unit, borderRadius: 999, background: "linear-gradient(90deg, #fff, #fff6dc 70%, #ffe6a8)" }}
                  initial={{ opacity: 0 }}
                  animate={{ scaleX: [0, 1, 1], opacity: [0, 1, 0] }}
                  transition={{ duration: dur * 0.58 * ts, delay: (start + dur * 0.4) * ts, times: [0, 0.22, 1] }}
                />
              </div>
            </>,
          )}
          {at(to, <Ring color="#ffb347" px={90 * unit} delay={start + dur * 0.55} ts={ts} to={3.2} duration={0.55} />)}
          <Wa as="div"
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-white"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.5, 0] }}
            transition={{ duration: 0.3 * ts, delay: (start + dur * 0.42) * ts }}
          />
        </>
      );
    }

    case "protect": {
      const r = 64 * unit;
      return (
        <>
          {at(
            from,
            <Wa
              className="absolute rounded-full"
              style={{
                left: -r,
                top: -r,
                width: r * 2,
                height: r * 2,
                border: "3px solid rgba(125,240,255,0.95)",
                background: "radial-gradient(circle, rgba(125,240,255,0.10) 55%, rgba(125,240,255,0.42) 100%)",
              }}
              initial={{ opacity: 0 }}
              animate={{ scale: [0.55, 1.08, 1, 1], opacity: [0, 1, 0.85, 0] }}
              transition={{ duration: dur * ts, delay: start * ts, times: [0, 0.25, 0.55, 1] }}
            >
              <svg viewBox="0 0 100 100" className="absolute inset-0" aria-hidden>
                <g fill="none" stroke="rgba(190,250,255,0.75)" strokeWidth="1.4">
                  <path d="M50 18 L64 26 L64 42 L50 50 L36 42 L36 26Z" />
                  <path d="M64 42 L78 50 L78 66 L64 74 L50 66 L50 50Z" />
                  <path d="M36 42 L50 50 L50 66 L36 74 L22 66 L22 50Z" />
                </g>
              </svg>
            </Wa>,
          )}
          <Particles type="steel" at={from} seed={cue.id} timeScale={ts} delayS={start + 0.1} reach={60 * unit} count={6} size={16 * unit} />
        </>
      );
    }

    case "thunderbolt": {
      const bolts = [0, 1, 2].map((i) => {
        const w = 70 * unit;
        const h = Math.max(40, to.y);
        const jitter = (i - 1) * 14 * unit;
        const pts: string[] = [];
        const steps = 7;
        for (let k = 0; k <= steps; k++) {
          const t = k / steps;
          const x = w / 2 + jitter * (1 - t) + (k === 0 || k === steps ? 0 : (rnd() - 0.5) * 30 * unit);
          pts.push(`${x.toFixed(1)},${(t * h).toFixed(1)}`);
        }
        return { w, h, points: pts.join(" "), i };
      });
      return (
        <>
          <Wa as="div"
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{ background: "radial-gradient(circle at 50% 30%, rgba(255,255,200,0.7), rgba(247,208,44,0.25) 60%, transparent)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.8, 0, 0.55, 0] }}
            transition={{ duration: dur * 0.8 * ts, delay: (start + 0.05) * ts, times: [0, 0.12, 0.3, 0.45, 1] }}
          />
          {bolts.map((b) => (
            <Wa as="svg"
              key={b.i}
              aria-hidden
              className="pointer-events-none absolute"
              style={{ left: to.x - b.w / 2, top: 0, width: b.w, height: b.h, overflow: "visible" }}
              viewBox={`0 0 ${b.w} ${b.h}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 1, 0.15, 1, 0] }}
              transition={{ duration: dur * 0.55 * ts, delay: (start + b.i * 0.11) * ts, times: [0, 0.1, 0.35, 0.5, 1] }}
            >
              <polyline points={b.points} fill="none" stroke="#f7d02c" strokeWidth={9 * unit} strokeLinejoin="round" strokeLinecap="round" opacity="0.55" />
              <polyline points={b.points} fill="none" stroke="#fffbe0" strokeWidth={3.5 * unit} strokeLinejoin="round" strokeLinecap="round" />
            </Wa>
          ))}
          <Particles type="electric" at={to} seed={cue.id} timeScale={ts} delayS={start + 0.2} reach={60 * unit} count={8} size={20 * unit} />
        </>
      );
    }

    case "surf": {
      const flip = from.x > to.x; // the user is on the right: the wave runs right to left
      const waveW = size.w * 1.05;
      const waveH = size.h * 0.46;
      return (
        <>
          <Wa as="div"
            aria-hidden
            className="pointer-events-none absolute"
            style={{ left: 0, top: size.h * 0.5, width: waveW, height: waveH }}
            initial={{ opacity: 0, x: flip ? size.w : -waveW }}
            animate={{ x: flip ? [size.w, -waveW] : [-waveW, size.w], opacity: [0, 1, 1, 0] }}
            transition={{ duration: dur * 0.88 * ts, delay: (start + 0.02) * ts, ease: "easeInOut", times: [0, 0.2, 0.8, 1] }}
          >
            {/* the crest is drawn on the right-hand edge, so a wave heading left is the same picture mirrored */}
            <div className="absolute inset-0" style={{ transform: flip ? "scaleX(-1)" : undefined }}>
              <svg viewBox="0 0 400 180" preserveAspectRatio="none" className="h-full w-full" aria-hidden>
                <defs>
                  <linearGradient id={`surf-${cue.id}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#bfe0ff" stopOpacity="0.95" />
                    <stop offset="0.25" stopColor="#6390f0" stopOpacity="0.9" />
                    <stop offset="1" stopColor="#2a4fbf" stopOpacity="0.55" />
                  </linearGradient>
                </defs>
                <path
                  d="M0 180 L0 70 C30 40 60 40 90 62 C120 84 150 84 180 58 C215 28 255 24 290 44 C320 60 345 40 372 12 C382 2 394 6 400 20 L400 180Z"
                  fill={`url(#surf-${cue.id})`}
                />
                <path d="M0 70 C30 40 60 40 90 62 C120 84 150 84 180 58 C215 28 255 24 290 44 C320 60 345 40 372 12 C382 2 394 6 400 20" fill="none" stroke="#ffffff" strokeWidth="5" strokeLinecap="round" opacity="0.9" />
              </svg>
            </div>
          </Wa>
          <Particles type="water" at={to} seed={cue.id} timeScale={ts} delayS={start + dur * 0.5} reach={70 * unit} count={10} size={24 * unit} />
        </>
      );
    }

    case "swordsdance": {
      const r = 46 * unit;
      const sword = (angle: number, key: number) => (
        <span key={key} className="absolute" style={{ left: -10 * unit, top: -30 * unit, width: 20 * unit, height: 60 * unit, transform: `rotate(${angle}deg) translateY(${-r}px)` }}>
          <svg viewBox="0 0 20 60" className="h-full w-full" aria-hidden>
            <path d="M10 1 L14 36 L6 36Z" fill="#e8edf5" stroke="#9aa7bd" strokeWidth="0.8" />
            <path d="M10 1 L10 36" stroke="#ffffff" strokeWidth="1.2" />
            <rect x="2" y="36" width="16" height="3.5" rx="1.2" fill="#c22e28" />
            <rect x="8.2" y="39.5" width="3.6" height="13" fill="#6b3a1c" />
            <circle cx="10" cy="55" r="3" fill="#c22e28" />
          </svg>
        </span>
      );
      return at(
        from,
        <>
          <Ring color="#ff5a4d" px={86 * unit} delay={start} ts={ts} />
          <Ring color="#ffb199" px={86 * unit} delay={start + 0.3} ts={ts} />
          <Wa as="div"
            className="absolute"
            style={{ left: 0, top: 0, width: 0, height: 0 }}
            initial={{ opacity: 0 }}
            animate={{ rotate: [0, 360], scale: [0.4, 1, 1, 0.8], opacity: [0, 1, 1, 0] }}
            transition={{ duration: dur * ts, delay: start * ts, ease: "easeInOut", times: [0, 0.2, 0.8, 1] }}
          >
            {[0, 120, 240].map((a, i) => sword(a, i))}
          </Wa>
        </>,
      );
    }
  }
}
