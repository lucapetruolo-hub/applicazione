/**
 * Cosa succede chiudendo l'account, detto prima di "Elimina definitivamente"
 * (collaudo B-01, P-06, docs/changelog/2026-11-02-collaudo-accettazione-e-chiusure.md).
 * `blockers`: frasi da mostrare così come sono; finché ce n'è una l'account
 * non si chiude (il server lo rifiuta comunque). `jobsToCancel`: appuntamenti
 * non ancora cominciati che si annullano da soli, con l'avviso all'altra parte.
 */
export type AccountClosureCheck = {
  blockers: string[];
  jobsToCancel: { id: string; withName: string; scheduledAt: string }[];
  /** Professionista con un abbonamento in corso: si annulla subito, senza altri addebiti (collaudo dell'8/11/2026, E1-01). */
  subscriptionEndsNow?: boolean;
};

/** Nota sul lavoro annullato perché il cliente ha chiuso l'account. */
export const CLIENT_ACCOUNT_CLOSED_NOTE = "Il cliente ha chiuso il suo account.";
