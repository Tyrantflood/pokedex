"use client";

import { activeRoomPath } from "@/lib/battle/active-room";
import { useActiveRoom } from "./battle/use-active-room";
import { ScannerLink } from "./scanner-link";

/** The header's Battle button: the lobby, or straight back into the friend battle this browser is in. */
export function BattleLink() {
  const { active } = useActiveRoom();
  return active ? <ScannerLink href={activeRoomPath(active)}>Return to battle</ScannerLink> : <ScannerLink href="/battle">Battle</ScannerLink>;
}
