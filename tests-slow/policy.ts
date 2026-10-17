import { moveChoice, type Special } from "../lib/battle/move-choice";
import type { ParsedRequest } from "../lib/battle/protocol";

/** A player who uses everything the screen offers: leads, switches, Mega/Z/Dynamax/Tera toggles. Shared by the soak tests. */
export function chooseFor(request: ParsedRequest, rnd: () => number, used: Record<string, number>): string {
  if (request.teamPreview) return `team ${1 + Math.floor(rnd() * request.team.length)}`;
  const bench = request.team.flatMap((p, i) => (!p.active && (request.reviving ? p.fainted : !p.fainted) ? [i + 1] : []));
  if (request.forceSwitch || !request.active) return bench.length ? `switch ${bench[Math.floor(rnd() * bench.length)]}` : "default";
  const a = request.active;
  const usable = a.moves.flatMap((m, i) => (!m.disabled && m.pp !== 0 ? [i] : []));
  if (bench.length && !a.trapped && (usable.length === 0 || rnd() < 0.08)) return `switch ${bench[Math.floor(rnd() * bench.length)]}`;
  if (usable.length === 0) return "move 1";
  const slot = usable[Math.floor(rnd() * usable.length)];
  let special: Special | null = null;
  if (a.canMega && rnd() < 0.5) special = "mega";
  else if (a.canUltra && rnd() < 0.5) special = "ultra";
  else if (a.zMoves[slot] && rnd() < 0.4) special = "z";
  else if (a.canDynamax && rnd() < 0.25) special = "dynamax";
  else if (a.canTera && rnd() < 0.3) special = "tera";
  if (special) used[special] = (used[special] ?? 0) + 1;
  return moveChoice(slot + 1, special);
}

export function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}


/** What must be true of the view the screen draws, after any line: nothing NaN, nothing impossible. Returns the violations. */
export function viewProblems(view: import("../lib/battle/protocol").BattleView): string[] {
  const problems: string[] = [];
  for (const side of ["p1", "p2"] as const) {
    const s = view.sides[side];
    if (s.mons.length > 6) problems.push(`${side} has ${s.mons.length} Pokémon`);
    if (new Set(s.mons.map((m) => m.nickname)).size !== s.mons.length) problems.push(`${side} has two Pokémon with one name: ${s.mons.map((m) => m.nickname).join(",")}`);
    if (s.active < -1 || s.active >= s.mons.length) problems.push(`${side} active index ${s.active} of ${s.mons.length}`);
    for (const m of s.mons) {
      const who = `${side} ${m.nickname}/${m.species}`;
      if (!Number.isFinite(m.hp) || !Number.isFinite(m.maxHp)) problems.push(`${who}: hp ${m.hp}/${m.maxHp}`);
      else if (m.hp < 0 || m.hp > m.maxHp) problems.push(`${who}: hp ${m.hp} outside 0..${m.maxHp}`);
      if (m.fainted && m.hp !== 0) problems.push(`${who}: fainted with ${m.hp} HP`);
      if (!(m.spriteId > 0)) problems.push(`${who}: no sprite id`);
      if (m.types.length === 0) problems.push(`${who}: no types`);
      if (!m.species) problems.push(`${who}: no species`);
      for (const [stat, v] of Object.entries(m.boosts)) if (!Number.isFinite(v) || Math.abs(v) > 12) problems.push(`${who}: boost ${stat} ${v}`);
    }
  }
  if (!Number.isFinite(view.turn) || view.turn < 0) problems.push(`turn ${view.turn}`);
  for (const entry of view.log) if (/undefined|NaN|\[object/.test(entry.text)) problems.push(`log line with a bug in it: ${entry.text}`);
  return problems;
}
