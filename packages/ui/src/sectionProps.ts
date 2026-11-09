import type { ReactNode } from "react";

// Tipi di Section in un file a parte: li usano sia Section.tsx (app) sia
// Section.web.tsx (sito), che non possono importarsi a vicenda.
export type SectionTone = "light" | "dark" | "blueprint";

// Niente etichetta sopra il titolo né parole colorate dentro il titolo: sono
// tra i segni tipici dei siti fatti con l'IA (docs/CHANGELOG.md §304).
export type SectionProps = {
  title?: string;
  lead?: string;
  /** Comando accanto al titolo, allineato a destra (es. "Mostra tutte"). */
  titleAction?: ReactNode;
  tone?: SectionTone;
  maxWidth?: number;
  /**
   * Il titolo è il titolo della pagina: esce come `<h1>` (uno per pagina,
   * per Google e per i lettori di schermo), con lo stesso aspetto dell'H2.
   */
  pageTitle?: boolean;
  children?: ReactNode;
};


/** Ritmo verticale delle sezioni: vedi `SectionDensityProvider`. */
export type SectionDensity = "comfortable" | "compact";
