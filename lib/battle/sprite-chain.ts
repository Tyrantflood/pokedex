/**
 * How a battler's picture is found, so a Pokémon is never invisible. Pure: the browser supplies `probe` (load an image, report its
 * size or that it failed) and the tests supply a fake one.
 *
 * Your own Pokémon (back view): animated back, static back, then the front view flipped, then the official artwork, then a
 * placeholder. The opponent (front view): animated front, static front, artwork, placeholder.
 *
 * Why it is staged and not strictly one after another: the animated GIFs are big (Tangrowth's back GIF is about 190 KB) and the
 * static sprites are about 1 KB. Waiting for the GIF alone left the Pokémon invisible for seconds. So the first two pictures start
 * together, whatever has loaded is shown (the GIF replaces the static sprite when it arrives), and the next tier only starts when
 * the first has produced nothing, either because both failed or after `stageMs`. Until something loads the placeholder is shown.
 */
import { allSpriteUrls, type Facing } from "./ids";

export type SpriteKind = "gif" | "png" | "artwork" | "placeholder";

export interface SpriteCandidate {
  /** Unique within a chain. */
  id: string;
  url: string;
  kind: SpriteKind;
  /** Draw it mirrored (a front view standing in for a back view). */
  flip: boolean;
}

export interface Size {
  w: number;
  h: number;
}

/** Loads one image: its size, or null when it failed or took too long. */
export type Probe = (url: string) => Promise<Size | null>;

export const PLACEHOLDER_URL = "/placeholder.svg";

const placeholder: SpriteCandidate = { id: "placeholder", url: PLACEHOLDER_URL, kind: "placeholder", flip: false };

/** The tiers of the chain, most preferred first. Candidates inside a tier load at the same time. */
export function spriteTiers(spriteId: number, facing: Facing): SpriteCandidate[][] {
  const u = allSpriteUrls(spriteId);
  const artwork: SpriteCandidate = { id: "artwork", url: u.artwork, kind: "artwork", flip: false };
  if (facing === "front") {
    return [
      [
        { id: "front-gif", url: u.frontGif, kind: "gif", flip: false },
        { id: "front-png", url: u.frontPng, kind: "png", flip: false },
      ],
      [artwork],
      [placeholder],
    ];
  }
  return [
    [
      { id: "back-gif", url: u.backGif, kind: "gif", flip: false },
      { id: "back-png", url: u.backPng, kind: "png", flip: false },
    ],
    [
      { id: "front-gif-flipped", url: u.frontGif, kind: "gif", flip: true },
      { id: "front-png-flipped", url: u.frontPng, kind: "png", flip: true },
    ],
    [{ ...artwork, flip: true }],
    [placeholder],
  ];
}

export interface Shown {
  candidate: SpriteCandidate;
  /** Null for the placeholder. */
  size: Size | null;
  /** True while nothing real has loaded yet (the placeholder is standing in). */
  waiting: boolean;
}

/** What to show before the first update. */
export const WAITING: Shown = { candidate: placeholder, size: null, waiting: true };

export interface ChainOptions {
  /** How long a tier may produce nothing before the next one starts too. */
  stageMs?: number;
}

/**
 * Starts loading the chain and calls `onUpdate` every time the best available picture changes (never synchronously: the first call
 * comes after a probe finishes). Returns a function that stops it. The placeholder is what to show until the first update.
 */
export function runChain(tiers: SpriteCandidate[][], probe: Probe, onUpdate: (shown: Shown) => void, options: ChainOptions = {}): () => void {
  const stageMs = options.stageMs ?? 1500;
  const order = tiers.flat();
  const loaded = new Map<string, Size | null>(); // size when loaded, null when failed; absent while loading
  let stopped = false;
  let startedTiers = 0;
  let lastShown = "";
  const timers: ReturnType<typeof setTimeout>[] = [];

  const best = (): Shown => {
    for (const c of order) {
      if (c.kind === "placeholder") break;
      const size = loaded.get(c.id);
      if (size) return { candidate: c, size, waiting: false };
    }
    return { candidate: placeholder, size: null, waiting: !allFailed() };
  };
  const allFailed = () => order.filter((c) => c.kind !== "placeholder").every((c) => loaded.get(c.id) === null);

  const emit = () => {
    if (stopped) return;
    const shown = best();
    const key = `${shown.candidate.id}:${shown.waiting}`;
    if (key === lastShown) return;
    lastShown = key;
    onUpdate(shown);
  };

  const tierOver = (t: number) => tiers[t].every((c) => c.kind === "placeholder" || loaded.get(c.id) === null);
  const tierHasPicture = (t: number) => tiers[t].some((c) => !!loaded.get(c.id));

  const startTier = (t: number) => {
    if (stopped || t >= tiers.length || t < startedTiers) return;
    startedTiers = t + 1;
    for (const c of tiers[t]) {
      if (c.kind === "placeholder") continue;
      void probe(c.url).then((size) => {
        if (stopped) return;
        loaded.set(c.id, size);
        emit();
        // The newest tier failed outright: go on to the next at once.
        if (t === startedTiers - 1 && tierOver(t)) startTier(t + 1);
      });
    }
    // Or it is merely slow: bring the next tier in as well, so something shows up.
    timers.push(
      setTimeout(() => {
        if (!stopped && t === startedTiers - 1 && !tierHasPicture(t)) startTier(t + 1);
      }, stageMs),
    );
  };

  startTier(0);
  return () => {
    stopped = true;
    timers.forEach(clearTimeout);
  };
}
