import type { PokemonStats, PokemonType } from "./pokemon-types";
import { bestMultiplier } from "./type-chart";

/** The little the verdict needs to know about each Pokémon. */
export interface VerdictSubject {
  id: number;
  name: string;
  types: PokemonType[];
  stats: PokemonStats;
  /** Decimetres. */
  height: number;
}

const total = (s: PokemonStats) => s.hp + s.attack + s.defense + s.specialAttack + s.specialDefense + s.speed;
const pretty = (name: string) => name.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const fmtMult = (m: number) => (m === 0 ? "nothing" : m === 0.25 ? "×¼" : m === 0.5 ? "×½" : `×${m}`);

// Same pair, same line, in either order: pick wording from a hash of the two ids.
const seedFor = (a: VerdictSubject, b: VerdictSubject) => {
  const [lo, hi] = a.id < b.id ? [a.id, b.id] : [b.id, a.id];
  let h = (lo * 73856093) ^ (hi * 19349663);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  return (h ^ (h >>> 12)) >>> 0;
};

type Kind = "type" | "stats" | "size" | "speed" | "close";
interface Candidate {
  kind: Kind;
  /** How striking this fact is; the most striking one becomes the verdict. */
  drama: number;
  lines: string[];
}

export const MAX_VERDICT_LENGTH = 130;

/**
 * One playful line comparing two Pokémon. It is a joke built from a few base numbers, NOT a battle
 * prediction (real battles depend on moves, abilities, levels, items and more), and the UI labels
 * it as such. It picks whichever fact is most striking: type advantage, base stats, size or speed.
 */
export function verdict(a: VerdictSubject, b: VerdictSubject): string {
  const A = pretty(a.name);
  const B = pretty(b.name);
  const seed = seedFor(a, b);

  const typeA = bestMultiplier(a.types, b.types); // A's best STAB move against B
  const typeB = bestMultiplier(b.types, a.types);
  const bstA = total(a.stats);
  const bstB = total(b.stats);
  const speedGap = a.stats.speed - b.stats.speed;
  const heightRatio = Math.max(a.height, b.height) / Math.max(1, Math.min(a.height, b.height));

  const candidates: Candidate[] = [];

  // Type edge: how lopsided are the two best STAB multipliers?
  if (typeA !== typeB) {
    const [W, L, mw, ml] = typeA > typeB ? [A, B, typeA, typeB] : [B, A, typeB, typeA];
    const drama = Math.abs(Math.log2((mw || 0.125) / (ml || 0.125))) * 0.9;
    candidates.push({
      kind: "type",
      drama,
      lines: [
        `${W} hits ${L} for ${fmtMult(mw)} and gets ${fmtMult(ml)} back. Typing is destiny.`,
        `Rock-paper-scissors, rigged: ${W} lands ${fmtMult(mw)} on ${L}, ${L} manages ${fmtMult(ml)}.`,
        `${L} brought ${fmtMult(ml)} to a ${fmtMult(mw)} fight against ${W}.`,
      ],
    });
  }

  // Raw base stat totals.
  if (bstA !== bstB) {
    const [W, L, d] = bstA > bstB ? [A, B, bstA - bstB] : [B, A, bstB - bstA];
    candidates.push({
      kind: "stats",
      drama: d / 70,
      lines: [
        `${W} has ${d} more base stat points than ${L}. Stats aren't everything, but they're a lot.`,
        `${d} base stat points separate ${W} from ${L}, and ${W} is on the good side of that.`,
        `On paper ${W} out-stats ${L} by ${d}. Paper doesn't hold a grudge, though.`,
      ],
    });
  }

  // Size.
  if (heightRatio >= 1.15) {
    const [T, S] = a.height > b.height ? [A, B] : [B, A];
    const x = heightRatio >= 10 ? heightRatio.toFixed(0) : heightRatio.toFixed(1);
    candidates.push({
      kind: "size",
      drama: Math.log2(heightRatio) / 1.6,
      lines: [
        `${T} is ${x}× taller than ${S}: great for reaching shelves, terrible for hide-and-seek.`,
        `${S} would have to stand on ${x} of itself to look ${T} in the eye.`,
        `Height-wise ${T} wins by ${x}×. ${S} wins at fitting through doors.`,
      ],
    });
  }

  // Speed.
  if (speedGap !== 0) {
    const [W, L, ws, ls] = speedGap > 0 ? [A, B, a.stats.speed, b.stats.speed] : [B, A, b.stats.speed, a.stats.speed];
    candidates.push({
      kind: "speed",
      drama: Math.abs(speedGap) / 45,
      lines: [
        `${W} (${ws} speed) finishes the race while ${L} (${ls}) is still tying its shoelaces.`,
        `In a footrace ${W} laps ${L}: ${ws} speed to ${ls}.`,
        `${L} says "wait up" a lot around ${W}. ${ls} speed will do that.`,
      ],
    });
  }

  const best = candidates.sort((x, y) => y.drama - x.drama)[0];
  if (!best || best.drama < 0.45) {
    const d = Math.abs(bstA - bstB);
    // Name them in a fixed order (lower id first) so the line is the same whichever way round they were compared.
    const [first, second] = a.id < b.id ? [A, B] : [B, A];
    return [
      `Dead heat: ${first} and ${second} are just ${d} base stat points apart. Settle it over snacks.`,
      `Honestly too close to call. ${first} and ${second} could trade snacks instead of blows.`,
    ][seed % 2];
  }

  // Prefer a wording that fits on one line; every kind has a short option.
  const fitting = best.lines.filter((l) => l.length <= MAX_VERDICT_LENGTH);
  const pool = fitting.length > 0 ? fitting : [...best.lines].sort((x, y) => x.length - y.length).slice(0, 1);
  const line = pool[seed % pool.length];
  return line.length <= MAX_VERDICT_LENGTH ? line : `${line.slice(0, MAX_VERDICT_LENGTH - 1).trimEnd()}…`;
}
