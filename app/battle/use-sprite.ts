"use client";

import { useEffect, useState } from "react";
import type { Facing } from "@/lib/battle/ids";
import { measureSpriteBounds } from "@/lib/sprite-bounds";
import { fitStaticToBox, parseGifSize, type Placement } from "@/lib/battle/sprite-fit";
import { gifCounterpart, runChain, spriteTiers, WAITING, type Probe, type Shown, type Size } from "@/lib/battle/sprite-chain";

const PROBE_TIMEOUT_MS = 10000;

// Pictures that loaded this session, so switching a Pokémon back in shows it at once.
const known = new Map<string, Size>();

/** Loads an image in the background: its size, or null when it fails or takes longer than the timeout. */
export const probeImage: Probe = (url) => {
  const cached = known.get(url);
  if (cached) return Promise.resolve(cached);
  return new Promise((resolve) => {
    const img = new Image();
    let finished = false;
    const finish = (size: Size | null) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      img.onload = null;
      img.onerror = null;
      if (size) known.set(url, size);
      resolve(size);
    };
    const timer = setTimeout(() => {
      img.src = ""; // give up on the download
      finish(null);
    }, PROBE_TIMEOUT_MS);
    img.onload = () => finish(img.naturalWidth > 0 ? { w: img.naturalWidth, h: img.naturalHeight } : null);
    img.onerror = () => finish(null);
    img.src = url;
  });
};

const gifSizes = new Map<string, Promise<Size | null>>();

/** A GIF's size from its first bytes alone (a ranged request, cancelled as soon as ten bytes have arrived), long before the GIF has downloaded. */
export function fetchGifSize(url: string): Promise<Size | null> {
  let pending = gifSizes.get(url);
  if (!pending) {
    pending = (async () => {
      try {
        const response = await fetch(url, { headers: { Range: "bytes=0-15" } });
        const reader = response.body?.getReader();
        if (!reader) return null;
        let bytes = new Uint8Array(0);
        while (bytes.length < 10) {
          const { done, value } = await reader.read();
          if (done) break;
          const joined = new Uint8Array(bytes.length + value.length);
          joined.set(bytes);
          joined.set(value, bytes.length);
          bytes = joined;
        }
        void reader.cancel().catch(() => {});
        return parseGifSize(bytes);
      } catch {
        return null;
      }
    })();
    gifSizes.set(url, pending);
  }
  return pending;
}

export interface SpriteView extends Shown {
  /** Set while a static sprite stands in for a GIF that is still downloading: where to draw it so it fills the GIF's box. */
  fit: Placement | null;
}

/** The best picture available right now for a Pokémon (see lib/battle/sprite-chain.ts). Never "nothing": a placeholder stands in. */
export function useSprite(spriteId: number, facing: Facing): SpriteView {
  const key = `${spriteId}:${facing}`;
  const [state, setState] = useState<{ key: string; shown: Shown } | null>(null);
  const [fitState, setFitState] = useState<{ url: string; fit: Placement | null } | null>(null);
  useEffect(() => runChain(spriteTiers(spriteId, facing), probeImage, (shown) => setState({ key, shown })), [spriteId, facing, key]);
  const shown = state && state.key === key ? state.shown : WAITING;

  // A static sprite shown in place of a GIF that has not arrived: work out where it must sit to fill the GIF's box.
  const png = shown.candidate.kind === "png" ? shown.candidate : null;
  const gif = png ? gifCounterpart(spriteTiers(spriteId, facing), png) : null;
  const pngUrl = png?.url ?? null;
  const gifUrl = gif?.url ?? null;
  useEffect(() => {
    if (!pngUrl || !gifUrl) return;
    let alive = true;
    Promise.all([fetchGifSize(gifUrl), measureSpriteBounds(pngUrl)])
      .then(([box, bounds]) => {
        if (alive) setFitState({ url: pngUrl, fit: box && bounds.measured ? fitStaticToBox(bounds, box) : null });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [pngUrl, gifUrl]);
  return { ...shown, fit: png && fitState?.url === png.url ? fitState.fit : null };
}
