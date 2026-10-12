"use client";

import { useEffect, useRef, useState } from "react";
import type { LogEntry } from "@/lib/battle/protocol";

export const TONE: Record<LogEntry["tone"], string> = {
  plain: "text-zinc-300",
  move: "text-white font-semibold",
  good: "text-emerald-300",
  bad: "text-red-300",
  faint: "text-red-200 font-semibold",
  turn: "mt-2 border-t border-white/10 pt-2 text-xs font-bold uppercase tracking-wider text-teal-200/80",
  win: "text-amber-200 font-bold",
};

/** How close to the bottom still counts as "at the bottom", in pixels (sub-pixel scroll positions and the odd margin). */
const AT_BOTTOM_PX = 24;

/**
 * The battle log, behaving like a chat: it follows the newest entry, stops following when you scroll up to read, and then offers a
 * "Jump to latest" button (with how many entries have arrived since). Scrolling back to the bottom, or the button, resumes following.
 */
export function BattleLog({ log }: { log: LogEntry[] }) {
  const scroller = useRef<HTMLDivElement>(null);
  const [following, setFollowing] = useState(true);
  /** The number of entries there were when the player scrolled away. */
  const [seen, setSeen] = useState(0);

  // Follow the newest entry. Only reads state; the scroll listener below is what decides whether we are following.
  useEffect(() => {
    const el = scroller.current;
    if (el && following) el.scrollTop = el.scrollHeight;
  }, [log.length, following]);

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= AT_BOTTOM_PX;
    if (atBottom !== following) {
      setFollowing(atBottom);
      if (!atBottom) setSeen(log.length);
    }
  };

  const jump = () => {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    setFollowing(true);
  };

  const unseen = Math.max(0, log.length - seen);
  return (
    <div className="relative">
      <div
        ref={scroller}
        onScroll={onScroll}
        className="h-48 overflow-y-auto rounded-2xl border border-white/10 bg-zinc-900/60 p-3 text-sm leading-relaxed lg:h-136"
        role="log"
        aria-label="Battle log"
        tabIndex={0}
      >
        {log.map((entry, i) => (
          <p key={i} className={TONE[entry.tone]}>
            {entry.text}
          </p>
        ))}
      </div>
      {!following && (
        <button
          type="button"
          onClick={jump}
          className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full border border-teal-300/60 bg-zinc-950/95 px-3 py-1 text-xs font-semibold text-teal-100 shadow-lg hover:bg-zinc-900 focus-visible:outline-2 focus-visible:outline-teal-300"
        >
          Jump to latest{unseen > 0 ? ` (${unseen} new)` : ""}
        </button>
      )}
    </div>
  );
}

/** The last few log lines for the phone: a small overlay on the field so the player needn't scroll to see what just happened. */
export function LogOverlay({ log }: { log: LogEntry[] }) {
  const recent = log.filter((e) => e.tone !== "turn").slice(-3);
  if (recent.length === 0) return null;
  return (
    <div
      aria-hidden
      data-log-overlay
      className="pointer-events-none absolute inset-x-2 bottom-1.5 z-10 space-y-px rounded-lg bg-black/60 px-2 py-1 sm:inset-x-auto sm:left-2 sm:w-[44%] lg:hidden"
    >
      {recent.map((entry, i) => (
        <p key={log.length - recent.length + i} className={`truncate text-[11px] leading-tight ${TONE[entry.tone].replace(/mt-2 |border-t |border-white\/10 |pt-2 /g, "")} ${i < recent.length - 1 ? "opacity-70" : ""}`}>
          {entry.text}
        </p>
      ))}
    </div>
  );
}
