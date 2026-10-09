"use client";

import { motion, useAnimate } from "framer-motion";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

/** One image drawn in the sprite slot. */
export interface ArtImage {
  src: string;
  pixelated: boolean;
}

/** Length of each pulse of the evolution glow, in seconds: every one is shorter than the last. */
const PULSES_S = [0.5, 0.38, 0.29, 0.22, 0.17, 0.13, 0.1];

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const decode = (src: string) => {
  const img = new Image();
  img.src = src;
  return img.decode().catch(() => {});
};

/** After the flash, how long the scan waits before it begins (the caller's scan delay is measured from the swap). */
export const EVOLVE_REVEAL_S = 0.85;

/**
 * The evolution sequence, drawn over the sprite: the old form turns into a white silhouette, pulses
 * faster and faster, a flash covers the swap, and the new form's silhouette is revealed. The scan
 * reveal then plays on its own. Everything animates transform/opacity only (the silhouette is a
 * static filter on an image, not an animated one).
 */
export function EvolveFx({
  from,
  to,
  color,
  onSwap,
  onDone,
}: {
  from: ArtImage;
  to: ArtImage;
  color: string;
  /** Called at the peak of the flash: switch the view to the new Pokémon now. */
  onSwap: () => void;
  onDone: () => void;
}) {
  const [scope, animate] = useAnimate<HTMLDivElement>();
  const [shown, setShown] = useState(from);
  const callbacks = useRef({ onSwap, onDone });
  useEffect(() => {
    callbacks.current = { onSwap, onDone };
  });

  useEffect(() => {
    let alive = true;
    const running: { stop: () => void }[] = [];
    const run = <T extends { stop: () => void }>(controls: T) => {
      running.push(controls);
      return controls;
    };
    const decoded = decode(to.src);

    (async () => {
      await run(animate("[data-e=white]", { opacity: [0, 1] }, { duration: 0.4, ease: "easeOut" }));
      for (const period of PULSES_S) {
        if (!alive) return;
        await run(animate("[data-e=white]", { opacity: [1, 0.4, 1], scale: [1, 1.05, 1] }, { duration: period, ease: "easeInOut" }));
      }
      if (!alive) return;
      await run(animate("[data-e=flash]", { opacity: [0, 1], scale: [0.5, 1.3] }, { duration: 0.2, ease: "easeIn" }));
      await Promise.race([decoded, sleep(1500)]);
      if (!alive) return;
      setShown(to);
      callbacks.current.onSwap();
      await sleep(150);
      if (!alive) return;
      run(animate("[data-e=flash]", { opacity: [1, 0], scale: [1.3, 1.9] }, { duration: 0.5, ease: "easeOut" }));
      await sleep(250);
      if (!alive) return;
      await run(animate("[data-e=white]", { opacity: [1, 0] }, { duration: 0.4 }));
      if (alive) callbacks.current.onDone();
    })();

    return () => {
      alive = false;
      running.forEach((r) => r.stop());
    };
  }, [animate, to]);

  return (
    <div ref={scope} aria-hidden className="pointer-events-none absolute inset-0 z-10">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        data-e="white"
        src={shown.src}
        alt=""
        draggable={false}
        className={`absolute inset-0 h-full w-full object-contain ${shown.pixelated ? "[image-rendering:pixelated]" : ""}`}
        style={{ opacity: 0, filter: `brightness(0) invert(1) drop-shadow(0 0 14px ${color})` }}
      />
      <div
        data-e="flash"
        className="absolute inset-[-30%] rounded-full"
        style={{ opacity: 0, background: `radial-gradient(circle, #fff 0%, #fff 22%, color-mix(in srgb, ${color} 55%, transparent) 45%, transparent 68%)` }}
      />
    </div>
  );
}

const STARS = 14;
const STAR_SHAPE = "polygon(50% 0, 62% 38%, 100% 50%, 62% 62%, 50% 100%, 38% 62%, 0 50%, 38% 38%)";

/** A burst of little four-point stars flying out from the middle of the sprite. Remount to replay. */
export function Sparkles() {
  // Offsets scale with the sprite, which is measured before the first paint.
  const rootRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(0);
  useLayoutEffect(() => setSize(rootRef.current?.offsetWidth ?? 300), []);
  const stars = useMemo(
    () =>
      Array.from({ length: STARS }, (_, i) => {
        const angle = (i / STARS) * Math.PI * 2 + (i % 3) * 0.21;
        const radius = size * (0.3 + (((i * 37) % 10) / 10) * 0.24);
        return {
          x: Math.cos(angle) * radius,
          y: Math.sin(angle) * radius * 0.9,
          s: 10 + ((i * 13) % 5) * 4,
          delay: ((i * 7) % 6) * 0.035,
          spin: (i % 2 ? 1 : -1) * (60 + i * 9),
        };
      }),
    [size],
  );
  return (
    <div ref={rootRef} aria-hidden className="pointer-events-none absolute inset-0 z-10">
      {size > 0 && <motion.div
        className="absolute inset-[8%] rounded-full"
        style={{ background: "radial-gradient(circle, rgba(255,255,255,0.9) 0%, rgba(255,236,160,0.45) 40%, transparent 70%)" }}
        initial={{ opacity: 0, scale: 0.6 }}
        animate={{ opacity: [0, 0.85, 0], scale: [0.6, 1.05, 1.25] }}
        transition={{ duration: 0.7, times: [0, 0.35, 1], ease: "easeOut" }}
      />}
      {size > 0 && stars.map((st, i) => (
        <motion.span
          key={i}
          className="absolute left-1/2 top-1/2"
          style={{ width: st.s, height: st.s, marginLeft: -st.s / 2, marginTop: -st.s / 2, clipPath: STAR_SHAPE, background: "linear-gradient(135deg, #fff, #ffe9a8)", opacity: 0 }}
          animate={{ x: [0, st.x], y: [0, st.y], rotate: [0, st.spin], scale: [0, 1.15, 0], opacity: [0, 1, 0] }}
          transition={{
            delay: st.delay,
            duration: 0.75,
            ease: "easeOut",
            scale: { duration: 0.75, delay: st.delay, times: [0, 0.4, 1] },
            opacity: { duration: 0.75, delay: st.delay, times: [0, 0.3, 1] },
          }}
        />
      ))}
    </div>
  );
}
