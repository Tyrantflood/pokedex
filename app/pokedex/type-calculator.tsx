"use client";

import { motion, useReducedMotion, type Variants } from "framer-motion";
import type { PokemonType } from "@/lib/pokemon-types";
import { defenseProfile, multiplierLabel, type DefenseGroup, type DefenseMultiplier } from "@/lib/type-chart";
import { TYPE_COLORS } from "@/lib/type-colors";

const SECTIONS: { title: string; multipliers: DefenseMultiplier[]; empty: string }[] = [
  { title: "Weak to", multipliers: [4, 2], empty: "Nothing" },
  { title: "Resists", multipliers: [0.5, 0.25], empty: "Nothing" },
  { title: "Immune to", multipliers: [0], empty: "Nothing" },
];

const STAGGER_S = 0.035;

const row: Variants = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { duration: 0.25 } } };
const chip: Variants = {
  hidden: { opacity: 0, scale: 0.6, y: 8 },
  show: { opacity: 1, scale: 1, y: 0, transition: { type: "spring", stiffness: 520, damping: 26 } },
};

/** The badge colour, from the defender's side: a weakness is red, a resistance green, an immunity black. */
function badgeStyle(m: number): { background: string; color: string } {
  if (m === 0) return { background: "#0b0b0e", color: "#9ca3af" };
  if (m >= 2) return { background: "#dc2626", color: "#fff" }; // a weakness: bad for the defender
  return { background: "#16a34a", color: "#04210f" }; // a resistance: good for the defender
}

const label = (m: DefenseMultiplier) => (m === 0 ? "×0" : multiplierLabel(m));

/**
 * What hits this Pokémon hard, softly or not at all, computed from its own types (a regional form has its own) with
 * the same chart comparison mode uses. A dual type is the two halves multiplied, so x4 and x0.25 are possible, a weakness
 * and a resistance cancel out, and an immunity beats any weakness. The chips pop in one after another.
 * Remount (key) when the Pokémon changes so they animate again.
 */
export function TypeCalculator({ types, delay = 0 }: { types: PokemonType[]; delay?: number }) {
  const reduce = useReducedMotion() ?? false;
  const groups = defenseProfile(types);
  const byMultiplier = new Map<number, DefenseGroup>(groups.map((g) => [g.multiplier, g]));

  return (
    <section aria-label="Type matchups">
      <h3 className="fx-flick mb-2 text-xs font-semibold uppercase tracking-widest text-white/70">
        Type matchups <span className="ml-1 normal-case tracking-normal text-white/50">as {types.join(" / ")}</span>
      </h3>
      <motion.div
        className="space-y-2.5"
        initial="hidden"
        animate="show"
        variants={{ show: { transition: { delayChildren: reduce ? 0 : delay, staggerChildren: reduce ? 0 : STAGGER_S } } }}
      >
        {SECTIONS.map((section) => {
          const present = section.multipliers.map((m) => byMultiplier.get(m)).filter((g): g is DefenseGroup => g !== undefined);
          return (
            <div key={section.title} className="grid grid-cols-[4.75rem_1fr] items-start gap-x-3 gap-y-1 text-sm">
              <motion.p variants={row} className="pt-1 text-xs font-semibold uppercase tracking-wider text-white/70">
                {section.title}
              </motion.p>
              {present.length === 0 ? (
                <motion.p variants={row} className="pt-1 text-white/55">
                  {section.empty}
                </motion.p>
              ) : (
                <ul className="space-y-1.5">
                  {present.map((group) => (
                    <li key={group.multiplier} className="flex flex-wrap items-center gap-1.5" aria-label={`${section.title} ${label(group.multiplier)}: ${group.types.join(", ")}`}>
                      <motion.span variants={chip} className="w-9 rounded-md px-1.5 py-0.5 text-center font-mono text-xs font-bold" style={badgeStyle(group.multiplier)}>
                        {label(group.multiplier)}
                      </motion.span>
                      {group.types.map((type) => (
                        <motion.span
                          key={type}
                          variants={chip}
                          data-chip={type}
                          className="rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-black/80"
                          style={{ background: TYPE_COLORS[type] }}
                        >
                          {type}
                        </motion.span>
                      ))}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </motion.div>
    </section>
  );
}
