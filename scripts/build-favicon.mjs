// Builds app/favicon.ico from the same renders as the tab icons (app/icon.tsx), so the two cannot
// drift apart. Next.js cannot generate a favicon.ico from code, so it is a committed file; rerun
// this after changing the icon design:
//
//   npm run build && npx next start      (in another terminal)
//   node scripts/build-favicon.mjs [http://localhost:3000]
//
// It reads the <link rel="icon"> PNGs the running app advertises and packs them into an ICO
// (PNG-compressed entries, supported by every browser since Windows Vista).
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const base = process.argv[2] ?? "http://localhost:3000";
const out = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "app", "favicon.ico");

const html = await (await fetch(base)).text();
const found = new Map(); // size -> url
for (const [tag] of html.matchAll(/<link\b[^>]*>/g)) {
  if (!/rel="icon"/.test(tag) || !/type="image\/png"/.test(tag)) continue;
  const href = tag.match(/href="([^"]+)"/)?.[1];
  const size = tag.match(/sizes="(\d+)x\1"/)?.[1];
  if (href && size) found.set(Number(size), new URL(href.replaceAll("&amp;", "&"), base).href);
}
if (found.size === 0) throw new Error(`No PNG <link rel="icon"> tags found at ${base}`);

const frames = [];
for (const [size, url] of [...found].sort((a, b) => a[0] - b[0])) {
  const png = Buffer.from(await (await fetch(url)).arrayBuffer());
  if (png.readUInt32BE(0) !== 0x89504e47) throw new Error(`${url} is not a PNG`);
  frames.push({ size, png });
}

const header = Buffer.alloc(6);
header.writeUInt16LE(1, 2); // type: icon
header.writeUInt16LE(frames.length, 4);
const entries = Buffer.alloc(16 * frames.length);
let offset = header.length + entries.length;
frames.forEach(({ size, png }, i) => {
  const e = i * 16;
  entries[e] = size >= 256 ? 0 : size; // width
  entries[e + 1] = size >= 256 ? 0 : size; // height
  entries.writeUInt16LE(1, e + 4); // colour planes
  entries.writeUInt16LE(32, e + 6); // bits per pixel
  entries.writeUInt32LE(png.length, e + 8);
  entries.writeUInt32LE(offset, e + 12);
  offset += png.length;
});
writeFileSync(out, Buffer.concat([header, entries, ...frames.map((f) => f.png)]));
console.log(`wrote ${path.relative(process.cwd(), out)}: ${frames.map((f) => `${f.size}px`).join(", ")} (${offset} bytes)`);
