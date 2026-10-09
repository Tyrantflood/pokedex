import { OG_ALT, OG_SIZE, renderOgImage } from "@/lib/og-image";

// Same picture as the Open Graph image; Twitter/X reads its own tag, so it needs its own route.
export const alt = OG_ALT;
export const size = OG_SIZE;
export const contentType = "image/png";

export default function TwitterImage() {
  return renderOgImage();
}
