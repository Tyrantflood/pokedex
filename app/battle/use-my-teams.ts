"use client";

import { useCallback, useMemo } from "react";
import { parseStore, serializeStore, TEAMS_KEY, type TeamStore } from "@/lib/battle/my-teams";
import { useStored } from "./use-stored";

/** The teams saved in this browser (localStorage "battle:teams"), kept in step across tabs. Empty on the server and during hydration. */
export function useMyTeams(): { store: TeamStore; save: (next: TeamStore) => void; loaded: boolean } {
  const [raw, setRaw] = useStored(TEAMS_KEY);
  const store = useMemo(() => parseStore(raw), [raw]);
  const save = useCallback((next: TeamStore) => setRaw(serializeStore(next)), [setRaw]);
  return { store, save, loaded: true };
}
