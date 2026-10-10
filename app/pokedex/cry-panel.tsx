"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CryError, loadCry, playCry, stopCry, type CryPlayback } from "@/lib/cry-audio";

type Status = "idle" | "loading" | "playing" | "error";

/** Samples drawn per frame, starting at a rising zero crossing so the trace holds steady. */
const WINDOW_SAMPLES = 1024;
/** Frames to keep drawing after a cry ends, so the line visibly settles flat. */
const SETTLE_FRAMES = 20;

interface Props {
  /** URL of the cry (Ogg), or null if the Pokémon has none. */
  url: string | null;
  /** Trace colour: the Pokémon's primary type colour. */
  color: string;
  name: string;
  reduceMotion: boolean;
}

/** A cry button with a live, glowing oscilloscope trace of the audio actually being played. */
export function CryPanel({ url, color, name, reduceMotion }: Props) {
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const raf = useRef(0);
  const token = useRef(0); // invalidates in-flight plays when another starts or we unmount
  const colorRef = useRef(color);
  const reduceRef = useRef(reduceMotion);
  const drawIdleRef = useRef<() => void>(() => {});

  useEffect(() => {
    colorRef.current = color;
    reduceRef.current = reduceMotion;
    drawIdleRef.current();
  }, [color, reduceMotion]);

  // Keep the canvas crisp at any size and pixel ratio; redraw the idle baseline when it changes.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const drawIdle = () => {
      const g = canvas.getContext("2d");
      if (!g) return;
      g.clearRect(0, 0, canvas.width, canvas.height);
      const y = canvas.height / 2;
      g.strokeStyle = `${colorRef.current}66`;
      g.lineWidth = Math.max(1, canvas.height / 90);
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(canvas.width, y);
      g.stroke();
    };
    drawIdleRef.current = drawIdle;
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(canvas.clientWidth * dpr);
      canvas.height = Math.round(canvas.clientHeight * dpr);
      if (!raf.current) drawIdle();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    return () => observer.disconnect();
  }, []);

  // Warm the cry (fetch + decode) so pressing play is instant. Errors surface on press instead.
  useEffect(() => {
    if (url) loadCry(url).catch(() => {});
  }, [url]);

  const stopLoop = useCallback(() => {
    cancelAnimationFrame(raf.current);
    raf.current = 0;
  }, []);

  // Stop sound and drawing when leaving (or when the Pokémon changes).
  useEffect(
    () => () => {
      token.current++;
      stopCry();
      stopLoop();
    },
    [stopLoop],
  );

  const startLoop = useCallback(
    (playback: CryPlayback) => {
      const canvas = canvasRef.current;
      const g = canvas?.getContext("2d");
      if (!canvas || !g) return;
      const data = new Float32Array(playback.analyser.fftSize);
      let endedFrames = -1; // -1 while playing; counts up once it has ended
      playback.ended.then(() => {
        endedFrames = 0;
      });

      const frame = () => {
        raf.current = requestAnimationFrame(frame);
        const { width, height } = canvas;
        const mid = height / 2;
        const amp = height * 0.42;
        const lineColor = colorRef.current;

        // Real samples straight from the analyser: no synthesis anywhere in this file.
        playback.analyser.getFloatTimeDomainData(data);

        // Phosphor persistence: fade the previous trace instead of clearing it.
        g.globalCompositeOperation = "destination-out";
        g.fillStyle = reduceRef.current ? "rgba(0,0,0,1)" : "rgba(0,0,0,0.3)";
        g.fillRect(0, 0, width, height);
        g.globalCompositeOperation = "source-over";

        let start = 0;
        for (let i = 1; i < data.length - WINDOW_SAMPLES; i++) {
          if (data[i - 1] < 0 && data[i] >= 0) {
            start = i;
            break;
          }
        }

        const trace = () => {
          g.beginPath();
          for (let i = 0; i < WINDOW_SAMPLES; i++) {
            const x = (i / (WINDOW_SAMPLES - 1)) * width;
            const y = mid - Math.max(-1, Math.min(1, data[start + i])) * amp;
            if (i === 0) g.moveTo(x, y);
            else g.lineTo(x, y);
          }
          g.stroke();
        };
        const px = Math.max(1, height / 90);
        g.lineJoin = "round";
        // Wide soft halo, bright core, white-hot centre.
        g.shadowColor = lineColor;
        g.shadowBlur = px * 10;
        g.strokeStyle = `${lineColor}55`;
        g.lineWidth = px * 5;
        trace();
        g.strokeStyle = lineColor;
        g.lineWidth = px * 2;
        trace();
        g.shadowBlur = 0;
        g.strokeStyle = "rgba(255,255,255,0.85)";
        g.lineWidth = px * 0.8;
        trace();

        if (endedFrames >= 0 && ++endedFrames > SETTLE_FRAMES) {
          stopLoop();
          drawIdleRef.current();
        }
      };
      stopLoop();
      frame();
    },
    [stopLoop],
  );

  const press = async () => {
    if (!url) return;
    const mine = ++token.current;
    stopLoop();
    setStatus("loading");
    try {
      const playback = await playCry(url);
      if (token.current !== mine) {
        playback.stop();
        return;
      }
      setStatus("playing");
      startLoop(playback);
      playback.ended.then(() => {
        if (token.current === mine) setStatus("idle");
      });
    } catch (error) {
      if (token.current !== mine) return;
      setMessage(error instanceof CryError ? error.message : "Couldn't play the cry.");
      setStatus("error");
      drawIdleRef.current();
    }
  };

  const label = !url
    ? "No cry on record"
    : status === "loading"
      ? "Loading…"
      : status === "playing"
        ? "Playing"
        : status === "error"
          ? message
          : "Play cry";

  return (
    <div className="rounded-xl border border-white/15 bg-black/40 p-3">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={press}
          disabled={!url}
          aria-label={url ? `Play ${name} cry` : `${name} has no cry`}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-black motion-safe:transition-transform motion-safe:enabled:hover:scale-105 enabled:active:scale-95 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300"
          style={{ background: color, boxShadow: `0 0 14px ${color}88` }}
        >
          {status === "playing" ? (
            <span className="flex items-end gap-0.5" aria-hidden>
              {[0, 1, 2].map((i) => (
                <span key={i} className="w-1 motion-safe:animate-pulse rounded-sm bg-black" style={{ height: 8 + ((i * 5) % 8), animationDelay: `${i * 120}ms` }} />
              ))}
            </span>
          ) : (
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
              <path d="M8 5.5v13l11-6.5z" />
            </svg>
          )}
        </button>
        <p
          aria-live="polite"
          className={`min-w-0 truncate font-mono text-xs uppercase tracking-widest ${status === "error" ? "text-red-300" : "text-white/70"}`}
        >
          {label}
        </p>
      </div>
      {/* Graticule behind a transparent canvas, like a scope screen. */}
      <div
        className="mt-3 overflow-hidden rounded-lg border border-white/10"
        style={{
          background:
            "linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px) 0 0 / 100% 25%, linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px) 0 0 / 10% 100%, rgba(0,0,0,0.45)",
        }}
      >
        <canvas ref={canvasRef} aria-hidden className="block h-24 w-full" />
      </div>
    </div>
  );
}
