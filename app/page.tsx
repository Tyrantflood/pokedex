import { Suspense } from "react";
import { getAllPokemon } from "@/lib/pokeapi";
import { toSummary } from "@/lib/summary";
import { BootIntro } from "./boot-intro";
import { PokedexBrowser } from "./pokedex/pokedex-browser";

export default function Home() {
  return (
    <BootIntro>
      <main className="mx-auto w-full max-w-6xl px-4">
        <Suspense fallback={<GridSkeleton />}>
          <PokedexData />
        </Suspense>
      </main>
    </BootIntro>
  );
}

async function PokedexData() {
  const pokemon = await getAllPokemon();
  // Send the browser only what cards and filters need, not full stats/abilities/cries.
  return <PokedexBrowser pokemon={pokemon.map(toSummary)} />;
}

function GridSkeleton() {
  return (
    <div role="status" aria-label="Loading Pokémon" className="pt-4">
      <h1 className="mb-3 text-3xl font-bold tracking-tight">Pokédex</h1>
      <p className="mb-4 text-sm text-zinc-400">
        Loading Pokémon… the first load fetches ~1,350 entries and can take a minute.
      </p>
      <div className="grid animate-pulse grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {Array.from({ length: 24 }, (_, i) => (
          <div key={i} className="h-[248px] rounded-2xl bg-zinc-800/70" />
        ))}
      </div>
    </div>
  );
}
