/**
 * Versioni dei Termini di Servizio (punto 12 dei Termini, Reg. UE 2019/1150
 * art. 3; collaudo del 29/10/2026, M-04; docs/changelog/2026-10-30-termini-privacy-obblighi.md).
 *
 * Per cambiare i Termini: aggiungere qui una voce in fondo, con la data in
 * cui la pubblichiamo e quella da cui vale, almeno TERMS_NOTICE_DAYS dopo
 * (lo controlla un test). Dal giorno di pubblicazione l'API manda a tutti
 * gli account l'avviso sul sito e per email (`TermsNoticeService`), una
 * volta sola per versione; la pagina /termini mostra il riquadro e la
 * cronologia. `notify: false` solo per le versioni di prima del lancio.
 */
export type TermsChange = {
  /** Uguale a `publishedAt`, unico. */
  version: string;
  /** AAAA-MM-GG */
  publishedAt: string;
  /** AAAA-MM-GG, da cui valgono. */
  effectiveAt: string;
  /** Cosa cambia, una riga per voce, per l'email e la pagina. */
  summary: string[];
  notify: boolean;
};

/** Preavviso minimo ai professionisti: 15 giorni (P2B art. 3 c. 2). */
export const TERMS_NOTICE_DAYS = 15;

export const TERMS_CHANGES: readonly TermsChange[] = [
  {
    version: "2026-10-30",
    publishedAt: "2026-10-30",
    effectiveAt: "2026-10-30",
    summary: [
      "Le modifiche ai termini si annunciano per email almeno 15 giorni prima.",
      "Nuove regole per i professionisti: ordine dei risultati, sospensione, dati e reclami.",
      "Nuovo punto sul diritto di recesso dei clienti.",
    ],
    // Prima del lancio: nessun avviso agli account di prova.
    notify: false,
  },
];

export function findTermsChange(version: string): TermsChange | undefined {
  return TERMS_CHANGES.find((change) => change.version === version);
}

/** L'ultima versione da annunciare già pubblicata a `today` (AAAA-MM-GG), se c'è. */
export function termsChangeToAnnounce(today: string, changes: readonly TermsChange[] = TERMS_CHANGES): TermsChange | null {
  const published = changes.filter((change) => change.notify && change.publishedAt <= today);
  return published.at(-1) ?? null;
}

/** Data in italiano, "15 novembre 2026". */
export function formatTermsDate(isoDay: string): string {
  return new Date(`${isoDay}T12:00:00Z`).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Rome" });
}
