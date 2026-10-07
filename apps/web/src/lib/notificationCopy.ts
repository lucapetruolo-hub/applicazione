import { asScheduleChange, scheduleChangeAlternative, scheduleChangeObject } from "@professionisti/shared";

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
  // Richiesta diretta inoltrata ad altri dopo nessuna risposta (docs/CHANGELOG.md §154).
  REQUEST_FORWARDED: { icon: "📨", message: "Il professionista scelto non ha risposto: abbiamo inoltrato la richiesta ad altri professionisti simili." },
  REQUEST_FORWARD_NO_MATCH: { icon: "📭", message: "Il professionista scelto non ha risposto e in zona non ce ne sono altri disponibili per ora." },
  BOOKING_NO_SHOW_REPORTED: { icon: "⚠️", message: "Un cliente ha segnalato che non ti sei presentato a un appuntamento." },
  TIMELINE_MESSAGE_FROM_CLIENT: { icon: "💬", message: "Il cliente ti ha scritto un messaggio." },
  TIMELINE_MESSAGE_FROM_PROFESSIONAL: { icon: "💬", message: "Il professionista ti ha scritto un messaggio." },
  BOOKING_REOPENED_BY_CLIENT: { icon: "🔄", message: "Il cliente ha riaperto una prenotazione annullata." },
  BOOKING_REOPENED_BY_PROFESSIONAL: { icon: "🔄", message: "Il professionista ha riaperto una prenotazione annullata." },
  // Recensione del cliente (docs/CHANGELOG.md §185): mai il voto, per il "doppio cieco".
  NEW_REVIEW: { icon: "⭐", message: "Un cliente ha recensito un tuo lavoro: la sua recensione è ora visibile." },
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
  // Segnalazioni di un problema sul lavoro (docs/CHANGELOG.md §164).
  JOB_ISSUE_REPORTED: { icon: "⚠️", message: "Un cliente ha segnalato un problema su un lavoro: rispondigli in chat entro 48 ore per trovare una soluzione." },
  JOB_ISSUE_SETTLED: { icon: "🤝", message: "Il cliente ha indicato che il problema è stato risolto con te." },
  JOB_ISSUE_ESCALATED: { icon: "⚖️", message: "Il cliente ha chiesto al nostro team di decidere sulla segnalazione: invia la tua versione entro 72 ore." },
  // Controversie standard (docs/CHANGELOG.md §167).
  JOB_ISSUE_AUTO_ESCALATED: { icon: "⚖️", message: "Non hai risposto in chat entro 48 ore: la segnalazione è passata al nostro team. Invia la tua versione entro 72 ore." },
  JOB_ISSUE_TEAM_REVIEW: { icon: "⚖️", message: "Il professionista non ti ha risposto entro 48 ore: la tua segnalazione è passata al nostro team." },
  JOB_ISSUE_INFO_REQUESTED: { icon: "📝", message: "Il nostro team ti chiede altre informazioni su una segnalazione: rispondi entro 72 ore." },
  JOB_ISSUE_APPEAL_DECIDED: { icon: "⚖️", message: "C'è una decisione sul ricorso contro una segnalazione: tocca per leggerla." },
  JOB_ISSUE_UNRESOLVED: { icon: "🤝", message: "Il cliente ha indicato che non avete trovato un accordo sulla segnalazione (pagamento diretto)." },
  // Pagamenti online dei lavori (docs/CHANGELOG.md §168).
  JOB_DEPOSIT_PAID: { icon: "💳", message: "Il cliente ha pagato l'acconto online per un lavoro." },
  JOB_BALANCE_PAID: { icon: "💳", message: "Il cliente ha pagato il saldo online: riceverai l'accredito alla sua conferma o entro 7 giorni." },
  JOB_BALANCE_DUE: { icon: "💳", message: "Il lavoro è chiuso: paga il saldo online per completare il pagamento." },
  JOB_BALANCE_UNPAID: { icon: "⚠️", message: "Il saldo di un lavoro non risulta pagato: pagalo ora o contattaci." },
  JOB_PAYOUT_SENT: { icon: "✅", message: "Abbiamo accreditato il pagamento di un lavoro sul tuo conto Stripe." },
  JOB_PAYOUT_ACCOUNT_NEEDED: { icon: "🏦", message: "Hai un pagamento online da ricevere: attiva i pagamenti in Dati fiscali e pagamenti." },
  ADMIN_JOB_BALANCE_UNPAID: { icon: "⚠️", message: "Un cliente non ha pagato il saldo di un lavoro entro 7 giorni." },
  JOB_ISSUE_SANCTION: { icon: "⛔", message: "Una segnalazione accolta comporta una misura sul tuo profilo: tocca per i dettagli." },
  JOB_ISSUE_RESOLVED: { icon: "⚖️", message: "C'è una decisione su una segnalazione di un lavoro: tocca per leggerla." },
  // Abbonamento a livelli (docs/CHANGELOG.md §161).
  SUBSCRIPTION_BONUS_MONTH: { icon: "🎁", message: "Sorpresa: ti regaliamo un altro mese gratis!" },
  SUBSCRIPTION_TRIAL_ENDING: { icon: "⏳", message: "Il tuo mese gratuito sta per finire: scegli un livello per restare visibile nelle ricerche." },
  SUBSCRIPTION_LIMIT_NEAR: { icon: "📈", message: "Ti stai avvicinando ai lavori compresi nel tuo livello questo mese." },
  SUBSCRIPTION_LIMIT_REACHED: { icon: "🏁", message: "Hai raggiunto i lavori compresi questo mese: il profilo è fuori dalle ricerche. Passa al livello superiore pagando solo la differenza." },
  SUBSCRIPTION_PAUSED: { icon: "⏸️", message: "Il tuo account è in pausa: scegli un livello per renderlo di nuovo visibile e operativo." },
  SUBSCRIPTION_RENEWING: { icon: "🔁", message: "Il tuo abbonamento si rinnova automaticamente tra pochi giorni." },
  SUBSCRIPTION_RENEWED: { icon: "✅", message: "Abbonamento rinnovato: grazie!" },
  SUBSCRIPTION_ENDING: { icon: "⏳", message: "Il tuo abbonamento annullato finisce tra pochi giorni: puoi riattivarlo quando vuoi." },
  SUBSCRIPTION_PAYMENT_FAILED: { icon: "⚠️", message: "Pagamento dell'abbonamento non riuscito: controlla il metodo di pagamento." },
  CONTENT_REPORT_APPEAL_REJECTED: { icon: "📄", message: "La tua contestazione è stata esaminata: la decisione resta valida." },
};

const DEFAULT_COPY = { icon: "🔔", message: "Hai una nuova notifica." };

/**
 * Il `payload` serve ai cambi di appuntamento: dice se è cambiata la data,
 * l'orario o entrambi (docs/CHANGELOG.md §180). Le notifiche più vecchie,
 * senza il campo, restano col testo fisso.
 */
export function notificationCopy(type: string, payload?: unknown): { icon: string; message: string } {
  const change = asScheduleChange(payload && typeof payload === "object" ? (payload as Record<string, unknown>).change : null);
  if (change && type === "QUOTE_DATE_CHANGED") {
    return { icon: "🗓️", message: `Il professionista ha modificato ${scheduleChangeObject(change)} del tuo preventivo.` };
  }
  if (change && type === "QUOTE_DATE_PROPOSED") {
    return { icon: "🗓️", message: `Il cliente ha proposto ${scheduleChangeAlternative(change)} per il preventivo.` };
  }
  // Nota del rifiuto e nuovo preventivo dopo il rifiuto (docs/CHANGELOG.md §188).
  const data = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  if (type === "NEW_QUOTE" && data.resent === true) {
    return { icon: "📬", message: "Hai ricevuto un nuovo preventivo al posto di quello che avevi rifiutato." };
  }
  if (type === "QUOTE_REJECTED" && (data.note || data.canResend === true)) {
    const note = typeof data.note === "string" && data.note.trim() ? ` Nota: "${data.note.trim()}"` : "";
    const resend = data.canResend === true ? " Puoi inviargli un nuovo preventivo." : "";
    return { icon: "😕", message: `Il cliente ha rifiutato il tuo preventivo.${note}${resend}` };
  }
  if (type === "NEW_REVIEW" && (payload as Record<string, unknown> | undefined)?.published !== true) {
    return { icon: "⭐", message: "Un cliente ha recensito un tuo lavoro: recensiscilo anche tu per leggere la sua recensione." };
  }
  return NOTIFICATION_COPY[type] ?? DEFAULT_COPY;
}
