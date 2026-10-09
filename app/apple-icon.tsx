import { ImageResponse } from "next/og";
import { BRAND, ScannerIcon } from "@/lib/brand";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// iOS rounds the corners itself and fills any transparency with black, so give it a solid square.
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: BRAND.slateDark }}>
        <ScannerIcon size={164} />
      </div>
    ),
    { ...size },
  );
}
