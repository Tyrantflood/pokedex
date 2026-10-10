/**
 * Cry playback through the Web Audio API, in a form the oscilloscope can read.
 *
 * Why fetch + decodeAudioData instead of an <audio> element: the cry files live on
 * raw.githubusercontent.com. They are served with `Access-Control-Allow-Origin: *`, but
 * an <audio> element loads them in no-CORS mode unless `crossorigin="anonymous"` is set,
 * and a MediaElementSource fed by such an element is muted for analysis (the analyser reads
 * pure silence). fetch() in CORS mode sidesteps that, and a decoded AudioBuffer can be
 * replayed instantly and measured exactly.
 *
 * Decoding tries the browser first (OfflineAudioContext.decodeAudioData). Safari can't decode Ogg Vorbis before macOS 15.4 / iOS 18.4
 * (Apple's release notes say newer versions can; that is not verified on a device here), so when the browser refuses, a WebAssembly
 * Vorbis decoder (lib/cry-decode.ts, its own lazily loaded chunk) takes over. Open the page with `?cry-decoder=wasm` to force that path.
 */

import { decodeOggVorbis } from "./cry-decode";

export type CryErrorReason = "network" | "decode" | "unsupported";

export class CryError extends Error {
  constructor(
    readonly reason: CryErrorReason,
    message: string,
  ) {
    super(message);
    this.name = "CryError";
  }
}

const MAX_CACHED_BUFFERS = 24;
const DECODE_SAMPLE_RATE = 48000;
const OUTPUT_GAIN = 0.7;

// Decoded cries, least recently used first (Map keeps insertion order).
const buffers = new Map<string, AudioBuffer>();
const inflight = new Map<string, Promise<AudioBuffer>>();

/**
 * Fetches and decodes a cry. Cached, and concurrent calls share one request, so it is safe
 * to call early (e.g. when the detail view opens) so that pressing play is instant.
 * Decoding uses an OfflineAudioContext, which needs no user gesture.
 */
export function loadCry(url: string): Promise<AudioBuffer> {
  const cached = buffers.get(url);
  if (cached) {
    buffers.delete(url);
    buffers.set(url, cached);
    return Promise.resolve(cached);
  }
  const pending = inflight.get(url);
  if (pending) return pending;

  const request = (async () => {
    if (typeof OfflineAudioContext === "undefined") throw new CryError("unsupported", "Web Audio isn't available in this browser.");

    let bytes: ArrayBuffer;
    try {
      const res = await fetch(url, { mode: "cors" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      bytes = await res.arrayBuffer();
    } catch {
      throw new CryError("network", "Couldn't load the cry.");
    }

    let buffer: AudioBuffer;
    try {
      buffer = await decodeCry(bytes);
    } catch {
      throw new CryError("decode", "This browser can't decode the cry's Ogg Vorbis audio.");
    }
    buffers.set(url, buffer);
    while (buffers.size > MAX_CACHED_BUFFERS) buffers.delete(buffers.keys().next().value!);
    return buffer;
  })().finally(() => inflight.delete(url));

  inflight.set(url, request);
  return request;
}

const forceWasm = () => typeof location !== "undefined" && new URLSearchParams(location.search).get("cry-decoder") === "wasm";

/** An AudioBuffer from raw samples. The constructor is missing in older Safari; a context can make one there. */
function bufferFrom(channels: Float32Array[], sampleRate: number): AudioBuffer {
  const length = channels[0].length;
  let buffer: AudioBuffer;
  try {
    buffer = new AudioBuffer({ numberOfChannels: channels.length, length, sampleRate });
  } catch {
    buffer = new OfflineAudioContext(channels.length, length, sampleRate).createBuffer(channels.length, length, sampleRate);
  }
  channels.forEach((samples, i) => buffer.copyToChannel(samples as Float32Array<ArrayBuffer>, i));
  return buffer;
}

/** Native decoding first; WebAssembly only when the browser refuses (or when forced for testing). */
async function decodeCry(bytes: ArrayBuffer): Promise<AudioBuffer> {
  if (!forceWasm()) {
    try {
      // decodeAudioData takes the bytes away from you (it detaches the buffer), so give it a copy and keep ours for the fallback.
      return await new OfflineAudioContext(1, 1, DECODE_SAMPLE_RATE).decodeAudioData(bytes.slice(0));
    } catch {
      /* the browser can't decode Ogg Vorbis: fall through to the WebAssembly decoder */
    }
  }
  const audio = await decodeOggVorbis(bytes);
  return bufferFrom(audio.channels, audio.sampleRate);
}

let context: AudioContext | null = null;
function getContext(): AudioContext {
  if (typeof AudioContext === "undefined") throw new CryError("unsupported", "Web Audio isn't available in this browser.");
  context ??= new AudioContext();
  return context;
}

export interface CryPlayback {
  /** Sits directly after the source, before volume, so it sees the cry's true waveform. */
  analyser: AnalyserNode;
  duration: number;
  /** Resolves when playback finishes or is stopped. */
  ended: Promise<void>;
  stop: () => void;
}

let current: CryPlayback | null = null;

/** Stops whichever cry is playing, if any. */
export function stopCry(): void {
  current?.stop();
}

/**
 * Plays a cry. Call from a user gesture (the AudioContext is created/resumed here). Only one
 * cry plays at a time: starting a new one stops the previous.
 */
export async function playCry(url: string): Promise<CryPlayback> {
  stopCry();
  const ctx = getContext();
  const resumed = ctx.resume(); // first thing, while the click still counts as a gesture
  const buffer = await loadCry(url);
  await resumed;

  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  const volume = ctx.createGain();
  volume.gain.value = OUTPUT_GAIN;
  source.connect(analyser);
  analyser.connect(volume);
  volume.connect(ctx.destination);

  let stopped = false;
  const ended = new Promise<void>((resolve) => {
    source.onended = () => {
      // Only the source goes away. The analyser stays connected so it keeps reading the
      // (now silent) signal; disconnecting it would freeze it on its last samples.
      source.disconnect();
      if (current === playback) current = null;
      resolve();
    };
  });
  const playback: CryPlayback = {
    analyser,
    duration: buffer.duration,
    ended,
    stop: () => {
      if (stopped) return;
      stopped = true;
      try {
        source.stop();
      } catch {
        // already stopped
      }
    },
  };
  current = playback;
  source.start();
  return playback;
}
