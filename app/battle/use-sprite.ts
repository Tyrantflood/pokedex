"use client";

import { useEffect, useState } from "react";
import type { Facing } from "@/lib/battle/ids";
import { runChain, spriteTiers, WAITING, type Probe, type Shown, type Size } from "@/lib/battle/sprite-chain";

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

/** The best picture available right now for a Pokémon (see lib/battle/sprite-chain.ts). Never "nothing": a placeholder stands in. */
export function useSprite(spriteId: number, facing: Facing): Shown {
  const key = `${spriteId}:${facing}`;
  const [state, setState] = useState<{ key: string; shown: Shown } | null>(null);
  useEffect(() => runChain(spriteTiers(spriteId, facing), probeImage, (shown) => setState({ key, shown })), [spriteId, facing, key]);
  return state && state.key === key ? state.shown : WAITING;
}
