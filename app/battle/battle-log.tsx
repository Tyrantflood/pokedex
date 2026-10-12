"use client";

import { useEffect, useRef } from "react";
import type { LogEntry } from "@/lib/battle/protocol";

const TONE: Record<LogEntry["tone"], string> = {
  plain: "text-zinc-300",
  move: "text-white font-semibold",
  good: "text-emerald-300",
  bad: "text-red-300",
  faint: "text-red-200 font-semibold",
  turn: "mt-2 border-t border-white/10 pt-2 text-xs font-bold uppercase tracking-wider text-teal-200/80",
  win: "text-amber-200 font-bold",
};

export function BattleLog({ log }: { log: LogEntry[] }) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Keep the newest line in view without scrolling the whole page.
    const el = end.current?.parentElement;
    if (el) el.scrollTop = el.scrollHeight;
  }, [log.length]);
  return (
    <div className="h-48 overflow-y-auto rounded-2xl border border-white/10 bg-zinc-900/60 p-3 text-sm leading-relaxed lg:h-full lg:min-h-0" role="log" aria-label="Battle log">
      {log.map((entry, i) => (
        <p key={i} className={TONE[entry.tone]}>
          {entry.text}
        </p>
      ))}
      <div ref={end} />
    </div>
  );
}
