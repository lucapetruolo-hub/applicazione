import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// Apple richiede un PNG raster (l'icon.svg in questa stessa cartella copre
// invece favicon/icona tab, dove Next.js accetta SVG direttamente) — generato
// con next/og invece di un file binario committato a mano, stesso mark del
// logo (verde smeraldo + glifo bianco a due tratti, vedi packages/ui/src/Logo.tsx).
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#189A63",
          borderRadius: 46,
        }}
      >
        <svg width="108" height="108" viewBox="0 0 28 28">
          <line x1="9" y1="7" x2="9" y2="21" stroke="white" strokeWidth="2.4" strokeLinecap="round" />
          <line x1="9" y1="21" x2="21" y2="21" stroke="white" strokeWidth="2.4" strokeLinecap="round" />
        </svg>
      </div>
    ),
    { ...size },
  );
}
