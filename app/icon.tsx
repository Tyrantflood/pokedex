import { ImageResponse } from "next/og";
import { ScannerIcon } from "@/lib/brand";

// Browser-tab icon at the sizes tabs actually ask for. app/favicon.ico (for crawlers and old
// browsers) is built from these same renders; see scripts/build-favicon.mjs.
const SIZES = [16, 32, 48];

export function generateImageMetadata() {
  return SIZES.map((s) => ({ id: String(s), size: { width: s, height: s }, contentType: "image/png", alt: "Pokédex" }));
}

export default async function Icon({ id }: { id: Promise<string | number> }) {
  const size = Number(await id);
  return new ImageResponse(<ScannerIcon size={size} />, { width: size, height: size });
}
