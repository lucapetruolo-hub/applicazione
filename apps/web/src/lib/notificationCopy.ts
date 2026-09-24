/**
 * Testo simpatico per il popup "toast" quando arriva una nuova notifica
 * (richiesta esplicita dell'utente: "Fantastico, hai ricevuto un nuovo
 * preventivo" / "Wow, hanno accettato un tuo preventivo" come esempi) —
 * ogni `type` corrisponde sempre allo stesso ruolo destinatario (mai
 * ambiguo), quindi una mappa statica basta, nessuna logica per ruolo.
 */
const NOTIFICATION_COPY: Record<string, { icon: string; message: string }> = {
  NEW_LEAD: { icon: "🎉", message: "Fantastico! Hai ricevuto una nuova richiesta." },
  NEW_QUOTE: { icon: "📬", message: "Hai ricevuto un nuovo preventivo!" },
  QUOTE_ACCEPTED: { icon: "🥳", message: "Wow, hanno accettato un tuo preventivo!" },
  QUOTE_DATE_PROPOSED: { icon: "🗓️", message: "Il cliente ha proposto un'altra data per il preventivo." },
  QUOTE_DATE_CHANGED: { icon: "🗓️", message: "Il professionista ha modificato la data del tuo preventivo." },
  QUOTE_DATE_CONFIRMED: { icon: "✅", message: "Il professionista ha confermato la data che hai proposto!" },
  QUOTE_DATE_REJECTED: { icon: "📅", message: "Il professionista non è disponibile in quella data." },
  JOB_COMPLETED: { icon: "✅", message: "Il professionista ha segnalato il lavoro come terminato." },
  BOOKING_CANCELED_BY_PROFESSIONAL: { icon: "⚠️", message: "Un intervento è stato annullato dal professionista." },
  QUOTE_REJECTED: { icon: "😕", message: "Il cliente ha rifiutato il tuo preventivo." },
  QUOTE_WITHDRAWN: { icon: "↩️", message: "Il professionista ha ritirato il preventivo." },
  LEAD_DECLINED: { icon: "🙁", message: "Un professionista ha rifiutato la tua richiesta." },
  GUIDED_REQUEST_EXPIRED: { icon: "⏱️", message: "La tua richiesta è scaduta senza risposte." },
  BOOKING_NO_SHOW_REPORTED: { icon: "⚠️", message: "Un cliente ha segnalato che non ti sei presentato a un appuntamento." },
  TIMELINE_MESSAGE_FROM_CLIENT: { icon: "💬", message: "Il cliente ti ha scritto un messaggio." },
  TIMELINE_MESSAGE_FROM_PROFESSIONAL: { icon: "💬", message: "Il professionista ti ha scritto un messaggio." },
  BOOKING_REOPENED_BY_CLIENT: { icon: "🔄", message: "Il cliente ha riaperto una prenotazione annullata." },
  BOOKING_REOPENED_BY_PROFESSIONAL: { icon: "🔄", message: "Il professionista ha riaperto una prenotazione annullata." },
  // DSA artt. 16/17 ("Verbale di Conformità", Parte 1 punto 4): esito di una
  // segnalazione contenuti comunicato a chi l'ha presentata, e "statement of
  // reasons" a chi ha scritto un contenuto la cui segnalazione è stata
  // accolta — entrambi generati da AdminService.resolveContentReport.
  CONTENT_REPORT_DECISION: { icon: "🚩", message: "La tua segnalazione è stata esaminata da un amministratore." },
  // Promemoria programmato dall'utente dal menu della scheda (docs/CHANGELOG.md §130).
  REQUEST_REMINDER: { icon: "⏰", message: "Promemoria: hai chiesto di ricordarti questa richiesta." },
  CONTENT_REPORT_UPHELD: { icon: "⚠️", message: "Abbiamo preso una decisione su un tuo contenuto segnalato: tocca per leggere la motivazione." },
  // Esito della contestazione (docs/CHANGELOG.md §144).
  CONTENT_REPORT_REVERTED: { icon: "✅", message: "La misura su un tuo contenuto è stata annullata." },
  // Sospensione/riattivazione decise dalla scheda utente admin (docs/CHANGELOG.md §145).
  ACCOUNT_SUSPENDED: { icon: "⛔", message: "Il tuo account è stato sospeso: controlla la tua email per la motivazione." },
  ACCOUNT_REACTIVATED: { icon: "✅", message: "Il tuo account è di nuovo attivo." },
  CONTENT_REPORT_APPEAL_REJECTED: { icon: "📄", message: "La tua contestazione è stata esaminata: la decisione resta valida." },
};

const DEFAULT_COPY = { icon: "🔔", message: "Hai una nuova notifica." };

export function notificationCopy(type: string): { icon: string; message: string } {
  return NOTIFICATION_COPY[type] ?? DEFAULT_COPY;
}
