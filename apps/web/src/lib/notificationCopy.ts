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
  QUOTE_UPDATED: { icon: "📝", message: "Il professionista ha aggiornato il tuo preventivo (voci, note o modi di pagamento), senza cambiare data e orario." },
  QUOTE_DATE_CONFIRMED: { icon: "✅", message: "Il professionista ha confermato la data che hai proposto!" },
  QUOTE_DATE_REJECTED: { icon: "📅", message: "Il professionista non è disponibile in quella data." },
  JOB_COMPLETED: { icon: "✅", message: "Il professionista ha segnalato il lavoro come terminato." },
  BOOKING_CANCELED_BY_PROFESSIONAL: { icon: "⚠️", message: "Un intervento è stato annullato dal professionista." },
  BOOKING_CANCELED_BY_CLIENT: { icon: "⚠️", message: "Il cliente ha annullato un intervento." },
  QUOTE_REJECTED: { icon: "😕", message: "Il cliente ha rifiutato il tuo preventivo." },
  QUOTE_WITHDRAWN: { icon: "↩️", message: "Il professionista ha ritirato il preventivo." },
  QUOTE_DEPOSIT_REFUNDED: { icon: "↩️", message: "Il preventivo non si poteva più confermare: ti abbiamo rimborsato l'acconto." },
  LEAD_DECLINED: { icon: "🙁", message: "Un professionista ha rifiutato la tua richiesta." },
  GUIDED_REQUEST_EXPIRED: { icon: "⏱️", message: "La tua richiesta è scaduta senza risposte." },
  // Richiesta diretta inoltrata ad altri dopo nessuna risposta (docs/CHANGELOG.md §154).
  REQUEST_FORWARDED: { icon: "📨", message: "Il professionista scelto non ha ancora risposto: abbiamo inoltrato la richiesta anche ad altri professionisti simili." },
  REQUEST_FORWARD_NO_MATCH: { icon: "📭", message: "Il professionista scelto non ha ancora risposto e in zona non ce ne sono altri disponibili per ora." },
  BOOKING_NO_SHOW_REPORTED: { icon: "⚠️", message: "Un cliente ha segnalato che non ti sei presentato a un appuntamento." },
  TIMELINE_MESSAGE_FROM_CLIENT: { icon: "💬", message: "Il cliente ti ha scritto un messaggio." },
  TIMELINE_MESSAGE_FROM_PROFESSIONAL: { icon: "💬", message: "Il professionista ti ha scritto un messaggio." },
  BOOKING_REOPENED_BY_CLIENT: { icon: "🔄", message: "Il cliente ha riaperto una prenotazione annullata." },
  BOOKING_REOPENED_BY_PROFESSIONAL: { icon: "🔄", message: "Il professionista ha riaperto una prenotazione annullata." },
  // Recensione del cliente (docs/CHANGELOG.md §185): pubblica subito (§215).
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
  // Verifica manuale del profilo (docs/CHANGELOG.md §200).
  STRIPE_ACCOUNT_ACTIVE: { icon: "✅", message: "Stripe ha verificato la tua identità: ora puoi offrire l'acconto online nei preventivi." },
  DAC7_DATA_REMINDER: { icon: "🧾", message: "Mancano dei dati per la comunicazione al fisco di gennaio: completali entro dicembre." },
  PAYOUT_IBAN_MISMATCH: { icon: "⚠️", message: "L'IBAN non corrisponde al conto su Stripe: controllalo." },
  DAC7_ANNUAL_NOTICE: { icon: "🧾", message: "Abbiamo inviato al fisco i tuoi compensi dell'anno (DAC7)." },
  STRIPE_ACCOUNT_RESTRICTED: { icon: "⚠️", message: "Stripe ha sospeso i pagamenti online sul tuo account: completa i dati in Dati fiscali e pagamenti." },
  PROFILE_VERIFIED: { icon: "✅", message: "Identità verificata: ora mostri il badge Verificato e puoi inviare preventivi." },
  PROFILE_VERIFICATION_REMOVED: { icon: "⚠️", message: "Abbiamo tolto il badge Verificato dal tuo profilo: rifai la verifica dell'identità." },
  // Verifica fiscale e d'identità (docs/CHANGELOG.md §253).
  IDENTITY_VERIFICATION_DECLINED: { icon: "🪪", message: "La verifica dell'identità non è andata a buon fine: puoi riprovare subito." },
  // Verifica in attesa ripresa e promemoria (§256).
  IDENTITY_VERIFICATION_READY: { icon: "🪪", message: "La verifica dell'identità è di nuovo disponibile: riprendi da dove eri." },
  IDENTITY_VERIFICATION_REMINDER: { icon: "🪪", message: "Ti manca la verifica dell'identità per inviare preventivi: bastano 2 minuti." },
  TAX_ID_INVALID: { icon: "⚠️", message: "Non riusciamo a verificare il codice fiscale o la partita IVA: controllali nei dati fiscali." },
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
  JOB_PAYOUT_SENT: { icon: "✅", message: "Pagamento sbloccato: il bonifico è in arrivo." },
  JOB_PAYOUT_FAILED: { icon: "🏦", message: "Un bonifico non è arrivato alla tua banca: controlla i dati bancari." },
  JOB_PAYOUT_ACCOUNT_NEEDED: { icon: "🏦", message: "Hai un pagamento online da ricevere: attiva i pagamenti in Dati fiscali e pagamenti." },
  JOB_STRIPE_DISPUTE: { icon: "⚠️", message: "Un cliente ha contestato in banca un pagamento online: l'accredito è sospeso finché la banca non decide." },
  ADMIN_JOB_PAYMENT_LONG_HOLD: { icon: "⏳", message: "Un pagamento online è bloccato da quasi 90 giorni: decidi se sbloccarlo o rimborsare." },
  ADMIN_DAC7_NEEDS_CORRECTION: { icon: "⚠️", message: "DAC7: importi cambiati dopo l'invio, l'anno va corretto." },
  ADMIN_STRIPE_DISPUTE: { icon: "⚠️", message: "Contestazione in banca su un pagamento: rispondi con le prove dalla Dashboard Stripe." },
  ADMIN_JOB_BALANCE_UNPAID: { icon: "⚠️", message: "Un cliente non ha pagato il saldo di un lavoro entro 7 giorni." },
  // Solo una parte ha chiuso il lavoro (docs/CHANGELOG.md §190).
  JOB_CONFIRM_REMINDER: { icon: "⏳", message: "Il professionista ha terminato un lavoro: confermalo o segnala un problema." },
  JOB_AUTO_CONFIRMED: { icon: "✅", message: "Un lavoro è stato considerato terminato: non ci hai segnalato problemi in tempo." },
  JOB_CLOSE_REMINDER: { icon: "⏳", message: "Il cliente ha confermato un lavoro terminato: segnalalo anche tu con l'importo finale." },
  JOB_CLOSE_EXPIRED: { icon: "⚠️", message: "Non hai segnato come terminato in tempo un lavoro confermato dal cliente." },
  ADMIN_JOB_NOT_CLOSED: { icon: "⚠️", message: "Un professionista non ha chiuso un lavoro pagato online: soldi ancora bloccati." },
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

/** Appuntamento dal payload (`{ start, end }`): "martedì 14 ottobre, 09:00–13:00" (docs/CHANGELOG.md §228). */
function slotLabel(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const { start, end } = value as { start?: unknown; end?: unknown };
  if (typeof start !== "string") return null;
  const startDate = new Date(start);
  if (Number.isNaN(startDate.getTime())) return null;
  const time = (d: Date) => d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" });
  const day = startDate.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Rome" });
  const endDate = typeof end === "string" ? new Date(end) : null;
  return `${day}, ${time(startDate)}${endDate && !Number.isNaN(endDate.getTime()) ? `–${time(endDate)}` : ""}`;
}

/**
 * Il `payload` serve ai cambi di appuntamento: dice se è cambiata la data,
 * l'orario o entrambi (docs/CHANGELOG.md §180). Le notifiche più vecchie,
 * senza il campo, restano col testo fisso.
 */
export function notificationCopy(type: string, payload?: unknown): { icon: string; message: string } {
  const change = asScheduleChange(payload && typeof payload === "object" ? (payload as Record<string, unknown>).change : null);
  // Stessa data e stesso orario: è stata aggiunta solo una nota (docs/CHANGELOG.md §196).
  const noteOnly = payload && typeof payload === "object" && (payload as Record<string, unknown>).noteOnly === true;
  const rawNote = payload && typeof payload === "object" ? (payload as Record<string, unknown>).note : null;
  const quotedNote = typeof rawNote === "string" && rawNote.trim() ? ` Nota: "${rawNote.trim()}"` : "";
  if (noteOnly && type === "QUOTE_DATE_CHANGED") {
    return { icon: "📝", message: `Il professionista ha aggiunto una nota al tuo preventivo, senza cambiare data e orario.${quotedNote}` };
  }
  if (noteOnly && type === "QUOTE_DATE_PROPOSED") {
    return { icon: "📝", message: `Il cliente ha aggiunto una nota al preventivo, senza cambiare data e orario.${quotedNote}` };
  }
  const data = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  // Nuovo appuntamento nel testo della notifica (docs/CHANGELOG.md §228).
  const newSlot = slotLabel(data.to);
  if (change && type === "QUOTE_DATE_CHANGED") {
    return { icon: "🗓️", message: `Il professionista ha modificato ${scheduleChangeObject(change)} del tuo preventivo${newSlot ? `: ora è ${newSlot}` : ""}.` };
  }
  if (change && type === "QUOTE_DATE_PROPOSED") {
    return { icon: "🗓️", message: `Il cliente ha proposto ${scheduleChangeAlternative(change)} per il preventivo${newSlot ? `: ${newSlot}` : ""}.` };
  }
  if (type === "QUOTE_DATE_REJECTED" && newSlot) {
    return { icon: "📅", message: `Il professionista non è disponibile in quella data: l'appuntamento resta ${newSlot}.` };
  }
  // Nota del rifiuto e nuovo preventivo dopo il rifiuto (docs/CHANGELOG.md §188).
  // Importo finale diverso dal preventivo, col motivo del professionista (docs/CHANGELOG.md §228).
  if (type === "JOB_COMPLETED" && typeof data.changeReason === "string" && data.changeReason.trim()) {
    return { icon: "✅", message: `Il professionista ha segnalato il lavoro come terminato, con un importo diverso dal preventivo: "${data.changeReason.trim()}"` };
  }
  if (type === "NEW_QUOTE" && data.resent === true) {
    return { icon: "📬", message: "Hai ricevuto un nuovo preventivo al posto di quello che avevi rifiutato." };
  }
  if (type === "QUOTE_REJECTED" && (data.note || data.canResend === true)) {
    const note = typeof data.note === "string" && data.note.trim() ? ` Nota: "${data.note.trim()}"` : "";
    const resend = data.canResend === true ? " Puoi inviargli un nuovo preventivo." : "";
    return { icon: "😕", message: `Il cliente ha rifiutato il tuo preventivo.${note}${resend}` };
  }
  return NOTIFICATION_COPY[type] ?? DEFAULT_COPY;
}
