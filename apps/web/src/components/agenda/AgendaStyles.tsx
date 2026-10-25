"use client";

import { brand } from "@professionisti/ui";
import "./agenda.css";

/**
 * Stile della nuova agenda (docs/CHANGELOG.md §288), scelto dall'utente
 * sulle anteprime: regole della skill Taste (niente ombre a riposo, niente
 * maiuscole spaziate, pulsante principale quasi nero, colore solo per stato
 * e dati) ma sfondo pesca del sito. CSS puro come CalendarShell: griglia
 * oraria e pannelli posizionati che Tamagui da solo non rende bene. Tutte le
 * classi iniziano con `ag-` per non toccare il resto del sito.
 *
 * Le regole stanno in `agenda.css` (§345: un file CSS normale, scaricato
 * insieme alla pagina, invece di ~32 KB di testo dentro il JavaScript da
 * inserire a mano a ogni apertura); qui restano solo i colori del marchio.
 */
const BRAND_VARIABLES = [
  `--ag-ink: ${brand.grafite};`,
  `--ag-muted: ${brand.grafite70};`,
  `--ag-green: ${brand.cianografia};`,
  `--ag-green-dark: ${brand.cianografiaScuro};`,
  `--ag-green-veil: ${brand.cianografiaVelo};`,
  `--ag-brass: ${brand.ottone};`,
  `--ag-brass-dark: ${brand.ottoneScuro};`,
  `--ag-brass-veil: ${brand.ottoneVelo};`,
  `--ag-red: ${brand.urgenza};`,
  `--ag-red-veil: ${brand.urgenzaVelo};`,
  `--ag-filetto: ${brand.filetto};`,
].join("");

export function AgendaStyles() {
  return <style>{`.ag{${BRAND_VARIABLES}}`}</style>;
}
