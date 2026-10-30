/**
 * Nome del marchio e contatti mostrati nel sito (web, API, email).
 * "Professionisti" è provvisorio e cambierà prima del lancio (checklist
 * lancio, punto 21): per i testi basta cambiarlo qui.
 *
 * Restano fuori da questo file perché non possono importarlo:
 * - le immagini del logo: `apps/web/src/app/icon.svg`, `icon-192.png`,
 *   `icon-512.png`, `apple-icon.tsx`, `opengraph-image.tsx` (disegno del
 *   marchio) e `packages/ui/src/Logo*.tsx` (solo il disegno, il nome arriva
 *   da qui);
 * - l'app mobile: `apps/mobile/app.json` (`name`);
 * - il mittente delle email: `RESEND_FROM_EMAIL` su Render.
 */
export const BRAND = {
  name: "Professionisti",
  /** Indirizzo di assistenza mostrato in email e pagine: provvisorio come il nome (checklist punto 21bis). */
  supportEmail: "supporto@professionisti.it",
  /** Frase che accompagna il nome nel titolo della home e nell'app installata. */
  tagline: "Trova un professionista vicino a te",
} as const;

/**
 * Dati della società che gestisce il sito (D.Lgs. 70/2003 art. 7, GDPR
 * art. 13, c.c. art. 2250; collaudo del 29/10/2026, M-01). Un solo punto da
 * compilare prima del lancio (checklist di lancio): li leggono Privacy,
 * Note legali, Contatti, Accessibilità e il piede del sito. Finché restano
 * i segnaposto, il piede non li mostra (`companyDataReady`).
 */
export const COMPANY = {
  legalName: "[DA COMPILARE: ragione sociale]",
  address: "[DA COMPILARE: sede legale]",
  vatNumber: "[DA COMPILARE: P.IVA e codice fiscale]",
  /** Numero di iscrizione al Registro delle Imprese (REA) e capitale sociale versato, se società di capitali. */
  rea: "[DA COMPILARE: numero REA e capitale sociale]",
  pec: "[DA COMPILARE: PEC]",
  /** Indirizzo per i diritti sulla privacy (GDPR artt. 15-22). */
  privacyEmail: "[DA COMPILARE: email privacy]",
} as const;

export function companyDataReady(): boolean {
  return !Object.values(COMPANY).some((value) => value.startsWith("[DA COMPILARE"));
}
