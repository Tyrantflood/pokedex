// Shared pieces of the "DEX-LINK field scanner" look (see app/boot-intro.tsx) for the generated
// images: favicon, Apple touch icon and the Open Graph / Twitter preview. These render through
// Satori (next/og), which supports flexbox and a subset of CSS, so every element with more than
// one child sets display:flex and nothing relies on grid, blend modes or filters.
import type { CSSProperties } from "react";

export const BRAND = {
  bg: "#05080a",
  slateLight: "#334155",
  slateDark: "#0f172a",
  slateBorder: "#475569",
  screen: "#031412",
  bezel: "#020617",
  teal: "#99f6e4",
  tealMid: "#2dd4bf",
  cyan: "#22d3ee",
  amber: "#fbbf24",
  emerald: "#34d399",
} as const;

const SVG_STROKE = { "stroke-linecap": "round" } as Record<string, string>;

/** The scanner's targeting-reticle mark: ring, inner ring and four ticks. */
export function ReticleMark({ size, color = BRAND.teal, stroke = 2 }: { size: number; color?: string; stroke?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" stroke={color} stroke-width={stroke} {...SVG_STROKE}>
      <circle cx="20" cy="20" r="14" />
      <circle cx="20" cy="20" r="5" />
      <path d="M20 2v8M20 30v8M2 20h8M30 20h8" />
    </svg>
  );
}

/**
 * The favicon: a slate scanner body around the reticle. Small sizes drop the screen inset and
 * thicken the strokes, because fine detail turns to mush at 16px.
 */
export function ScannerIcon({ size }: { size: number }) {
  const compact = size <= 32;
  const body: CSSProperties = {
    width: size,
    height: size,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: Math.round(size * 0.22),
    background: `linear-gradient(145deg, ${BRAND.slateLight}, ${BRAND.slateDark})`,
    border: `${Math.max(1, Math.round(size / 24))}px solid ${BRAND.slateBorder}`,
  };
  if (compact) {
    return (
      <div style={body}>
        <ReticleMark size={Math.round(size * 0.74)} stroke={4.4} />
      </div>
    );
  }
  return (
    <div style={body}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: Math.round(size * 0.72),
          height: Math.round(size * 0.72),
          borderRadius: Math.round(size * 0.12),
          background: BRAND.screen,
          border: `${Math.max(1, Math.round(size / 18))}px solid ${BRAND.bezel}`,
        }}
      >
        <ReticleMark size={Math.round(size * 0.5)} stroke={3} />
      </div>
    </div>
  );
}

/** The scanner body, with lens, status LEDs and speaker slots, around any screen content. */
export function ScannerDevice({ width, height, children }: { width: number; height: number; children: React.ReactNode }) {
  const pad = Math.round(width * 0.04);
  return (
    <div
      style={{
        width,
        height,
        display: "flex",
        flexDirection: "column",
        padding: pad,
        borderRadius: Math.round(width * 0.075),
        background: `linear-gradient(180deg, ${BRAND.slateLight}, ${BRAND.slateDark})`,
        border: `2px solid ${BRAND.slateBorder}`,
        boxShadow: "0 0 80px rgba(45,212,191,0.22)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", marginBottom: pad * 0.8 }}>
        <div
          style={{
            width: pad * 1.5,
            height: pad * 1.5,
            borderRadius: 999,
            background: BRAND.cyan,
            border: `3px solid ${BRAND.bezel}`,
            boxShadow: `0 0 18px ${BRAND.cyan}`,
          }}
        />
        <div style={{ width: pad * 0.5, height: pad * 0.5, borderRadius: 999, background: BRAND.amber, marginLeft: pad * 0.8 }} />
        <div style={{ width: pad * 0.5, height: pad * 0.5, borderRadius: 999, background: BRAND.emerald, marginLeft: pad * 0.4 }} />
        <div style={{ display: "flex", marginLeft: "auto" }}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} style={{ width: 6, height: pad * 0.9, borderRadius: 3, background: "rgba(2,6,23,0.7)", marginLeft: 6 }} />
          ))}
        </div>
      </div>
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          borderRadius: Math.round(width * 0.04),
          background: BRAND.screen,
          border: `${Math.round(width * 0.012)}px solid ${BRAND.bezel}`,
          padding: Math.round(width * 0.045),
        }}
      >
        {children}
      </div>
    </div>
  );
}
