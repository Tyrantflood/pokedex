"use client";

import { useEffect } from "react";

/** Night mode runs from midnight until this hour (local time). */
export const NIGHT_END_HOUR = 6;

export const isNight = (d: Date) => d.getHours() < NIGHT_END_HOUR;

/** Milliseconds until local time next crosses midnight or NIGHT_END_HOUR. */
export function msUntilNextChange(now: Date): number {
  const next = new Date(now);
  if (now.getHours() < NIGHT_END_HOUR) {
    next.setHours(NIGHT_END_HOUR, 0, 0, 0);
  } else {
    next.setDate(next.getDate() + 1);
    next.setHours(0, 0, 0, 0);
  }
  return next.getTime() - now.getTime();
}

// Re-check at least this often, in case timers were throttled or the clock/timezone changed.
const MAX_WAIT_MS = 60 * 60 * 1000;

/**
 * Keeps <html data-night> in step with the local clock. The initial value is set before first
 * paint by an inline script in layout.tsx (so there is no flash); this takes over from there and
 * flips the attribute exactly when midnight (or the end of night mode) passes while the page is
 * open. The fade itself is a CSS transition on the .night-veil layer (globals.css).
 */
export function NightMode() {
  useEffect(() => {
    const html = document.documentElement;
    let timer = 0;

    const update = () => {
      clearTimeout(timer);
      const now = new Date();
      html.dataset.night = isNight(now) ? "1" : "0";
      timer = window.setTimeout(update, Math.min(msUntilNextChange(now) + 250, MAX_WAIT_MS));
    };
    const onVisible = () => {
      if (!document.hidden) update();
    };

    update();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return null;
}
