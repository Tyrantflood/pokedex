"use client";

import { useCallback, useSyncExternalStore } from "react";

// localStorage as an external store: reads are "" on the server and during hydration (so the first client render matches the
// server), then the saved value. If storage is blocked, values live in memory for the session instead of throwing.
const memory = new Map<string, string>();
const listeners = new Set<() => void>();

function read(key: string): string {
  try {
    const saved = localStorage.getItem(key);
    if (saved !== null) return saved;
  } catch {
    /* blocked: fall back to memory */
  }
  return memory.get(key) ?? "";
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener("storage", onChange); // another tab
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function useStored(key: string): [string, (value: string) => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => read(key),
    () => "",
  );
  const set = useCallback(
    (next: string) => {
      memory.set(key, next);
      try {
        localStorage.setItem(key, next);
      } catch {
        /* blocked or full: kept in memory for this session only */
      }
      listeners.forEach((listener) => listener());
    },
    [key],
  );
  return [value, set];
}
