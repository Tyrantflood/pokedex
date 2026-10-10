# Pokédex

A single-page Pokédex built with Next.js (App Router), TypeScript, Tailwind v4 and Framer Motion, styled as a retro "DEX-LINK field scanner".
Every Pokémon and alternate form from [PokéAPI](https://pokeapi.co), with:

- a virtualised card grid with search and type/generation filters;
- a full-screen detail view: stats, abilities, evolution chain, shiny and animated sprites, cries with a live oscilloscope, type
  matchups, where to find it in each game, per-type background themes;
- side-by-side comparison at true scale, with a stat radar and type matchups both ways;
- a six-slot team builder (drag a card in, or use the card's "Add to team" button) that shows the team's combined weaknesses and
  resistances, flags what the whole team is weak to and suggests who would cover the gaps. The team is saved in the browser.

Everything respects `prefers-reduced-motion`, and the layout works from 320 px phones up.

## Run it

```bash
npm ci
npm run dev      # development
npm run build    # production build (also refreshes the location-name table when it is over 30 days old)
npm run start    # serve the production build; `npx next start -H 0.0.0.0` to reach it from a phone on the same Wi-Fi
npm test         # unit tests: no network needed
```

The first build fetches all ~1,350 Pokémon from PokéAPI (cached on disk in `.cache/` for 7 days).

## Deploying

Set `NEXT_PUBLIC_SITE_URL` to the site's public URL, or link previews (Open Graph image) will point at localhost.

## Notes for working on it

`CLAUDE.md` records how the project is laid out, the decisions that are easy to get wrong and why, how things were verified, and the
gotchas. Read it before changing anything non-trivial. `AGENTS.md` notes that this is a newer Next.js than most documentation covers.
