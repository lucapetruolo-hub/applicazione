import { asScheduleChange, formatAppointmentDate, formatAppointmentTimeRange, scheduleChangeAlternative, scheduleChangeObject } from "@professionisti/shared";

/**
 * Testo simpatico per il popup "toast" quando arriva una nuova notifica
 * (richiesta esplicita dell'utente: "Fantastico, hai ricevuto un nuovo
 * preventivo" / "Wow, hanno accettato un tuo preventivo" come esempi) —
 * ogni `type` corrisponde sempre allo stesso ruolo destinatario (mai
 * ambiguo), quindi una mappa statica basta, nessuna logica per ruolo.
 */
const NOTIFICATION_COPY: Record<string, { icon: string; message: string }> = {
  // Richieste, preventivi e accettazioni dicono chi e quale lavoro quando il
  // payload lo porta (docs/CHANGELOG.md §349, vedi `notificationCopy`); questi
  // sono i testi di riserva per le notifiche più vecchie.
  NEW_LEAD: { icon: "🎉", message: "Hai ricevuto una nuova richiesta." },
  NEW_QUOTE: { icon: "📬", message: "Hai ricevuto un nuovo preventivo." },
  QUOTE_ACCEPTED: { icon: "🥳", message: "Il cliente ha accettato il tuo preventivo." },
  QUOTE_DATE_PROPOSED: { icon: "🗓️", message: "Il cliente ha proposto un'altra data per il preventivo." },
  QUOTE_DATE_CHANGED: { icon: "🗓️", message: "Il professionista ha modificato la data del tuo preventivo." },
  QUOTE_UPDATED: { icon: "📝", message: "Il professionista ha aggiornato il tuo preventivo (voci, note o modi di pagamento), senza cambiare data e orario." },
  QUOTE_DATE_CONFIRMED: { icon: "✅", message: "Il professionista ha confermato la data che hai proposto." },
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
  // Richiesta senza destinatari arrivata a un professionista iscritto dopo (docs/CHANGELOG.md §271).
  REQUEST_MATCHED_LATER: { icon: "🙌", message: "Un professionista compatibile ha ricevuto la tua richiesta." },
  REQUEST_FORWARD_NO_MATCH: { icon: "📭", message: "Il professionista scelto non ha ancora risposto e in zona non ce ne sono altri disponibili per ora." },
  BOOKING_NO_SHOW_REPORTED: { icon: "⚠️", message: "Un cliente ha segnalato che non ti sei presentato a un appuntamento." },
  TIMELINE_MESSAGE_FROM_CLIENT: { icon: "💬", message: "Il cliente ti ha scritto un messaggio." },
  TIMELINE_MESSAGE_FROM_PROFESSIONAL: { icon: "💬", message: "Il professionista ti ha scritto un messaggio." },
  BOOKING_REOPENED_BY_CLIENT: { icon: "🔄", message: "Il cliente ha riaperto una prenotazione annullata." },
  BOOKING_REOPENED_BY_PROFESSIONAL: { icon: "🔄", message: "Il professionista ha riaperto una prenotazione annullata." },
  // Recensione del cliente (docs/CHANGELOG.md §185): pubblica subito (§215).
  NEW_REVIEW: { icon: "⭐", message: "Un cliente ha recensito un tuo lavoro: la sua recensione è ora visibile." },
  // DSA art. 16 c. 4-5 (docs/CHANGELOG.md §319): a chi segnala la presa in
  // carico e, solo per un contenuto illegale, l'esito; a chi ha scritto il
  // contenuto la motivazione (art. 17, CONTENT_REPORT_UPHELD).
  CONTENT_REPORT_RECEIVED: { icon: "🚩", message: "Abbiamo preso in carico la tua segnalazione." },
  CONTENT_REPORT_DECISION: { icon: "🚩", message: "Abbiamo esaminato la tua segnalazione: trovi l'esito nell'email." },
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
  IDENTITY_VERIFICATION_EXPIRING: { icon: "🪪", message: "Il documento della tua verifica sta per scadere: rinnovala per tenere il badge Verificato." },
  IDENTITY_VERIFICATION_REMINDER: { icon: "🪪", message: "Ti manca la verifica dell'identità per inviare preventivi: bastano 2 minuti." },
  // "Completa il profilo" il giorno dopo l'iscrizione (§261).
  PROFILE_SETUP_REMINDER: { icon: "📋", message: "Ti manca poco per completare il profilo: in Oggi trovi il prossimo passo." },
  // Agenda vuota o senza disponibilità nei prossimi giorni (§274): il testo dipende dal payload, vedi sotto.
  AGENDA_REMINDER: { icon: "📅", message: "Non hai ancora orari liberi in agenda: aggiungili per farti prenotare." },
  // Agenda (§288).
  PROFESSIONAL_ON_THE_WAY: { icon: "🚐", message: "Il professionista sta arrivando." },
  AGENDA_TOMORROW_SUMMARY: { icon: "📅", message: "Ecco i tuoi lavori di domani." },
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
  JOB_BALANCE_AUTO_CHARGED: { icon: "💳", message: "Il lavoro è chiuso: il saldo è stato addebitato sulla carta dell'acconto." },
  JOB_BALANCE_UNPAID: { icon: "⚠️", message: "Il saldo di un lavoro non risulta pagato: pagalo ora o contattaci." },
  JOB_PAYOUT_SENT: { icon: "✅", message: "Pagamento sbloccato: il bonifico è in arrivo." },
  JOB_PAYOUT_FAILED: { icon: "🏦", message: "Un bonifico non è arrivato alla tua banca: controlla i dati bancari." },
  JOB_PAYOUT_ACCOUNT_NEEDED: { icon: "🏦", message: "Hai un pagamento online da ricevere: attiva i pagamenti in Dati fiscali e pagamenti." },
  JOB_STRIPE_DISPUTE: { icon: "⚠️", message: "Un cliente ha contestato in banca un pagamento online: scrivi come è andato il lavoro nella scheda, sotto il pagamento." },
  // Rimborso in attesa di fondi sul conto Stripe del professionista (§269).
  JOB_REFUND_PENDING: { icon: "↩️", message: "Il tuo rimborso è in arrivo: ti avvisiamo appena parte verso la carta." },
  JOB_REFUND_COMPLETED: { icon: "↩️", message: "Rimborso completato: lo rivedi sulla carta in pochi giorni." },
  JOB_REFUND_WAITING_FUNDS: { icon: "💳", message: "Un rimborso al cliente aspetta fondi sul tuo conto Stripe: parte appena arrivano." },
  ADMIN_JOB_REFUND_FAILED: { icon: "⚠️", message: "Un rimborso al cliente non è riuscito: controllalo dalla Dashboard Stripe." },
  ONLINE_LIMIT_LIFTED: { icon: "✅", message: "Limite tolto: nei preventivi puoi chiedere online qualsiasi importo." },
  ADMIN_STRIPE_ACCOUNT_UNREADABLE: { icon: "⚠️", message: "Il sito non riesce a leggere su Stripe lo stato del conto di un professionista." },
  JOB_PAYMENT_DEBT: { icon: "💳", message: "Hai un importo da restituire su un lavoro: lo tratteniamo dai tuoi prossimi pagamenti online." },
  ADMIN_JOB_PAYMENT_LONG_HOLD: { icon: "⏳", message: "Un pagamento online è bloccato da quasi 90 giorni: decidi se sbloccarlo o rimborsare." },
  ADMIN_DAC7_NEEDS_CORRECTION: { icon: "⚠️", message: "DAC7: importi cambiati dopo l'invio, l'anno va corretto." },
  ADMIN_URGENCY_ALERT: { icon: "⚡", message: "Richieste urgenti fuori soglia questa settimana: guarda i numeri nell'area admin." },
  ADMIN_SEARCH_DEMAND_ALERT: { icon: "🔎", message: "Questa settimana alcune ricerche non hanno trovato nessun professionista vicino: guarda dove." },
  ADMIN_WEEKLY_ADVICE: { icon: "💡", message: "Sono pronti i consigli della settimana: cosa fare, già deciso dai numeri." },
  ADMIN_STRIPE_DISPUTE: { icon: "⚠️", message: "Contestazione in banca su un pagamento: rileggi e manda le prove da Pagamenti." },
  JOB_STRIPE_DISPUTE_NOTE_DUE: { icon: "⏳", message: "Contestazione in banca: scrivi come è andato il lavoro, mancano pochi giorni all'invio delle prove." },
  ADMIN_STRIPE_DISPUTE_DUE: { icon: "⏳", message: "Scadenza vicina: le prove di una contestazione in banca non sono ancora partite." },
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
  SUBSCRIPTION_BONUS_MONTH: { icon: "🎁", message: "Ti regaliamo un altro mese gratis." },
  SUBSCRIPTION_TRIAL_ENDING: { icon: "⏳", message: "Il tuo periodo gratuito sta per finire: scegli un livello per restare visibile nelle ricerche." },
  SUBSCRIPTION_LIMIT_NEAR: { icon: "📈", message: "Ti stai avvicinando ai lavori compresi nel tuo livello." },
  // Lavori esauriti: il profilo resta nelle ricerche (docs/CHANGELOG.md §362).
  SUBSCRIPTION_LIMIT_REACHED: { icon: "🏁", message: "Hai esaurito i lavori del tuo abbonamento: resti nelle ricerche, ma per mandare preventivi nuovi passa al livello superiore." },
  SUBSCRIPTION_PAUSED: { icon: "⏸️", message: "Il tuo account è in pausa: scegli un livello per renderlo di nuovo visibile e operativo." },
  SUBSCRIPTION_RENEWING: { icon: "🔁", message: "Il tuo abbonamento si rinnova automaticamente tra pochi giorni." },
  SUBSCRIPTION_RENEWED: { icon: "✅", message: "Abbonamento rinnovato, grazie." },
  SUBSCRIPTION_ENDING: { icon: "⏳", message: "Il tuo abbonamento annullato finisce tra pochi giorni: puoi riattivarlo quando vuoi." },
  SUBSCRIPTION_PAYMENT_FAILED: { icon: "⚠️", message: "Pagamento dell'abbonamento non riuscito: controlla il metodo di pagamento." },
  CONTENT_REPORT_APPEAL_REJECTED: { icon: "📄", message: "La tua contestazione è stata esaminata: la decisione resta valida." },
  // Documenti contabili (docs/CHANGELOG.md §378).
  JOB_INVOICE_REQUESTED: { icon: "🧾", message: "Un cliente ti chiede la fattura: trovi i dati nella scheda del lavoro." },
  MONTHLY_DOCUMENTS_READY: { icon: "🧾", message: "I documenti del mese sono pronti in Fatture e documenti." },
  // Il 15 dicembre (§391).
  CLIENT_DOCUMENTS_TO_FIX: { icon: "🧾", message: "Hai documenti dati ai clienti da sistemare prima del riepilogo dell'anno." },
  // Al cliente, copia della ricevuta o della fattura (§387): il testo dipende dal payload, vedi sotto.
  JOB_DOCUMENT_READY: { icon: "🧾", message: "Il professionista ha preparato il documento del lavoro: trovi una copia nei documenti della richiesta." },
  ADMIN_FEE_RECONCILIATION: { icon: "⚠️", message: "Ci sono fatture o trattenute da controllare in Finanza." },
};

const DEFAULT_COPY = { icon: "🔔", message: "Hai una nuova notifica." };

/** Appuntamento dal payload (`{ start, end }`): "martedì 14 ottobre, 09:00–13:00" (docs/CHANGELOG.md §228). */
function slotLabel(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const { start, end } = value as { start?: unknown; end?: unknown };
  if (typeof start !== "string") return null;
  const startDate = new Date(start);
  if (Number.isNaN(startDate.getTime())) return null;
  // Ora di parete in UTC come il resto degli appuntamenti (docs/CHANGELOG.md §287).
  const day = formatAppointmentDate(startDate, { weekday: "long", day: "numeric", month: "long" });
  const endDate = typeof end === "string" ? new Date(end) : null;
  return `${day}, ${formatAppointmentTimeRange(startDate, endDate && !Number.isNaN(endDate.getTime()) ? endDate : null)}`;
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
  // Chi e quale lavoro (docs/CHANGELOG.md §349): senza, quattro "Hai ricevuto
  // un nuovo preventivo" uguali andavano aperti tutti per capire di cosa.
  const text = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value.trim() : null);
  const job = text(data.jobLabel) ?? text(data.category);
  const jobSuffix = job ? ` · ${job}` : "";
  if (type === "NEW_QUOTE") {
    const from = text(data.businessName);
    const base = from ? `Nuovo preventivo da ${from}` : "Hai ricevuto un nuovo preventivo";
    return { icon: "📬", message: data.resent === true ? `${base}, al posto di quello che avevi rifiutato${jobSuffix}` : `${base}${jobSuffix}` };
  }
  if (type === "QUOTE_ACCEPTED") {
    // Fattura chiesta dal cliente, detta subito (docs/CHANGELOG.md §378).
    return { icon: "🥳", message: `${text(data.clientName) ?? "Il cliente"} ha accettato il tuo preventivo${jobSuffix}${data.invoiceRequested === true ? " e ti chiede la fattura" : ""}` };
  }
  if (type === "NEW_LEAD" && text(data.category)) {
    const where = text(data.city) ? ` a ${text(data.city)}` : "";
    return { icon: data.isUrgent === true ? "⚡" : "🎉", message: `${data.isUrgent === true ? "Richiesta urgente" : "Nuova richiesta"}: ${text(data.category)}${where}` };
  }
  // Nuovo appuntamento nel testo della notifica (docs/CHANGELOG.md §228).
  const newSlot = slotLabel(data.to);
  if (change && type === "QUOTE_DATE_CHANGED") {
    return { icon: "🗓️", message: `Il professionista ha modificato ${scheduleChangeObject(change)} del tuo preventivo${newSlot ? `: ora è ${newSlot}` : ""}.` };
  }
  if (change && type === "QUOTE_DATE_PROPOSED") {
    return { icon: "🗓️", message: `Il cliente ha proposto ${scheduleChangeAlternative(change)} per il preventivo${newSlot ? `: ${newSlot}` : ""}.` };
  }
  if (type === "AGENDA_TOMORROW_SUMMARY" && Array.isArray(data.items)) {
    const count = data.items.length;
    return { icon: "📅", message: count === 1 ? "Domani hai 1 lavoro in agenda." : `Domani hai ${count} lavori in agenda.` };
  }
  if (type === "AGENDA_REMINDER" && data.attention === "RUNNING_LOW") {
    return { icon: "📅", message: "Nei prossimi 7 giorni non hai orari liberi in agenda: aggiungili per farti prenotare." };
  }
  if (type === "QUOTE_DATE_REJECTED" && newSlot) {
    return { icon: "📅", message: `Il professionista non è disponibile in quella data: l'appuntamento resta ${newSlot}.` };
  }
  // Nota del rifiuto e nuovo preventivo dopo il rifiuto (docs/CHANGELOG.md §188).
  // Importo finale diverso dal preventivo, col motivo del professionista (docs/CHANGELOG.md §228).
  if (type === "JOB_COMPLETED" && typeof data.changeReason === "string" && data.changeReason.trim()) {
    return { icon: "✅", message: `Il professionista ha segnalato il lavoro come terminato, con un importo diverso dal preventivo: "${data.changeReason.trim()}"` };
  }
  if (type === "JOB_DOCUMENT_READY") {
    const what = data.kind === "RECEIPT" ? "la ricevuta" : "la copia della fattura";
    return { icon: "🧾", message: `Il professionista ha ${data.updated === true ? "aggiornato" : "preparato"} ${what}: la trovi nei documenti della richiesta${jobSuffix}` };
  }
  if (type === "QUOTE_REJECTED" && (data.note || data.canResend === true)) {
    const note = typeof data.note === "string" && data.note.trim() ? ` Nota: "${data.note.trim()}"` : "";
    const resend = data.canResend === true ? " Puoi inviargli un nuovo preventivo." : "";
    return { icon: "😕", message: `Il cliente ha rifiutato il tuo preventivo.${note}${resend}` };
  }
  return NOTIFICATION_COPY[type] ?? DEFAULT_COPY;
}
