import type { Metadata } from "next";
import { Suspense } from "react";
import { BattleApp } from "./battle-app";

export const metadata: Metadata = {
  title: "Battle",
  description: "Random-team Pokémon battles against a CPU, right in the browser: National Dex or any single generation.",
};

export default function BattlePage() {
  // The page reads ?room= (a friend battle's link) in the browser, which needs a Suspense boundary while it is prerendered.
  return (
    <Suspense>
      <BattleApp />
    </Suspense>
  );
}
