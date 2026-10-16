"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { activeRoomPath, leavingCostsForfeit } from "@/lib/battle/active-room";
import { FORFEIT_AFTER_MS } from "@/lib/battle/room-protocol";
import { useActiveRoom } from "./battle/use-active-room";

/**
 * A card in the corner of every page except the battle itself, while this browser is in a friend battle: the way back. A battle under way says
 * what being away costs.
 */
export function ReturnToBattle() {
  const { active } = useActiveRoom();
  const pathname = usePathname();
  const inThatRoom = useSearchParams().get("room") === active?.code && pathname === "/battle";
  if (!active || inThatRoom) return null;
  const live = leavingCostsForfeit(active);
  return (
    <aside
      aria-label={live ? "Battle in progress" : "Battle room open"}
      className="fixed inset-x-3 bottom-24 z-[34] flex items-center gap-3 rounded-2xl border border-teal-300/40 bg-[#0a0e13]/95 p-3 shadow-[0_10px_40px_rgba(0,0,0,0.55)] backdrop-blur sm:inset-x-auto sm:right-4 sm:w-80"
    >
      <div className="min-w-0 flex-1 text-xs text-zinc-300">
        <p className="font-semibold text-white">{live ? "Your battle is still going" : "You have a battle room open"}</p>
        <p className="mt-0.5 text-zinc-400">{live ? `Away for ${FORFEIT_AFTER_MS / 1000} seconds and you forfeit.` : "Your friend's link is still waiting."}</p>
      </div>
      <Link
        href={activeRoomPath(active)}
        className="shrink-0 rounded-xl bg-teal-300 px-3 py-2 text-xs font-bold text-slate-950 hover:bg-teal-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-300"
      >
        Return to battle
      </Link>
    </aside>
  );
}
