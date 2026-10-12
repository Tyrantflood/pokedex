/**
 * What a move looks like, as data (no React here, so it can be tested). Written from scratch for this app; it does not
 * port or copy any other client's animation code.
 *
 * A move plays in beats: BANNER (the move's name is shown) -> ATTACK (its animation, by category) -> IMPACT (on the damage line:
 * particles at the target, a shake or flash; the HP bar then drains) -> effectiveness text. This module decides the attack beat
 * and how long it takes; `sequenceLines` puts the protocol lines into that order.
 */

export const BANNER_MS = 520;

export type MoveStyle =
  | "lunge" // physical: the user lunges into the target
  | "projectile" // special: an orb flies from the user to the target
  | "beam" // special: a beam joins them
  | "aura" // status on the user: a pulse and rising particles around it
  | "pulse" // status on the target: rings and particles around it
  // iconic moves with an animation of their own
  | "earthquake"
  | "hyperbeam"
  | "protect"
  | "thunderbolt"
  | "surf"
  | "swordsdance";

export interface MoveFx {
  style: MoveStyle;
  type: string;
  /** Length of the attack beat at normal speed, after the banner phase. */
  durationMs: number;
}

const DURATION: Record<MoveStyle, number> = {
  lunge: 480,
  projectile: 650,
  beam: 720,
  aura: 750,
  pulse: 700,
  earthquake: 1250,
  hyperbeam: 1450,
  protect: 850,
  thunderbolt: 950,
  surf: 1150,
  swordsdance: 1150,
};

const ICONIC: Record<string, MoveStyle> = {
  earthquake: "earthquake",
  hyperbeam: "hyperbeam",
  protect: "protect",
  thunderbolt: "thunderbolt",
  surf: "surf",
  swordsdance: "swordsdance",
};

const BEAM = /(beam|ray|laser|cannon|lance|flash)/;

export const moveId = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "");

/** Which animation a move gets: an iconic one by name, otherwise by category (and, for status moves, whether it targets the user). */
export function planMove(move: { name: string; type: string; category: string; selfTarget: boolean }): MoveFx {
  const id = moveId(move.name);
  let style: MoveStyle = ICONIC[id];
  if (!style) {
    if (move.category === "Physical") style = "lunge";
    else if (move.category === "Special") style = BEAM.test(id) ? "beam" : "projectile";
    else style = move.selfTarget ? "aura" : "pulse";
  }
  return { style, type: move.type, durationMs: DURATION[style] };
}

/** How long the move line holds the log: the banner, then the attack. Reduced motion only needs the banner to be readable. */
export function moveHoldMs(fx: MoveFx, reducedMotion: boolean): number {
  return reducedMotion ? 650 : BANNER_MS + fx.durationMs;
}

/** A hit that earns a screen shake: a critical hit, or a third of the target's HP or more. */
export const isBigHit = (amount: number, crit: boolean) => crit || amount >= 30;

// ---- particles per type -------------------------------------------------------------------------------------------------

export type ParticleShape = "streak" | "flame" | "drop" | "bolt" | "leaf" | "shard" | "star" | "bubble" | "dust" | "slash" | "ring" | "dot" | "rock" | "wisp" | "claw" | "glint" | "sparkle" | "arrow";
export type ParticleMotion = "burst" | "rise" | "splash" | "swirl" | "sweep" | "pulse" | "fall" | "swarm" | "float" | "twinkle";

export interface TypeFx {
  shape: ParticleShape;
  motion: ParticleMotion;
  /** Main colour and a lighter accent. */
  colors: [string, string];
  count: number;
}

/** One look per type; every type has a different shape-and-motion pair (tests keep it so). */
export const TYPE_FX: Record<string, TypeFx> = {
  normal: { shape: "streak", motion: "burst", colors: ["#e8e6d4", "#a8a77a"], count: 10 },
  fire: { shape: "flame", motion: "rise", colors: ["#ee8130", "#ffd36b"], count: 11 },
  water: { shape: "drop", motion: "splash", colors: ["#6390f0", "#bfe0ff"], count: 11 },
  electric: { shape: "bolt", motion: "burst", colors: ["#f7d02c", "#fff7b0"], count: 8 },
  grass: { shape: "leaf", motion: "swirl", colors: ["#7ac74c", "#c6f09a"], count: 10 },
  ice: { shape: "shard", motion: "burst", colors: ["#96d9d6", "#eaffff"], count: 10 },
  fighting: { shape: "star", motion: "burst", colors: ["#c22e28", "#ffb199"], count: 8 },
  poison: { shape: "bubble", motion: "rise", colors: ["#a33ea1", "#e6a8e4"], count: 10 },
  ground: { shape: "dust", motion: "rise", colors: ["#e2bf65", "#8a6a2e"], count: 11 },
  flying: { shape: "slash", motion: "sweep", colors: ["#a98ff3", "#f0eaff"], count: 5 },
  psychic: { shape: "ring", motion: "pulse", colors: ["#f95587", "#ffc2d6"], count: 4 },
  bug: { shape: "dot", motion: "swarm", colors: ["#a6b91a", "#e6f27a"], count: 12 },
  rock: { shape: "rock", motion: "fall", colors: ["#b6a136", "#7a6d2a"], count: 8 },
  ghost: { shape: "wisp", motion: "float", colors: ["#735797", "#c9b2f0"], count: 8 },
  dragon: { shape: "flame", motion: "swirl", colors: ["#6f35fc", "#b9a0ff"], count: 10 },
  dark: { shape: "claw", motion: "burst", colors: ["#8f6fd1", "#e2d1ff"], count: 6 },
  steel: { shape: "glint", motion: "burst", colors: ["#b7b7ce", "#ffffff"], count: 7 },
  fairy: { shape: "sparkle", motion: "twinkle", colors: ["#d685ad", "#ffe0f0"], count: 10 },
};

/** Looks for things that are not a type: healing, and stat changes. */
export const STATE_FX: Record<string, TypeFx> = {
  heal: { shape: "sparkle", motion: "rise", colors: ["#34d399", "#d1fae5"], count: 8 },
  boost: { shape: "arrow", motion: "rise", colors: ["#34d399", "#bbf7d0"], count: 6 },
  unboost: { shape: "arrow", motion: "fall", colors: ["#f87171", "#fecaca"], count: 6 },
};

/** Stellar, unknown and anything else look like Normal. */
export const typeFx = (type: string): TypeFx => TYPE_FX[type] ?? STATE_FX[type] ?? TYPE_FX.normal;

// ---- reproducible randomness ---------------------------------------------------------------------------------------------

/** Small seeded generator (mulberry32): the same cue always scatters its particles the same way. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- ordering ----------------------------------------------------------------------------------------------------------

export interface HitFlags {
  crit: boolean;
  super: boolean;
  resisted: boolean;
}

export interface Step {
  line: string;
  /** On a damage line: how the hit that caused it went. */
  hit?: HitFlags;
}

const EFFECTIVENESS = /^\|-(crit|supereffective|resisted)\|/;

/**
 * The simulator announces "super effective" and "critical hit" before it reports the damage. Played in that order the text would
 * come before the HP bar moves; the intended order is impact, HP drains, then the text. So each run of those lines is moved to
 * just after the damage line it belongs to, and their meaning is passed on that damage line as flags (for the crit flash).
 * Lines that are not held back keep their order, so state changes are unaffected.
 */
export function sequenceLines(lines: string[]): Step[] {
  const steps: Step[] = [];
  let held: string[] = [];
  const flush = () => {
    for (const line of held) steps.push({ line });
    held = [];
  };
  for (const line of lines) {
    if (EFFECTIVENESS.test(line)) {
      held.push(line);
    } else if (line.startsWith("|-damage|") && !line.includes("[from]")) {
      const hit: HitFlags = { crit: held.some((l) => l.startsWith("|-crit|")), super: held.some((l) => l.startsWith("|-supereffective|")), resisted: held.some((l) => l.startsWith("|-resisted|")) };
      steps.push({ line, hit });
      flush();
    } else {
      flush();
      steps.push({ line });
    }
  }
  flush();
  return steps;
}
