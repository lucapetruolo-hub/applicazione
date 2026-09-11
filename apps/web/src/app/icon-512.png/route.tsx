import { ImageResponse } from "next/og";

export const runtime = "edge";

// Icona PWA 512x512 (manifest.ts, richiesta anche "maskable" da Android per
// l'icona a schermo intero) — stesso mark di icon-192.png/apple-icon.tsx.
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
          borderRadius: 128,
        }}
      >
        <svg width="308" height="308" viewBox="0 0 28 28">
          <line x1="9" y1="7" x2="9" y2="21" stroke="white" strokeWidth="2.4" strokeLinecap="round" />
          <line x1="9" y1="21" x2="21" y2="21" stroke="white" strokeWidth="2.4" strokeLinecap="round" />
        </svg>
      </div>
    ),
    { width: 512, height: 512 },
  );
}
