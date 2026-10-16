/**
 * Turns the battle effects' "x: [0, 80], opacity: [0, 1, 0]" descriptions into Web Animations API keyframes, so the browser runs them itself
 * (transform and opacity animations are handled on the compositor thread, off the main thread that React and the simulator share). Pure.
 *
 * Each property has its own list of values, spread evenly over the animation or placed at `times` (when that list is as long as `times`).
 * Properties with different numbers of values are put onto one set of keyframes by interpolating each at every offset used by any of them, so
 * "x: [0, dx]" (a steady flight) can run alongside "opacity: [0, 1, 1, 0]" (a fade in and out).
 */
export type Prop = "x" | "y" | "scale" | "scaleX" | "scaleY" | "rotate" | "opacity";
export type Frames = Partial<Record<Prop, number | number[]>>;

export interface Timing {
  /** Seconds. */
  duration: number;
  /** Seconds before it starts (the first keyframe is held until then). */
  delay?: number;
  /** Offsets 0..1 for the properties whose list is exactly as long. */
  times?: number[];
  /** Applied between every pair of keyframes. */
  ease?: "linear" | "easeIn" | "easeOut" | "easeInOut";
}

const CSS_EASE = { linear: "linear", easeIn: "ease-in", easeOut: "ease-out", easeInOut: "ease-in-out" } as const;

const PROPS: Prop[] = ["x", "y", "scale", "scaleX", "scaleY", "rotate", "opacity"];

const list = (value: number | number[] | undefined): number[] | null => (value === undefined ? null : Array.isArray(value) ? value : [value]);

/** The offsets of a property's values: `times` if it fits, else evenly spread (a single value has none: it is constant). */
function offsetsOf(values: number[], times?: number[]): number[] {
  if (values.length === 1) return [];
  if (times && times.length === values.length) return times;
  return values.map((_, i) => i / (values.length - 1));
}

/** The property's value at an offset, by linear interpolation between its own neighbouring values. */
function valueAt(values: number[], offsets: number[], at: number): number {
  if (values.length === 1) return values[0];
  if (at <= offsets[0]) return values[0];
  for (let i = 1; i < offsets.length; i++) {
    if (at <= offsets[i]) {
      const span = offsets[i] - offsets[i - 1];
      return span <= 0 ? values[i] : values[i - 1] + ((values[i] - values[i - 1]) * (at - offsets[i - 1])) / span;
    }
  }
  return values[values.length - 1];
}

const num = (n: number) => String(Math.round(n * 1000) / 1000);

export function toKeyframes(frames: Frames, timing: Pick<Timing, "times" | "ease"> = {}): Keyframe[] {
  const present = PROPS.flatMap((p) => {
    const values = list(frames[p]);
    return values && values.length ? [{ p, values, offsets: offsetsOf(values, timing.times) }] : [];
  });
  if (present.length === 0) return [];
  const all = new Set<number>([0, 1]);
  for (const { offsets } of present) for (const o of offsets) all.add(Math.min(1, Math.max(0, o)));
  const easing = CSS_EASE[timing.ease ?? "easeInOut"];
  return [...all]
    .sort((a, b) => a - b)
    .map((offset): Keyframe => {
      const at = (p: Prop) => {
        const found = present.find((x) => x.p === p);
        return found ? valueAt(found.values, found.offsets, offset) : undefined;
      };
      const parts: string[] = [];
      const x = at("x");
      const y = at("y");
      if (x !== undefined || y !== undefined) parts.push(`translate(${num(x ?? 0)}px, ${num(y ?? 0)}px)`);
      const rotate = at("rotate");
      if (rotate !== undefined) parts.push(`rotate(${num(rotate)}deg)`);
      const scale = at("scale");
      const sx = at("scaleX");
      const sy = at("scaleY");
      if (scale !== undefined || sx !== undefined || sy !== undefined) parts.push(`scale(${num((sx ?? 1) * (scale ?? 1))}, ${num((sy ?? 1) * (scale ?? 1))})`);
      const keyframe: Keyframe = { offset, easing };
      if (parts.length) keyframe.transform = parts.join(" ");
      const opacity = at("opacity");
      if (opacity !== undefined) keyframe.opacity = Math.round(opacity * 1000) / 1000;
      return keyframe;
    });
}

/** The options for `element.animate`: the first keyframe is held through the delay, the last after the end (as the effects were drawn before). */
export function toOptions(timing: Timing, fill: FillMode = "both"): KeyframeAnimationOptions {
  return { duration: Math.max(1, timing.duration * 1000), delay: Math.max(0, (timing.delay ?? 0) * 1000), fill, easing: "linear" };
}
