export interface DecodedAudio {
  /** One Float32Array per channel, samples in -1..1. */
  channels: Float32Array[];
  sampleRate: number;
}

/**
 * Decodes Ogg Vorbis in WebAssembly (libvorbis), for browsers whose Web Audio can't decode it itself: before macOS 15.4 and
 * iOS 18.4, Safari can't. The decoder is a separate chunk that is only downloaded on the first cry that native decoding refuses,
 * so browsers that decode Ogg Vorbis natively (Chrome, Firefox, current Safari) never fetch it.
 */
export async function decodeOggVorbis(bytes: ArrayBuffer | Uint8Array): Promise<DecodedAudio> {
  const { OggVorbisDecoder } = await import("@wasm-audio-decoders/ogg-vorbis");
  const decoder = new OggVorbisDecoder();
  try {
    await decoder.ready;
    const { channelData, samplesDecoded, sampleRate, errors } = await decoder.decodeFile(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
    if (samplesDecoded === 0 || channelData.length === 0) throw new Error(errors[0]?.message ?? "No audio could be decoded");
    return { channels: channelData, sampleRate };
  } finally {
    decoder.free();
  }
}
