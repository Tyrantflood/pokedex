"use client";

import { useEffect, useState } from "react";
import { misspell } from "@/lib/misspell";

interface Props {
  text: string;
  /** Ghost theme: flickers, and now and then misspells itself for a moment. */
  ghost: boolean;
}

/**
 * The Pokédex entry. Only ever used for the flavour text: the name and the stats are rendered
 * elsewhere and are never touched by the ghost effects.
 */
export function FlavorText({ text, ghost }: Props) {
  const [glitched, setGlitched] = useState<string | null>(null);

  useEffect(() => {
    if (!ghost) return;
    let alive = true;
    let timer = 0;
    const later = (min: number, max: number, fn: () => void) => {
      timer = window.setTimeout(() => alive && fn(), min + Math.random() * (max - min));
    };
    const glitch = () => {
      setGlitched(misspell(text));
      // Visible for a moment, then it corrects itself; sometimes it twitches a second time.
      later(140, 260, () => {
        setGlitched(null);
        if (Math.random() < 0.3) later(110, 200, () => { setGlitched(misspell(text)); later(100, 180, () => { setGlitched(null); later(4000, 9000, glitch); }); });
        else later(4000, 9000, glitch);
      });
    };
    later(2500, 5000, glitch);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [text, ghost]);

  return (
    <p className={`text-sm italic leading-relaxed text-white/85 ${ghost ? "fx-flick" : ""}`} style={ghost ? { ["--fd" as string]: "7.3s", ["--fdl" as string]: "-2s" } : undefined}>
      {/* Screen readers always get the real text; the glitched copy is purely visual. */}
      <span className="sr-only">{text}</span>
      <span aria-hidden>{glitched ?? text}</span>
    </p>
  );
}
