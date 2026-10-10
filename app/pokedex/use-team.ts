"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { emptyTeam, parseTeam, serializeTeam, TEAM_STORAGE_KEY, type Team } from "@/lib/team";

/**
 * The team, saved in this browser (localStorage). It starts empty (so the server render and the first client render agree),
 * loads the saved one right after mount, then saves every change. A second tab stays in step through the `storage` event.
 * Storage that is blocked or full is not an error: the team just isn't remembered.
 */
export function useTeam(isKnown: (pokemonId: number) => boolean) {
  const [team, setTeamState] = useState<Team>(emptyTeam);
  const [loaded, setLoaded] = useState(false);
  const knownRef = useRef(isKnown);
  useEffect(() => {
    knownRef.current = isKnown;
  });

  useEffect(() => {
    const read = () => {
      try {
        const saved = localStorage.getItem(TEAM_STORAGE_KEY);
        return saved ? parseTeam(JSON.parse(saved), (id) => knownRef.current(id)) : emptyTeam();
      } catch {
        return emptyTeam();
      }
    };
    setTeamState(read());
    setLoaded(true);

    const onStorage = (event: StorageEvent) => {
      if (event.key === TEAM_STORAGE_KEY) setTeamState(read());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setTeam = useCallback((next: Team) => {
    setTeamState(next);
    try {
      localStorage.setItem(TEAM_STORAGE_KEY, serializeTeam(next));
    } catch {
      /* blocked or full: the team just isn't remembered */
    }
  }, []);

  return { team, setTeam, loaded };
}
