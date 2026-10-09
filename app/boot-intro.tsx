"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";

export const BOOT_KEY = "pokedex:booted";
const DURATION_MS = 3600;

const LINES = [
  { text: "DEX-LINK OS 0.9", at: 1.0 },
  { text: "> SENSOR ARRAY ........ OK", at: 1.5 },
  { text: "> SPECIES INDEX ....... OK", at: 2.0 },
  { text: "> UPLINK .............. OK", at: 2.5 },
];

const subscribe = () => () => {};
// Only the first visit in a session (see the inline script in layout.tsx) sets data-boot="play".
// The server snapshot is true so server and client markup match; CSS hides the
// overlay until the script has set the attribute.
const getPlaying = () => document.documentElement.dataset.boot === "play";
const getServerPlaying = () => true;

export function BootIntro({ children }: { children: ReactNode }) {
  const playing = useSyncExternalStore(subscribe, getPlaying, getServerPlaying);
  const [done, setDone] = useState(false);
  const active = playing && !done;

  const finish = useCallback(() => {
    delete document.documentElement.dataset.boot;
    setDone(true);
  }, []);

  useEffect(() => {
    if (!playing) return;
    try {
      sessionStorage.setItem(BOOT_KEY, "1");
    } catch {}
    const timer = setTimeout(finish, DURATION_MS);
    const onKey = () => finish();
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("keydown", onKey);
    };
  }, [playing, finish]);

  return (
    <>
      <div data-boot-content>{children}</div>
      <AnimatePresence>{active && <BootScreen key="boot" onSkip={finish} />}</AnimatePresence>
    </>
  );
}

function BootScreen({ onSkip }: { onSkip: () => void }) {
  return (
    <motion.div
      role="dialog"
      aria-label="Starting up"
      className="boot-overlay fixed inset-0 z-50 items-center justify-center bg-[#05080a] p-4"
      onClick={onSkip}
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.5 } }}
    >
      {/* Device body */}
      <div className="w-full max-w-md rounded-[28px] border border-slate-600/60 bg-gradient-to-b from-slate-700 to-slate-900 p-4 shadow-[0_0_60px_rgba(45,212,191,0.12),inset_0_1px_0_rgba(255,255,255,0.15)]">
        {/* Top strip: lens, LEDs, speaker slots */}
        <div className="mb-3 flex items-center gap-3 px-1">
          <motion.div
            className="h-6 w-6 rounded-full border-2 border-slate-950 bg-cyan-300"
            animate={{ boxShadow: ["0 0 4px #22d3ee", "0 0 16px #22d3ee", "0 0 4px #22d3ee"] }}
            transition={{ duration: 1.2, repeat: Infinity }}
          />
          <span className="h-2 w-2 rounded-full bg-amber-400" />
          <span className="h-2 w-2 rounded-full bg-emerald-400" />
          <div className="ml-auto flex gap-1">
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className="h-4 w-1 rounded-full bg-slate-950/70" />
            ))}
          </div>
        </div>

        {/* Screen: CRT-style power-on, then flicker */}
        <motion.div
          className="relative aspect-[4/3] origin-center overflow-hidden rounded-lg border-4 border-slate-950 bg-[#031412] font-mono text-xs text-teal-200 sm:text-sm"
          initial={{ opacity: 0, scaleY: 0.02 }}
          animate={{
            opacity: [0, 1, 0.25, 1, 0.5, 1, 0.8, 1],
            scaleY: [0.02, 0.02, 1, 1, 1, 1, 1, 1],
            filter: [
              "brightness(2)",
              "brightness(2)",
              "brightness(1.6)",
              "brightness(1)",
              "brightness(1.4)",
              "brightness(1)",
              "brightness(1.2)",
              "brightness(1)",
            ],
          }}
          transition={{ duration: 0.9, ease: "easeOut" }}
        >
          <div className="relative z-10 flex h-full flex-col p-4 [text-shadow:0_0_6px_rgba(94,234,212,0.7)]">
            <div className="mb-3 flex items-center gap-3">
              {/* Reticle mark */}
              <svg
                viewBox="0 0 40 40"
                className="h-10 w-10 shrink-0"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden
              >
                <circle cx="20" cy="20" r="14" />
                <circle cx="20" cy="20" r="5" />
                <path d="M20 2v8M20 30v8M2 20h8M30 20h8" />
              </svg>
              <div>
                <p className="text-base font-bold tracking-widest sm:text-lg">DEX-LINK</p>
                <p className="text-[10px] opacity-70">FIELD SCANNER · MK I</p>
              </div>
            </div>

            <div className="space-y-1">
              {LINES.map((l) => (
                <motion.p
                  key={l.text}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: l.at, duration: 0.05 }}
                >
                  {l.text}
                </motion.p>
              ))}
            </div>

            <div className="mt-auto">
              <motion.p
                className="mb-1 font-bold tracking-widest"
                initial={{ opacity: 0 }}
                animate={{ opacity: [0, 1, 0.4, 1] }}
                transition={{ delay: 3.0, duration: 0.4 }}
              >
                READY
              </motion.p>
              <div className="h-2 w-full border border-teal-300/60 p-px">
                <motion.div
                  className="h-full origin-left bg-teal-300"
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ delay: 1.0, duration: 2.0, ease: "linear" }}
                />
              </div>
            </div>
          </div>

          {/* Scanlines, vignette and a slow sweep */}
          <div className="boot-scanlines pointer-events-none absolute inset-0 z-20" />
          <div className="pointer-events-none absolute inset-0 z-20 shadow-[inset_0_0_50px_rgba(0,0,0,0.75)]" />
          <motion.div
            className="pointer-events-none absolute inset-x-0 z-20 h-16 bg-gradient-to-b from-transparent via-teal-200/10 to-transparent"
            initial={{ top: "-30%" }}
            animate={{ top: "110%" }}
            transition={{ duration: 1.6, repeat: Infinity, ease: "linear" }}
          />
        </motion.div>

        {/* Controls */}
        <div className="mt-4 flex items-center justify-between px-1">
          <div className="flex gap-2">
            <span className="h-5 w-5 rounded-full bg-slate-950/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]" />
            <span className="h-5 w-5 rounded-full bg-slate-950/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]" />
          </div>
          <button
            type="button"
            autoFocus
            onClick={(e) => {
              e.stopPropagation();
              onSkip();
            }}
            className="rounded-full bg-slate-950/80 px-4 py-1.5 font-mono text-xs tracking-widest text-teal-200 outline-none hover:bg-slate-950 focus-visible:ring-2 focus-visible:ring-teal-300"
          >
            SKIP ›
          </button>
        </div>
      </div>
    </motion.div>
  );
}
