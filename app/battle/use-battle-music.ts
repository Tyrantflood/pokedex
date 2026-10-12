"use client";

import { useEffect, useRef } from "react";
import { onCryPlaying } from "@/lib/cry-audio";
import type { ThemeMode } from "@/lib/battle/music-data";
import { MusicPlayer } from "@/lib/battle/music-engine";

/**
 * Drives the battle music from the screen's state. The audio context is only created once `playing` is true, which is after the
 * player pressed Start (a click), so the browser's autoplay rules are satisfied; toggling the music on later is a click too.
 */
export function useBattleMusic(options: { enabled: boolean; volume: number; playing: boolean; mode: ThemeMode; outcome: "win" | "lose" | null }) {
  const { enabled, volume, playing, mode, outcome } = options;
  const player = useRef<MusicPlayer | null>(null);

  useEffect(() => {
    const p = new MusicPlayer();
    player.current = p;
    const stopListening = onCryPlaying((cryPlaying) => p.duck(cryPlaying));
    return () => {
      stopListening();
      p.dispose();
      player.current = null;
    };
  }, []);

  useEffect(() => {
    player.current?.setVolume(volume);
  }, [volume]);

  useEffect(() => {
    player.current?.setMode(mode);
  }, [mode]);

  // Off, or not in a battle yet: silent. Starting happens inside this effect, which React runs right after the click that caused it.
  const wasStarted = useRef(false);
  useEffect(() => {
    const p = player.current;
    if (!p) return;
    if (enabled && playing) {
      void p.start().then((ok) => {
        wasStarted.current = ok;
        p.setVolume(volume);
        p.setMode(mode);
        p.setPaused(false);
      });
    } else if (wasStarted.current) {
      p.setPaused(true);
    }
    // volume and mode are applied by their own effects; only the on/off and in-battle state should (re)start playback
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, playing]);

  const played = useRef<string | null>(null);
  useEffect(() => {
    if (!outcome || !enabled || played.current === outcome) return;
    played.current = outcome;
    player.current?.playJingle(outcome);
  }, [outcome, enabled]);
}
