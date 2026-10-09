import { ImageResponse } from "next/og";
import { BRAND, ReticleMark, ScannerDevice } from "./brand";
import { TYPE_COLORS } from "./type-colors";

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_ALT = "Pokédex: browse every Pokémon and form in a retro DEX-LINK field scanner";

const PILLS = ["fire", "water", "grass", "electric", "psychic", "dragon"] as const;
const BOOT_LINES = ["> SENSOR ARRAY ........ OK", "> SPECIES INDEX ....... OK", "> UPLINK .............. OK"];

/** The 1200x630 link preview, shared by the Open Graph and Twitter image routes. */
export function renderOgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          padding: "0 72px",
          background: `radial-gradient(circle at 26% 52%, rgba(45,212,191,0.2), transparent 55%), ${BRAND.bg}`,
          color: "white",
        }}
      >
        <ScannerDevice width={470} height={440}>
          <div style={{ display: "flex", alignItems: "center", marginBottom: 22 }}>
            <ReticleMark size={78} stroke={2} />
            <div style={{ display: "flex", flexDirection: "column", marginLeft: 20 }}>
              <div style={{ fontSize: 40, letterSpacing: 6, color: BRAND.teal }}>DEX-LINK</div>
              <div style={{ fontSize: 16, letterSpacing: 3, color: "rgba(153,246,228,0.65)", marginTop: 4 }}>FIELD SCANNER · MK I</div>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", fontSize: 19, letterSpacing: 1, color: BRAND.teal }}>
            {BOOT_LINES.map((line) => (
              <div key={line} style={{ marginBottom: 8 }}>
                {line}
              </div>
            ))}
          </div>
          <div style={{ display: "flex", flexDirection: "column", marginTop: "auto" }}>
            <div style={{ fontSize: 22, letterSpacing: 5, color: BRAND.teal, marginBottom: 8 }}>READY</div>
            <div style={{ display: "flex", height: 14, border: "2px solid rgba(94,234,212,0.6)", padding: 2 }}>
              <div style={{ width: "100%", height: "100%", background: BRAND.teal }} />
            </div>
          </div>
        </ScannerDevice>

        <div style={{ display: "flex", flexDirection: "column", marginLeft: 70, flex: 1 }}>
          <div style={{ fontSize: 26, letterSpacing: 8, color: BRAND.tealMid }}>DEX-LINK FIELD SCANNER</div>
          <div style={{ fontSize: 132, lineHeight: 1.05, letterSpacing: -3, marginTop: 14 }}>Pokédex</div>
          <div style={{ fontSize: 40, color: "#cbd5e1", marginTop: 12, lineHeight: 1.25 }}>Every Pokémon and form, scanned.</div>
          <div style={{ display: "flex", flexWrap: "wrap", marginTop: 36 }}>
            {PILLS.map((type) => (
              <div
                key={type}
                style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "7px 15px",
                  borderRadius: 999,
                  border: `2px solid ${TYPE_COLORS[type]}`,
                  background: `${TYPE_COLORS[type]}33`,
                  fontSize: 18,
                  letterSpacing: 2,
                  textTransform: "uppercase",
                  marginRight: 10,
                  marginBottom: 10,
                }}
              >
                <div style={{ width: 11, height: 11, borderRadius: 999, background: TYPE_COLORS[type], marginRight: 9 }} />
                {type}
              </div>
            ))}
          </div>
          <div style={{ fontSize: 22, letterSpacing: 2, color: "#94a3b8", marginTop: 14 }}>Search · Filter · Stats · Evolutions · Cries</div>
        </div>
      </div>
    ),
    { ...OG_SIZE },
  );
}
