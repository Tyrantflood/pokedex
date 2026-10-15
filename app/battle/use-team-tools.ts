"use client";

import { useEffect, useMemo, useState } from "react";
import type { FormatTools } from "@/lib/battle/team-check";

type CheckModule = typeof import("@/lib/battle/team-check");

// One download of the simulator-backed module per page, shared by everything that asks (the first call starts it).
let loading: Promise<CheckModule> | null = null;
const load = () => (loading ??= import("@/lib/battle/team-check").catch((error) => {
  loading = null; // allow a retry
  throw error;
}));

export interface TeamTools {
  /** The simulator-backed helpers (`validateSets`, `legalMoves`, ...), once downloaded. */
  check: CheckModule | null;
  /** The dex and validator for the format asked for, once the helpers are there. */
  tools: FormatTools | null;
  error: string | null;
}

/**
 * Loads the simulator (about 1.2 MB gzip, only on the pages that build or validate teams) and the format's rules. `formatId` is the
 * simulator's own id, e.g. "gen9ou@@@!Team Preview".
 */
export function useTeamTools(formatId: string | null): TeamTools {
  const [check, setCheck] = useState<CheckModule | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    load().then(
      (module) => alive && setCheck(module),
      (e) => alive && setError(e instanceof Error ? e.message : "The team tools failed to load."),
    );
    return () => {
      alive = false;
    };
  }, []);
  const tools = useMemo(() => {
    if (!check || !formatId) return null;
    try {
      return check.toolsFor(formatId);
    } catch {
      return null;
    }
  }, [check, formatId]);
  return { check, tools, error };
}
