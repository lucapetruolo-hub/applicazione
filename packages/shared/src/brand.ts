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
