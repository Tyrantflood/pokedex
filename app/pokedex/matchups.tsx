import { matchups, multiplierLabel, multiplierVerdict } from "@/lib/type-chart";
import type { PokemonSummary } from "@/lib/summary";
import { TYPE_COLORS } from "@/lib/type-colors";

const pretty = (s: string) => s.replace(/-/g, " ");

function badgeStyle(m: number): { background: string; color: string } {
  if (m === 0) return { background: "#0b0b0e", color: "#9ca3af" };
  if (m >= 2) return { background: "#16a34a", color: "#04210f" };
  if (m < 1) return { background: "#dc2626", color: "#fff" };
  return { background: "rgba(255,255,255,0.18)", color: "#fff" };
}

function Direction({ from, to, fromColor }: { from: PokemonSummary; to: PokemonSummary; fromColor: string }) {
  const results = matchups(from.types, to.types);
  const best = Math.max(...results.map((r) => r.multiplier));
  return (
    <li className="rounded-xl border border-white/10 bg-black/25 p-3">
      <p className="text-sm text-white/85">
        <span className="font-semibold capitalize" style={{ color: fromColor }}>
          {pretty(from.name)}
        </span>{" "}
        attacking <span className="capitalize">{pretty(to.name)}</span>
        <span className="text-white/50">
          {" "}
          ({to.types.join(" / ")})
        </span>
      </p>
      <ul className="mt-2 flex flex-wrap gap-2">
        {results.map((r) => (
          <li
            key={r.attacker}
            className="flex items-center gap-2 rounded-full border border-white/10 py-1 pl-1 pr-2 text-xs"
            title={r.breakdown.map((b) => `${r.attacker} vs ${b.defender}: ${multiplierLabel(b.multiplier)}`).join(", ")}
          >
            <span className="rounded-full px-2 py-0.5 font-semibold uppercase tracking-wide text-black/80" style={{ background: TYPE_COLORS[r.attacker] }}>
              {r.attacker}
            </span>
            <span className="rounded-md px-1.5 py-0.5 font-mono font-bold" style={badgeStyle(r.multiplier)}>
              {multiplierLabel(r.multiplier)}
            </span>
            <span className="text-white/70">{multiplierVerdict(r.multiplier)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-white/55">Best of its types: {multiplierLabel(best)}</p>
    </li>
  );
}

/** Type matchups both ways: each Pokémon's own types (its STAB moves) against the other. */
export function Matchups({ a, b, colorA, colorB }: { a: PokemonSummary; b: PokemonSummary; colorA: string; colorB: string }) {
  return (
    <ul className="space-y-3" aria-label="Type matchups">
      <Direction from={a} to={b} fromColor={colorA} />
      <Direction from={b} to={a} fromColor={colorB} />
    </ul>
  );
}
