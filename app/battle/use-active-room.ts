"use client";

import { useCallback, useMemo } from "react";
import { ACTIVE_ROOM_KEY, parseActiveRoom, serializeActiveRoom, type ActiveRoom } from "@/lib/battle/active-room";
import { useStored } from "./use-stored";

/**
 * The friend battle this browser is in (see lib/battle/active-room.ts), kept in step across tabs and with the page that writes it. `null` on the
 * server and while hydrating, then whatever is saved.
 */
export function useActiveRoom(): { active: ActiveRoom | null; save: (room: ActiveRoom) => void; clear: () => void } {
  const [raw, setRaw] = useStored(ACTIVE_ROOM_KEY);
  // The saved time is compared with the clock once per change of the saved value, not on every render.
  // eslint-disable-next-line react-hooks/purity -- a saved room older than the server keeps rooms is dropped, which depends on now
  const active = useMemo(() => parseActiveRoom(raw, Date.now()), [raw]);
  // Stable functions: effects that save and clear depend on them.
  const save = useCallback((room: ActiveRoom) => setRaw(serializeActiveRoom(room)), [setRaw]);
  const clear = useCallback(() => setRaw(""), [setRaw]);
  return { active, save, clear };
}
