import type { Metadata } from "next";
import { BattleApp } from "./battle-app";

// A private area: kept out of search results (and, by design, not linked from the Pokédex).
export const metadata: Metadata = {
  title: "Battle",
  robots: { index: false, follow: false },
};

export default function BattlePage() {
  return <BattleApp />;
}
