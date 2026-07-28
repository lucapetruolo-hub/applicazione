import { Archivo, IBM_Plex_Mono, Inter_Tight } from "next/font/google";

// Tre ruoli, tre famiglie (brief redesign "Scheda Intervento"): display per
// H1-H3/numeri grandi, testo per paragrafi/UI, mono per etichette di campo,
// prezzi, codici commessa. Self-hosted da next/font, nessun CDN esterno.
// Le CSS variable generate qui sono lette da packages/ui/src/config.ts
// (token Tamagui `heading`/`body`/`mono`), applicate su <html> in layout.tsx.
export const display = Archivo({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["600", "700", "800"],
  display: "swap",
});

export const body = Inter_Tight({
  subsets: ["latin"],
  variable: "--font-body",
  weight: ["400", "500", "600"],
  display: "swap",
});

export const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["500"],
  display: "swap",
});
