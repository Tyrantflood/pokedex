"use client";

import { useLayoutEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { toKeyframes, toOptions, type Frames, type Timing } from "@/lib/battle/keyframes";

export type { Frames, Timing };

/**
 * Plays frames on an element with the Web Animations API: only transform and opacity, so the browser runs them on the compositor thread and a busy
 * main thread (React, the simulator) cannot make them drop frames. Returns the animation (or null where the API is missing).
 */
export function play(el: Element, frames: Frames, timing: Timing, fill: FillMode = "none"): Animation | null {
  if (typeof el.animate !== "function") return null;
  const keyframes = toKeyframes(frames, timing);
  if (keyframes.length === 0) return null;
  return el.animate(keyframes, toOptions(timing, fill));
}

interface WaProps {
  as?: "span" | "div" | "svg";
  /** The frames to play, once, when the element appears. */
  animate: Frames;
  transition: Timing;
  /** Accepted for the call sites' readability: the first frame is held from the start (fill: both), so it is not needed. */
  initial?: unknown;
  className?: string;
  style?: CSSProperties;
  viewBox?: string;
  "aria-hidden"?: boolean;
  children?: ReactNode;
}

/**
 * An element that plays its effect once on mount (the effects mount when their cue arrives and are removed with it) and stays on its last frame.
 * `will-change` gives it its own layer up front, so the first frame does not wait for one.
 */
export function Wa({ as = "span", animate, transition, initial: _initial, style, children, viewBox, ...rest }: WaProps) {
  void _initial;
  const node = useRef<Element | null>(null);
  const hold = (el: Element | null) => {
    node.current = el;
  };
  useLayoutEffect(() => {
    const el = node.current;
    if (!el) return;
    const animation = play(el, animate, transition, "both");
    // No Web Animations API: nothing may be left standing at full opacity.
    if (!animation && el instanceof HTMLElement) el.style.opacity = "0";
    return () => animation?.cancel();
    // Mount only: a cue's effect is drawn once and never changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const layer = { ...style, willChange: "transform, opacity" };
  if (as === "svg") {
    return (
      <svg ref={hold} style={layer} viewBox={viewBox} {...rest}>
        {children}
      </svg>
    );
  }
  if (as === "div") {
    return (
      <div ref={hold} style={layer} {...rest}>
        {children}
      </div>
    );
  }
  return (
    <span ref={hold} style={layer} {...rest}>
      {children}
    </span>
  );
}
