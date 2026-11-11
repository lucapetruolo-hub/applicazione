import localFont from "next/font/local";

// Titoli e testo nello stesso carattere, Figtree (scelta di Luca dell'11/11/2026,
// docs/changelog/2026-11-11-palette-e-figtree.md): pulito e ordinato, più caldo
// e tondo, al posto di Instrument Sans (docs/CHANGELOG.md §304).
// Le due variabili CSS restano separate (`--font-display` per i titoli,
// usata da packages/ui/src/config.ts, e `--font-body` per il testo) ma
// puntano allo stesso file, che il browser scarica una volta sola. Il mono
// resta solo per cifre tabulari (prezzi/date).
//
// File dei font nel repo (./fonts/, sottoinsieme latino di Google Fonts): il
// build non dipende dalla rete, che a volte falliva con "An error occurred in
// next/font" (docs/CHANGELOG.md §230). Figtree è un font variabile 400-700:
// un peso più alto (800) si vede come 700.
export const display = localFont({
  src: "./fonts/figtree-latin.woff2",
  variable: "--font-display",
  weight: "400 700",
  display: "swap",
});

export const body = localFont({
  src: "./fonts/figtree-latin.woff2",
  variable: "--font-body",
  weight: "400 700",
  display: "swap",
});

export const mono = localFont({
  src: "./fonts/ibm-plex-mono-500-latin.woff2",
  variable: "--font-mono",
  weight: "500",
  display: "swap",
});
