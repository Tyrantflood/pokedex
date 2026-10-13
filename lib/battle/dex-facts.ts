/** Bridges the simulator's Dex to the plain-data interfaces the protocol reducer and the CPU use. */
import type { ModdedDex } from "@pkmn/sim";
import { spriteIdFor } from "./ids";
import type { Lookups } from "./protocol";
import type { Matchup, MoveFacts, TypeMath } from "./cpu-logic";

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
    sound: !!m.flags.sound,
    bullet: !!m.flags.bullet,
  };
}

const capitalise = (type: string) => type.charAt(0).toUpperCase() + type.slice(1).toLowerCase();

/**
 * Type matchups from the simulator's own data for this dex's generation (so Gen 1's Ghost-does-nothing-to-Psychic and the Gen 2-5
 * Steel resisting Ghost and Dark are right). A type the generation doesn't have (Fairy in Gen 5, Tera's Stellar) is neutral.
 */
export function dexTypeMath(dex: ModdedDex): TypeMath {
  return {
    multiplier(attack, defenders) {
      const a = capitalise(attack);
      if (!dex.types.get(a).exists) return 1;
      let result = 1;
      for (const d of defenders) {
        const target = capitalise(d);
        if (!dex.types.get(target).exists) continue;
        if (!dex.getImmunity(a, target)) return 0;
        result *= 2 ** dex.getEffectiveness(a, target);
      }
      return result;
    },
  };
}

/** The type maths plus the generation, as the CPU scoring wants them. */
export const matchupFor = (dex: ModdedDex): Matchup => ({ math: dexTypeMath(dex), gen: dex.gen });
