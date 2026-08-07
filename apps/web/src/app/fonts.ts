import { Fredoka, IBM_Plex_Mono, Inter_Tight } from "next/font/google";

// Tre ruoli, tre famiglie. Display passato da Archivo (documento tecnico,
// brief "Scheda Intervento") a Fredoka (rotondo, amichevole — brief
// "Vicinato", CLAUDE.md §19): stessa CSS variable `--font-display`, quindi
// packages/ui/src/config.ts (token Tamagui `heading`) non richiede alcuna
// modifica. Testo/mono invariati: il corpo (Inter Tight) è già abbastanza
// neutro/caldo da non richiedere un cambio, il mono resta solo per cifre
// tabulari (prezzi/date), non più voce primaria delle etichette. Self-hosted
// da next/font, nessun CDN esterno.
export const display = Fredoka({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["500", "600", "700"],
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
