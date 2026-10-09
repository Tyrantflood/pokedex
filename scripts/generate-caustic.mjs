// Generates public/fx/caustic.png: a seamlessly tiling water-caustics pattern (thin bright
// light network on transparent). Used by the Water theme in the detail view, drifting as two
// transform-only layers. Pre-rendering it means no runtime cost, unlike an SVG turbulence
// filter (profiled at ~1,300 ms/s of raster time on a phone-sized viewport).
//
// Run: node scripts/generate-caustic.mjs
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const SIZE = 192;
const TAU = Math.PI * 2;

// Every wave has an integer frequency in u and v, so the tile repeats seamlessly.
function intensity(u, v) {
  const wx = u + 0.055 * Math.sin(TAU * (2 * v + 0.13)) + 0.035 * Math.sin(TAU * (3 * v + u));
  const wy = v + 0.055 * Math.sin(TAU * (2 * u + 0.71)) + 0.035 * Math.sin(TAU * (3 * u - v));
  const sum =
    Math.sin(TAU * 3 * wx) + Math.sin(TAU * 3 * wy + 1.3) + Math.sin(TAU * (wx + wy) * 2 + 0.4) + Math.sin(TAU * (wx - wy) * 2 + 2.1);
  // Bright where the waves cancel out: a thin, branching network of light.
  return Math.pow(1 - Math.min(1, (Math.abs(sum) / 4) * 2.2), 6);
}

const raw = Buffer.alloc((SIZE * 4 + 1) * SIZE);
for (let y = 0; y < SIZE; y++) {
  raw[y * (SIZE * 4 + 1)] = 0; // filter: none
  for (let x = 0; x < SIZE; x++) {
    const i = y * (SIZE * 4 + 1) + 1 + x * 4;
    raw[i] = 200;
    raw[i + 1] = 235;
    raw[i + 2] = 255;
    raw[i + 3] = Math.round(intensity(x / SIZE, y / SIZE) * 255);
  }
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // RGBA
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("IDAT", deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);

const out = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public", "fx", "caustic.png");
mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, png);
console.log(`wrote ${path.relative(process.cwd(), out)} (${png.length} bytes, ${SIZE}x${SIZE})`);
