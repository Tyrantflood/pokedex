/** Bridges the simulator's Dex to the plain-data interfaces the protocol reducer and the CPU use. */
import type { ModdedDex } from "@pkmn/sim";
import { spriteIdFor } from "./ids";
import type { Lookups } from "./protocol";
import type { MoveFacts } from "./cpu-logic";

export function makeLookups(dex: ModdedDex): Lookups {
  return {
    species(name) {
      const species = dex.species.get(name);
      return { spriteId: spriteIdFor(species.id, species.num), types: species.types.map((t) => t.toLowerCase()) };
    },
    move(name) {
      const move = dex.moves.get(name);
      return { type: move.exists ? move.type.toLowerCase() : "normal", category: move.category };
    },
  };
}

export function moveFacts(dex: ModdedDex, id: string): MoveFacts {
  const m = dex.moves.get(id);
  const targetsSelf = m.target === "self" || m.target === "allySide" || m.target === "allyTeam" || m.target === "adjacentAllyOrSelf";
  return {
    id: m.id,
    type: m.type.toLowerCase(),
    category: m.category,
    basePower: m.basePower,
    accuracy: m.accuracy,
    priority: m.priority,
    fixedDamage: m.damage === "level" || typeof m.damage === "number",
    ohko: !!m.ohko,
    charge: !!m.flags.charge,
    recharge: !!m.flags.recharge,
    selfDestruct: !!m.selfdestruct,
    heals: !!m.heal || m.id === "rest",
    inflicts: m.status && !targetsSelf ? m.status : null,
    selfBoost: m.category === "Status" && targetsSelf && !!m.boosts,
    hazard: m.sideCondition && m.target === "foeSide" ? m.sideCondition : null,
    protects: m.volatileStatus === "protect" || !!m.stallingMove,
  };
}
