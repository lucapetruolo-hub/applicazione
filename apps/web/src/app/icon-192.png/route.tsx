import { ImageResponse } from "next/og";

export const runtime = "edge";

// Icona PWA 192x192 (manifest.ts) — stesso mark di apple-icon.tsx/icon.svg
// (verde smeraldo + glifo bianco a due tratti), generata al volo invece di
// un binario committato a mano, coerente con la convenzione già in uso nel
// resto del sito per le icone di sistema.
export async function GET() {
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
          borderRadius: 48,
        }}
      >
        <svg width="115" height="115" viewBox="0 0 28 28">
          <line x1="9" y1="7" x2="9" y2="21" stroke="white" strokeWidth="2.4" strokeLinecap="round" />
          <line x1="9" y1="21" x2="21" y2="21" stroke="white" strokeWidth="2.4" strokeLinecap="round" />
        </svg>
      </div>
    ),
    { width: 192, height: 192 },
  );
}
