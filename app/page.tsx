import { Suspense } from "react";
import { getAllPokemon } from "@/lib/pokeapi";
import { spriteUrl } from "@/lib/sprites";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8">
      <h1 className="mb-6 text-3xl font-bold tracking-tight">Pokédex</h1>
      <Suspense fallback={<GridSkeleton />}>
        <PokemonGrid />
      </Suspense>
    </main>
  );
}

async function PokemonGrid() {
  const pokemon = await getAllPokemon();
  return (
    <>
      <p className="mb-4 text-sm text-zinc-500">{pokemon.length} Pokémon and forms</p>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {pokemon.map((p) => (
          <li key={p.id} className="rounded-lg border border-zinc-200 p-3 text-center dark:border-zinc-800">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={spriteUrl(p)} alt={p.name} loading="lazy" width={96} height={96} className="mx-auto h-24 w-24 [image-rendering:pixelated]" />
            <p className="text-xs text-zinc-500">#{String(p.number).padStart(4, "0")}</p>
            <p className="truncate text-sm font-medium capitalize">{p.name.replace(/-/g, " ")}</p>
            <p className="text-xs capitalize text-zinc-500">{p.types.join(" / ")}</p>
          </li>
        ))}
      </ul>
    </>
  );
}

function GridSkeleton() {
  return (
    <div role="status" aria-label="Loading Pokémon">
      <p className="mb-4 text-sm text-zinc-500">Loading Pokémon… the first load fetches ~1,350 entries and can take a minute.</p>
      <div className="grid animate-pulse grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {Array.from({ length: 24 }, (_, i) => (
          <div key={i} className="h-40 rounded-lg bg-zinc-200 dark:bg-zinc-800" />
        ))}
      </div>
    </div>
  );
}
