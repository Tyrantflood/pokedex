import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // The WebAssembly Vorbis decoder (lib/cry-decode.ts) is only ever imported in the browser, on demand. Its Web Worker variant
  // pulls in a Node-only dynamic import that Turbopack can't resolve while it prepares the server render of that import, so the
  // server leaves these packages alone (it never runs them); the browser build still bundles them as their own chunk.
  serverExternalPackages: ["@wasm-audio-decoders/ogg-vorbis", "@wasm-audio-decoders/common", "@eshaz/web-worker", "codec-parser"],
};

export default nextConfig;
