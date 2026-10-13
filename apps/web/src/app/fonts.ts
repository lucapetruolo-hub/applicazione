import localFont from "next/font/local";

// Tre ruoli, tre famiglie. Display passato da Archivo (documento tecnico,
// brief "Scheda Intervento") a Fredoka (rotondo, amichevole — brief
// "Vicinato", CLAUDE.md §19): stessa CSS variable `--font-display`, quindi
// packages/ui/src/config.ts (token Tamagui `heading`) non richiede alcuna
// modifica. Testo/mono invariati: il corpo (Inter Tight) è già abbastanza
// neutro/caldo da non richiedere un cambio, il mono resta solo per cifre
// tabulari (prezzi/date), non più voce primaria delle etichette.
//
// File dei font nel repo (./fonts/, sottoinsieme latino di Google Fonts, gli
// stessi che next/font/google scaricava a ogni build): il build non dipende
// più dalla rete, che a volte falliva con "An error occurred in next/font"
// (docs/CHANGELOG.md §230). Fredoka e Inter Tight sono font variabili: il
// peso dichiarato resta limitato a quelli che si caricavano prima (500-700 e
// 400-600), così un peso fuori intervallo si vede come prima.
export const display = localFont({
  src: "./fonts/fredoka-latin.woff2",
  variable: "--font-display",
  weight: "500 700",
  display: "swap",
});

export const body = localFont({
  src: "./fonts/inter-tight-latin.woff2",
  variable: "--font-body",
  weight: "400 600",
  display: "swap",
});

export const mono = localFont({
  src: "./fonts/ibm-plex-mono-500-latin.woff2",
  variable: "--font-mono",
  weight: "500",
  display: "swap",
});
