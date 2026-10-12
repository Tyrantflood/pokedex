/**
 * The optional turn limit. The simulator has no limit of its own below 1000 turns, so the engine ends the battle itself when the
 * chosen number of turns has been played and decides it here. Pure, so the rules can be tested.
 *
 * At the limit: the side with more Pokémon still standing wins; if that is level, the side with the higher total HP percentage
 * (each Pokémon's HP as a percentage of its maximum, summed over the team, fainted ones counting 0); if that is level too, a draw.
 */

export const TURN_LIMITS = [0, 30, 50, 100] as const;
export type TurnLimit = (typeof TURN_LIMITS)[number];

/** 0 means off. Anything else that is not one of the offered limits is treated as off. */
export const normalizeTurnLimit = (value: unknown): TurnLimit => (TURN_LIMITS.includes(value as TurnLimit) ? (value as TurnLimit) : 0);

export interface SideTally {
  name: string;
  pokemon: { hp: number; maxHp: number; fainted: boolean }[];
}

export interface Verdict {
  winner: "p1" | "p2" | null;
  reason: "pokemon" | "hp" | "draw";
  remaining: [number, number];
  /** Total HP percentage per side. */
  hpPercent: [number, number];
  /** One sentence for the battle log. */
  message: string;
}

const alive = (side: SideTally) => side.pokemon.filter((p) => !p.fainted && p.hp > 0).length;
const hpTotal = (side: SideTally) => side.pokemon.reduce((sum, p) => (p.fainted || p.maxHp <= 0 ? sum : sum + (Math.max(0, p.hp) / p.maxHp) * 100), 0);
const round1 = (n: number) => Math.round(n * 10) / 10;

export function adjudicate(p1: SideTally, p2: SideTally, limit: number): Verdict {
  const remaining: [number, number] = [alive(p1), alive(p2)];
  const hpPercent: [number, number] = [hpTotal(p1), hpTotal(p2)];
  const lead = `Turn limit reached (${limit}).`;
  if (remaining[0] !== remaining[1]) {
    const win = remaining[0] > remaining[1] ? 0 : 1;
    const [w, l] = win === 0 ? [p1, p2] : [p2, p1];
    return { winner: win === 0 ? "p1" : "p2", reason: "pokemon", remaining, hpPercent, message: `${lead} ${w.name} has ${remaining[win]} Pokémon left to ${l.name}'s ${remaining[1 - win]}, so ${w.name} wins.` };
  }
  if (Math.abs(hpPercent[0] - hpPercent[1]) > 1e-9) {
    const win = hpPercent[0] > hpPercent[1] ? 0 : 1;
    const [w, l] = win === 0 ? [p1, p2] : [p2, p1];
    return {
      winner: win === 0 ? "p1" : "p2",
      reason: "hp",
      remaining,
      hpPercent,
      message: `${lead} Both sides have ${remaining[0]} Pokémon left; ${w.name} has more total HP (${round1(hpPercent[win])}% to ${l.name}'s ${round1(hpPercent[1 - win])}%), so ${w.name} wins.`,
    };
  }
  return { winner: null, reason: "draw", remaining, hpPercent, message: `${lead} Both sides have ${remaining[0]} Pokémon left with the same total HP, so the battle is a draw.` };
}
