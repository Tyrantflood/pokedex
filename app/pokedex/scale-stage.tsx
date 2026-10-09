"use client";

import { motion } from "framer-motion";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { compareHeights, computeScale, formatMetres, HUMAN_HEIGHT_DM, renderedSize, rulerStepDm } from "@/lib/compare-scale";
import { measureSpriteBounds, type SpriteBounds } from "@/lib/sprite-bounds";
import type { PokemonSummary } from "@/lib/summary";
import { HUMAN_ASPECT, HumanSilhouette } from "./human-silhouette";

const GAP = 28;
const GAP_NARROW = 10;
const TOP_PAD = 30;
const LABEL_H = 58; // name (up to two lines) + height under each figure
const RULER_W = 44;
const MAX_ZOOM = 12;
const TINY_PX = 26;
const MIN_COLUMN_W = 104; // roughly a label's width: a column is never narrower than this
const MIN_COLUMN_W_NARROW = 72;
const RULER_W_NARROW = 34;
const NARROW_STAGE_PX = 460;
const MIN_STAGE_H = 230;

const imageOf = (p: PokemonSummary) => p.artwork ?? p.sprite;

function useBounds(url: string) {
  const [state, setState] = useState<{ url: string; bounds: SpriteBounds } | null>(null);
  useEffect(() => {
    let live = true;
    measureSpriteBounds(url)
      .then((bounds) => live && setState({ url, bounds }))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [url]);
  return state?.url === url ? state.bounds : null;
}

interface Props {
  a: PokemonSummary;
  b: PokemonSummary;
  colorA: string;
  colorB: string;
}

/**
 * Both Pokémon and a 1.7 m human drawn at one shared scale (pixels per decimetre), from PokéAPI's
 * heights. Each sprite is cropped to its measured visible bounds, so its drawn height is exactly
 * height x scale, not "however tall the padded image happens to be".
 */
export function ScaleStage({ a, b, colorA, colorB }: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  // Width of the stage and the tallest it may grow (about half the window, capped), not its current height.
  const [size, setSize] = useState({ width: 0, maxHeight: 0 });
  const humanRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [zoomT, setZoomT] = useState(0);
  const boundsA = useBounds(imageOf(a));
  const boundsB = useBounds(imageOf(b));

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => {
      const maxHeight = Math.min(460, Math.round(window.innerHeight * (window.innerWidth >= 768 ? 0.56 : 0.46)));
      setSize((prev) => (prev.width === el.clientWidth && prev.maxHeight === maxHeight ? prev : { width: el.clientWidth, maxHeight }));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  const aspectOf = (bounds: SpriteBounds | null) => (bounds ? (bounds.right - bounds.left) / (bounds.bottom - bounds.top) : 1);
  const subjects = [
    { heightDm: a.height, aspect: aspectOf(boundsA) },
    { heightDm: HUMAN_HEIGHT_DM, aspect: HUMAN_ASPECT },
    { heightDm: b.height, aspect: aspectOf(boundsB) },
  ];
  const ready = boundsA !== null && boundsB !== null && size.width > 0;
  const narrow = size.width > 0 && size.width < NARROW_STAGE_PX;
  const gap = narrow ? GAP_NARROW : GAP;
  const minCol = narrow ? MIN_COLUMN_W_NARROW : MIN_COLUMN_W;
  const rulerW = narrow ? RULER_W_NARROW : RULER_W;
  const zoom = Math.pow(MAX_ZOOM, zoomT / 100);
  const fit = ready
    ? computeScale({ subjects, stageWidth: size.width - rulerW, stageHeight: size.maxHeight, gap, topPad: TOP_PAD, bottomPad: LABEL_H, minColumnWidth: minCol })
    : 1;
  const pxPerDm = fit * zoom;
  const sizes = subjects.map((s) => renderedSize(s, pxPerDm));
  const tallestDm = Math.max(a.height, b.height, HUMAN_HEIGHT_DM);

  // The stage is only as tall as its contents need (up to the maximum), so a Bulbasaur next to a
  // human isn't shown under 3 m of empty ruler. Zooming grows it until it reaches that maximum.
  const stageHeight = ready ? Math.round(Math.min(size.maxHeight, Math.max(tallestDm * pxPerDm + TOP_PAD + LABEL_H, MIN_STAGE_H))) : MIN_STAGE_H;
  const visibleDm = Math.max(1, (stageHeight - LABEL_H) / pxPerDm);
  const step = rulerStepDm(visibleDm);
  const ticks: number[] = [];
  if (ready) for (let dm = 0; dm * pxPerDm <= stageHeight - LABEL_H - 4; dm += step) ticks.push(dm);

  // Zooming exists to compare something tiny with the human, so keep the human centred as it grows.
  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    const human = humanRef.current;
    if (!scroller || !human) return;
    scroller.scrollLeft = human.offsetLeft + human.offsetWidth / 2 - scroller.clientWidth / 2;
  }, [zoomT, ready]);

  // Dashed height guides for the two Pokémon; nudge the second label down if they'd collide.
  const guides = [
    { p: a, color: colorA, y: a.height * pxPerDm },
    { p: b, color: colorB, y: b.height * pxPerDm },
  ];
  const tooClose = Math.abs(guides[0].y - guides[1].y) < 16;
  const relation = compareHeights(a.height, b.height);
  const tiny = ready && [sizes[0], sizes[2]].some((s) => s.height < TINY_PX);

  const figure = (key: "a" | "b", p: PokemonSummary, bounds: SpriteBounds | null, s: { width: number; height: number }, color: string, delay: number) => {
    const scale = bounds ? s.height / (bounds.bottom - bounds.top) : 1;
    return (
      <div className="flex flex-col items-center" key={key} style={{ minWidth: minCol }}>
        <motion.div
          data-subject={key}
          data-height-dm={p.height}
          data-height-px={s.height.toFixed(2)}
          data-bounds={bounds ? `${bounds.left},${bounds.top},${bounds.right},${bounds.bottom}${bounds.measured ? "" : ",approx"}` : undefined}
          className="relative shrink-0"
          style={{ width: s.width, height: s.height, transformOrigin: "bottom center" }}
          initial={{ scaleY: 0.3, opacity: 0 }}
          animate={ready ? { scaleY: 1, opacity: 1 } : { scaleY: 0.3, opacity: 0 }}
          transition={{ type: "spring", stiffness: 160, damping: 20, delay }}
        >
          {bounds && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageOf(p)}
              alt=""
              draggable={false}
              crossOrigin="anonymous"
              className={`absolute max-w-none ${p.artwork ? "" : "[image-rendering:pixelated]"}`}
              style={{ width: bounds.naturalWidth * scale, height: bounds.naturalHeight * scale, left: -bounds.left * scale, top: -bounds.top * scale }}
            />
          )}
        </motion.div>
        <div className="mt-2 text-center" style={{ height: LABEL_H - 8 }}>
          <p className="line-clamp-2 break-words text-xs font-semibold capitalize leading-tight sm:text-[13px]" style={{ color, maxWidth: Math.max(minCol, 96) }}>
            {p.name.replace(/-/g, " ")}
          </p>
          <p className="font-mono text-xs text-white/70">{formatMetres(p.height)}</p>
        </div>
      </div>
    );
  };

  return (
    <div>
      <div ref={stageRef} className="relative overflow-hidden rounded-2xl border border-white/10 bg-black/25 transition-[height] duration-300" style={{ height: stageHeight }}>
        {/* Ruler in metres */}
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10" style={{ width: rulerW }} aria-hidden>
          {ticks.map((dm) => (
            <div key={dm} className="absolute left-0 right-0 flex items-center justify-end gap-1 pr-1 font-mono text-[10px] text-white/60" style={{ bottom: LABEL_H + dm * pxPerDm, transform: "translateY(50%)" }}>
              {dm / 10}m
              <span className="block h-px w-2 bg-white/40" />
            </div>
          ))}
        </div>

        <div ref={scrollerRef} className="absolute inset-y-0 right-0 overflow-x-auto overflow-y-hidden [scrollbar-width:thin]" style={{ left: rulerW }}>
          <div className="relative h-full min-w-full" style={{ width: "max-content" }}>
            {/* Ground */}
            <div className="absolute inset-x-0 h-px bg-white/30" style={{ bottom: LABEL_H }} aria-hidden />
            {/* Height guides */}
            {ready &&
              guides.map((g, i) => (
                <div key={g.p.id} className="pointer-events-none absolute inset-x-0 z-[5]" style={{ bottom: LABEL_H + g.y }} aria-hidden>
                  <div className="border-t border-dashed" style={{ borderColor: `${g.color}99` }} />
                  <span className="absolute right-2 whitespace-nowrap rounded bg-black/55 px-1 font-mono text-[10px]" style={{ color: g.color, top: i === 1 && tooClose ? 4 : -16 }}>
                    {g.p.name.replace(/-/g, " ")} {formatMetres(g.p.height)}
                  </span>
                </div>
              ))}

            <div className="absolute bottom-0 left-0 flex w-max min-w-full items-end justify-center px-4" style={{ gap }}>
              {figure("a", a, boundsA, sizes[0], colorA, 0)}
              <div ref={humanRef} className="flex flex-col items-center" style={{ minWidth: minCol }} data-subject="human" data-height-dm={HUMAN_HEIGHT_DM} data-height-px={sizes[1].height.toFixed(2)}>
                <motion.div
                  className="shrink-0"
                  style={{ transformOrigin: "bottom center" }}
                  initial={{ scaleY: 0.3, opacity: 0 }}
                  animate={ready ? { scaleY: 1, opacity: 1 } : { scaleY: 0.3, opacity: 0 }}
                  transition={{ type: "spring", stiffness: 160, damping: 20, delay: 0.08 }}
                >
                  <HumanSilhouette height={sizes[1].height} />
                </motion.div>
                <div className="mt-2 text-center" style={{ height: LABEL_H - 8 }}>
                  <p className="text-sm font-semibold text-white/70">Human</p>
                  <p className="font-mono text-xs text-white/60">{formatMetres(HUMAN_HEIGHT_DM)}</p>
                </div>
              </div>
              {figure("b", b, boundsB, sizes[2], colorB, 0.16)}
            </div>
          </div>
        </div>

        {!ready && (
          <p role="status" className="absolute inset-0 flex items-center justify-center text-sm text-white/60">
            Measuring sprites…
          </p>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <p className="text-white/80">
          <span className="capitalize" style={{ color: colorA }}>{a.name.replace(/-/g, " ")}</span> is {relation} {relation.includes("×") ? "than" : "as"}{" "}
          <span className="capitalize" style={{ color: colorB }}>{b.name.replace(/-/g, " ")}</span>
          {" · "}
          {tallestDm === HUMAN_HEIGHT_DM ? "both are human-sized or smaller" : `tallest is ${formatMetres(tallestDm)}`}
        </p>
        <label className="ml-auto flex items-center gap-2 text-xs text-white/70">
          Zoom
          <input
            type="range"
            min={0}
            max={100}
            value={zoomT}
            onChange={(e) => setZoomT(Number(e.target.value))}
            aria-label="Zoom the comparison"
            className="w-28 accent-teal-300"
          />
          <span className="w-9 font-mono tabular-nums">×{zoom.toFixed(1)}</span>
        </label>
      </div>
      {tiny && <p className="mt-1 text-xs text-amber-200/80">One of them is tiny at this scale; raise the zoom to compare it with the human.</p>}
    </div>
  );
}
