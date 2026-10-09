/** An adult human, the reference silhouette: 1.7 m = 17 decimetres (PokéAPI heights are in dm). */
export const HUMAN_HEIGHT_DM = 17;

export interface Subject {
  /** Real height in decimetres. */
  heightDm: number;
  /** Visible width / visible height of the drawing (its opaque bounds, not the padded image). */
  aspect: number;
}

export interface ScaleInput {
  subjects: Subject[];
  stageWidth: number;
  stageHeight: number;
  /** Horizontal space between subjects, and the margin at both ends. */
  gap: number;
  /** Room kept above the tallest subject and below the baseline (for labels). */
  topPad: number;
  bottomPad: number;
  /**
   * Each subject takes at least this much width, whatever its drawing's width, because its label
   * sits under it. Without it a tiny Pokémon's wide label would push the row past the stage.
   */
  minColumnWidth?: number;
}

/**
 * Pixels per decimetre, chosen so that the tallest subject fits the stage vertically and the
 * whole row fits horizontally. One scale for everyone is what makes the comparison honest: every
 * subject's drawn height is exactly heightDm * pxPerDm.
 */
export function computeScale({ subjects, stageWidth, stageHeight, gap, topPad, bottomPad, minColumnWidth = 0 }: ScaleInput): number {
  const tallest = Math.max(...subjects.map((s) => s.heightDm));
  const byHeight = (stageHeight - topPad - bottomPad) / tallest;

  const rowWidthAt = (px: number) => subjects.reduce((w, s) => w + Math.max(s.heightDm * px * s.aspect, minColumnWidth), 0) + gap * (subjects.length + 1);
  if (rowWidthAt(byHeight) <= stageWidth) return Math.max(0.01, byHeight);
  // Even the labels alone are wider than the stage (a very narrow screen): no scale can make the
  // row fit, so use the height-limited one and let the row scroll sideways rather than shrinking
  // everything to a dot.
  if (rowWidthAt(0.01) > stageWidth) return Math.max(0.01, byHeight);

  // The row is too wide at the height-limited scale: find the largest scale that fits. Row width
  // only grows with the scale, so a binary search is exact enough (and cheap).
  let lo = 0.01;
  let hi = byHeight;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (rowWidthAt(mid) <= stageWidth) lo = mid;
    else hi = mid;
  }
  return lo;
}

export function renderedSize(subject: Subject, pxPerDm: number): { width: number; height: number } {
  const height = subject.heightDm * pxPerDm;
  return { height, width: height * subject.aspect };
}

/** "1.7 m", "0.4 m", "14.5 m" from decimetres. */
export const formatMetres = (dm: number) => `${(dm / 10).toFixed(1)} m`;

/** "2.1× taller" / "about the same height", seen from `a`. */
export function compareHeights(aDm: number, bDm: number): string {
  if (aDm === bDm) return "exactly the same height";
  const [hi, lo] = aDm > bDm ? [aDm, bDm] : [bDm, aDm];
  const ratio = hi / lo;
  if (ratio < 1.1) return "about the same height";
  return `${ratio >= 10 ? ratio.toFixed(0) : ratio.toFixed(1)}× ${aDm > bDm ? "taller" : "shorter"}`;
}

/** Sensible ruler spacing (in decimetres) for a stage showing `maxDm`: ~4-8 ticks. */
export function rulerStepDm(maxDm: number): number {
  for (const step of [5, 10, 20, 50, 100, 200, 500]) if (maxDm / step <= 8) return step;
  return 1000;
}
