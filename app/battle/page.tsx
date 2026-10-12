import type { Metadata } from "next";
import { BattleApp } from "./battle-app";

export const metadata: Metadata = {
  title: "Battle",
  description: "Random-team Pokémon battles against a CPU, right in the browser: National Dex or any single generation.",
};

export default function BattlePage() {
  return <BattleApp />;
}
