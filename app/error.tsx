"use client";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8">
      <h1 className="mb-4 text-3xl font-bold tracking-tight">Pokédex</h1>
      <div role="alert" className="rounded-lg border border-red-300 bg-red-50 p-4 text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-100">
        <p className="font-medium">Couldn&apos;t load Pokémon data from PokéAPI.</p>
        {error.digest && <p className="mt-1 text-xs opacity-70">Error ID: {error.digest}</p>}
        <button onClick={reset} className="mt-3 rounded bg-red-900 px-3 py-1.5 text-sm text-white hover:bg-red-800">
          Try again
        </button>
      </div>
    </main>
  );
}
