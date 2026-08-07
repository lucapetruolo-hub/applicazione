import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Immagine di condivisione (link Slack/WhatsApp/social): fondo verde
// smeraldo + marchio + claim, coerente con la direzione "Vicinato"
// (CLAUDE.md §19) — generata con next/og, non un file statico da rifare
// manualmente ad ogni cambio di claim.
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#189A63",
          gap: 32,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: 24,
              background: "#0E7A4C",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg width="40" height="40" viewBox="0 0 28 28">
              <line x1="9" y1="7" x2="9" y2="21" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
              <line x1="9" y1="21" x2="21" y2="21" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
          </div>
          <div style={{ display: "flex", color: "white", fontSize: 56, fontWeight: 700, letterSpacing: -1 }}>
            Professionisti
          </div>
        </div>
        <div style={{ display: "flex", color: "#FDEFE1", fontSize: 30 }}>Descrivi il lavoro. Ricevi un preventivo vero.</div>
      </div>
    ),
    { ...size },
  );
}
