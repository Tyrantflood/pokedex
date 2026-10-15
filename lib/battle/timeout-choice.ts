/**
 * What is chosen for a player whose turn timer ran out: a random legal choice (a usable move, a healthy Pokémon to send in, a lead at Team
 * Preview), worked out from the request the simulator sent. Pure; the room server stores the choice like any other, so a replay repeats it.
 */
import { parseRequest } from "./protocol";

export function randomLegalChoice(rawRequest: unknown, random: () => number = Math.random): string {
  const request = parseRequest(rawRequest);
  const pick = <T,>(items: T[]) => items[Math.floor(random() * items.length)];
  if (request.teamPreview) return request.team.length > 1 ? `team ${1 + Math.floor(random() * request.team.length)}` : "default";
  // A forced switch (or Revival Blessing, which wants a fainted Pokémon): any eligible bench member.
  if (request.forceSwitch || !request.active) {
    const bench = request.team.flatMap((p, i) => (!p.active && (request.reviving ? p.fainted : !p.fainted) ? [i + 1] : []));
    return bench.length ? `switch ${pick(bench)}` : "default";
  }
  const usable = request.active.moves.flatMap((m, i) => (!m.disabled && m.pp !== 0 ? [i + 1] : []));
  return usable.length ? `move ${pick(usable)}` : "default";
}
