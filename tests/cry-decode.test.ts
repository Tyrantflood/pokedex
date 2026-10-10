import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { decodeOggVorbis } from "../lib/cry-decode";

const cry = readFileSync(new URL("./fixtures/cry-6.ogg", import.meta.url)); // Charizard's cry, as served by PokéAPI's sprites repo

// What Chromium's own decodeAudioData produced for this same file (recorded once; 1 channel, 32,728 Hz, 32,768 samples).
const native = {
  sampleRate: 32728,
  length: 32768,
  peak: 1.0851677656173706,
  rms: 0.4135493340442249,
  points: [0.14509, -0.92198, -0.13953, -0.27922, 0.03401, 0.54352, -0.37008, -0.36866, -0.76713, -0.13746, 0.22249, -0.47397, -0.30142, 0.20796, -0.18544, 0.01239],
};

test("the WebAssembly decoder produces what a browser's own decoder produces for the same cry", async () => {
  const audio = await decodeOggVorbis(new Uint8Array(cry));
  assert.equal(audio.channels.length, 1);
  assert.equal(audio.sampleRate, native.sampleRate);
  const samples = audio.channels[0];
  assert.equal(samples.length, native.length, "same number of samples, so same duration");

  let peak = 0;
  let sum = 0;
  for (const x of samples) {
    assert.ok(Number.isFinite(x));
    peak = Math.max(peak, Math.abs(x));
    sum += x * x;
  }
  assert.ok(Math.abs(peak - native.peak) < 0.005, `peak ${peak} vs ${native.peak}`);
  assert.ok(Math.abs(Math.sqrt(sum / samples.length) - native.rms) < 0.002, "same loudness");
  native.points.forEach((expected, i) => {
    const got = samples[Math.floor(((i + 1) * samples.length) / 17)];
    assert.ok(Math.abs(got - expected) < 0.01, `sample ${i}: ${got} vs ${expected}`);
  });
});

test("it accepts an ArrayBuffer as well as bytes", async () => {
  const copy = cry.buffer.slice(cry.byteOffset, cry.byteOffset + cry.byteLength);
  const audio = await decodeOggVorbis(copy);
  assert.equal(audio.channels[0].length, native.length);
});

test("audio that is not Ogg Vorbis is rejected, never silently turned into silence", async () => {
  await assert.rejects(decodeOggVorbis(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])));
  await assert.rejects(decodeOggVorbis(new Uint8Array(0)));
  await assert.rejects(decodeOggVorbis(new TextEncoder().encode("RIFF....WAVEfmt this is a wav header, not ogg")));
});

test("a truncated cry decodes what is there, or is rejected: it never throws something that is not an error", async () => {
  const half = new Uint8Array(cry.subarray(0, Math.floor(cry.length / 2)));
  const outcome = await decodeOggVorbis(half).then(
    (audio) => audio.channels[0].length,
    (error) => error instanceof Error,
  );
  assert.ok(outcome === true || (typeof outcome === "number" && outcome > 0 && outcome < native.length), `outcome ${String(outcome)}`);
});
