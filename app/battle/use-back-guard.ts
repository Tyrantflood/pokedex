"use client";

import { useEffect, useRef } from "react";

/**
 * While `live`, the browser's Back button (and Android's back gesture) asks before leaving the battle room instead of just going. It works with a
 * spare history entry for the same URL put on top when the room opens: Back lands on the real entry, `onBack` decides, and if the answer is to
 * stay the spare entry goes back on top. When the battle is not live (waiting, or over) Back simply goes, in one press, as if nothing had been
 * added. `confirmLeave` returns true to leave. Closing the tab is not guarded.
 */
export function useBackGuard(roomCode: string | null, live: boolean, confirmLeave: () => boolean) {
  const liveRef = useRef(live);
  const confirmRef = useRef(confirmLeave);
  useEffect(() => {
    liveRef.current = live;
    confirmRef.current = confirmLeave;
  });

  useEffect(() => {
    if (!roomCode) return;
    let leaving = false;
    // One spare entry (not two when React runs the effect twice in development, or when coming back to a room that still has one).
    if (!(window.history.state as { battleGuard?: boolean } | null)?.battleGuard) window.history.pushState({ battleGuard: true }, "", window.location.href);
    const onPopState = () => {
      if (leaving) return;
      if (liveRef.current && !confirmRef.current()) {
        window.history.pushState({ battleGuard: true }, "", window.location.href); // stay: the spare entry goes back on top
        return;
      }
      leaving = true;
      window.history.back(); // the real Back, past the entry we landed on
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [roomCode]);
}
