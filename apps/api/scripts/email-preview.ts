/**
 * Anteprima di tutte le email del sito con dati di esempio
 * (docs/CHANGELOG.md §185). Uso: `pnpm --filter @professionisti/api email:preview [cartella]`
 * (default `email-preview/`): un file HTML per email più `index.json` con
 * gruppo, destinatario e oggetto di ciascuna. Non manda nulla.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { renderEmail, type RenderedEmail } from "../src/email/email-layout";
import {
  accountDeletedEmail,
  passwordChangedEmail,
  loginLockedEmail,
  newDeviceLoginEmail,
  adminAccessEmail,
  adminCodeLockedEmail,
  adminResetCodeEmail,
  adminSecurityAlertEmail,
  passwordResetEmail,
  profileInviteEmail,
  verifyEmailEmail,
  welcomeClientEmail,
  welcomeProfessionalEmail,
} from "../src/email/templates/account-emails";
import {
  adminNewReportEmail,
  bookingReminderClientEmail,
  bookingReminderProfessionalEmail,
  requestSentEmail,
} from "../src/email/templates/job-emails";
import { chatMessageEmail, notificationEmail, type NotificationEmailContext } from "../src/email/templates/notification-emails";

type Entry = { file: string; group: string; to: "Cliente" | "Professionista" | "Admin" | "Tutti"; email: RenderedEmail };

const site = process.env.FRONTEND_URL ?? "https://applicazione-web.vercel.app";
process.env.FRONTEND_URL = site;
const appointment = new Date("2026-10-14T09:30:00.000Z");
const forClient: NotificationEmailContext = { name: "Giulia", category: "Idraulico", city: "Milano", businessName: "Idraulica Rossi", when: appointment, proposedWhen: null };
const forPro: NotificationEmailContext = { ...forClient, name: "Marco", proposedWhen: new Date("2026-10-16T15:00:00.000Z") };
const inThreeDays = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();

const entries: Entry[] = [];
function add(file: string, group: string, to: Entry["to"], email: RenderedEmail | null): void {
  if (email) entries.push({ file, group, to, email });
}
function notification(type: string, to: Entry["to"], group: string, payload: Record<string, unknown> = {}): void {
  const content = notificationEmail(type, payload, to === "Professionista" ? forPro : forClient);
  add(type.toLowerCase(), group, to, content ? renderEmail(content) : null);
}

// Account
const verify = { link: `${site}/conferma-email?token=esempio`, hours: 48, code: "482915", codeMinutes: 15 };
add("benvenuto-cliente", "Account", "Cliente", welcomeClientEmail("Giulia"));
add("benvenuto-professionista", "Account", "Professionista", welcomeProfessionalEmail("Marco", verify));
add("benvenuto-professionista-google", "Account", "Professionista", welcomeProfessionalEmail("Marco", null));
add("conferma-email", "Account", "Tutti", verifyEmailEmail("Marco", verify));
add("password-dimenticata", "Account", "Tutti", passwordResetEmail("Giulia", { link: `${site}/reimposta-password?token=esempio`, minutes: 60, code: "731604", codeMinutes: 15 }));
add("password-cambiata", "Account", "Tutti", passwordChangedEmail("Giulia"));
add("accesso-bloccato", "Account", "Tutti", loginLockedEmail("Giulia", 15));
add("nuovo-accesso", "Account", "Professionista", newDeviceLoginEmail("Marco", { label: "Chrome su Android", at: new Date("2026-10-24T09:30:00Z") }));
add("admin-accesso", "Account", "Admin", adminAccessEmail("Luca", { label: "Safari su Mac", at: new Date("2026-10-26T09:30:00Z") }));
add("admin-due-passaggi-attivata", "Account", "Admin", adminAccessEmail("Luca", { label: "Safari su Mac", at: new Date("2026-10-26T09:30:00Z"), justEnabled: true }));
add("admin-codice-telefono-perso", "Account", "Admin", adminResetCodeEmail("Luca", "482913", 15));
add("admin-due-passaggi-azzerata", "Account", "Admin", adminAccessEmail("Luca", { label: "Chrome su Windows", at: new Date("2026-10-26T09:30:00Z"), resetByEmail: true }));
add(
  "admin-avviso-super-admin",
  "Account",
  "Super admin",
  adminSecurityAlertEmail("Luca", { title: "Nuovo amministratore", text: "Marta Rossi (marta@esempio.it) è diventata admin (Moderatore). L'ha deciso Luca Petruolo (luca@esempio.it)", at: new Date("2026-10-26T09:30:00Z") }),
);
add("admin-codici-sbagliati", "Account", "Admin", adminCodeLockedEmail("Luca", 15));
add("account-eliminato", "Account", "Tutti", accountDeletedEmail("Giulia"));
add("profilo-creato-al-telefono", "Account", "Professionista", profileInviteEmail("Marco", "Idraulica Rossi", `${site}/completa-profilo?codice=esempio`, 7));

// Richieste
const requestSummary = {
  timing: "WEEK" as const,
  serviceMode: "HOME" as const,
  address: "Via Paolo Sarpi",
  houseNumber: "14",
  addressExtra: "scala B, interno 6",
  postalCode: "20154",
  province: "MI",
  photoUrls: [
    "https://res.cloudinary.com/demo/image/upload/sample.jpg",
    "https://res.cloudinary.com/demo/image/upload/cld-sample-5.jpg",
  ],
};
const requestDescription = "Il rubinetto della cucina perde sotto il lavandino, anche da chiuso.\nMeglio di pomeriggio, dopo le 15.";
add("richiesta-inviata", "Richieste", "Cliente", requestSentEmail({ name: "Giulia", category: "Idraulico", requestId: "esempio", city: "Milano", isUrgent: false, sentTo: 3, direct: false, description: requestDescription, summary: requestSummary }));
add("richiesta-inviata-urgente", "Richieste", "Cliente", requestSentEmail({ name: "Giulia", category: "Idraulico", requestId: "esempio", city: "Milano", isUrgent: true, sentTo: 2, direct: false, description: "Perdita d'acqua dal soffitto del bagno.", summary: { ...requestSummary, timing: "TODAY", photoUrls: [] } }));
add("richiesta-inviata-piu-categorie", "Richieste", "Cliente", requestSentEmail({ name: "Giulia", category: "Idraulico ed Elettricista", requestsCount: 2, city: "Milano", isUrgent: false, sentTo: 5, direct: false, description: requestDescription, summary: requestSummary }));
add("richiesta-inviata-diretta", "Richieste", "Cliente", requestSentEmail({ name: "Giulia", category: "Idraulico", requestId: "esempio", city: "Milano", isUrgent: false, sentTo: 1, direct: true, description: requestDescription, summary: { ...requestSummary, preferredDate: new Date("2026-11-03T00:00:00.000Z"), preferredTimeSlot: "14:00-18:00", businessName: "Idraulica Rossi" } }));
add("richiesta-inviata-nessuno", "Richieste", "Cliente", requestSentEmail({ name: "Giulia", category: "Idraulico", city: "Milano", isUrgent: false, sentTo: 0, direct: false }));
notification("NEW_LEAD", "Professionista", "Richieste", { category: "Idraulico", city: "Milano", isUrgent: false });
add("new_lead_urgente", "Richieste", "Professionista", renderEmail(notificationEmail("NEW_LEAD", { category: "Idraulico", city: "Milano", isUrgent: true }, forPro)!));
notification("REQUEST_FORWARDED", "Cliente", "Richieste", { count: 3 });
notification("REQUEST_FORWARD_NO_MATCH", "Cliente", "Richieste");
notification("REQUEST_MATCHED_LATER", "Cliente", "Richieste");
notification("GUIDED_REQUEST_EXPIRED", "Cliente", "Richieste");

// Messaggi in chat non letti dopo 10 minuti (§332)
add("chat-messaggio-dal-professionista", "Messaggi", "Cliente", renderEmail(chatMessageEmail("TIMELINE_MESSAGE_FROM_PROFESSIONAL", 1, { ...forClient, when: null }, "https://example.it/le-mie-richieste")));
add("chat-messaggi-dal-cliente", "Messaggi", "Professionista", renderEmail(chatMessageEmail("TIMELINE_MESSAGE_FROM_CLIENT", 3, { ...forPro, when: null }, "https://example.it/dashboard/richieste")));

// Preventivi e date
notification("NEW_QUOTE", "Cliente", "Preventivi e date");
add("new_quote_nuovo_dopo_rifiuto", "Preventivi e date", "Cliente", renderEmail(notificationEmail("NEW_QUOTE", { resent: true }, forClient)!));
notification("QUOTE_ACCEPTED", "Professionista", "Preventivi e date");
// Fattura chiesta dal cliente accettando (§378).
add("quote_accepted_con_fattura", "Preventivi e date", "Professionista", renderEmail(notificationEmail("QUOTE_ACCEPTED", { clientName: "Giulia Bianchi", invoiceRequested: true, invoiceLines: ["Studio Bianchi Srl", "P.IVA 01234567890", "Via Roma 10, 20100 Milano (MI)", "Codice destinatario M5UXCR1"] }, forPro)!));
notification("JOB_INVOICE_REQUESTED", "Professionista", "Lavori e appuntamenti", { invoiceLines: ["Giulia Bianchi", "Codice fiscale BNCGLI85M41F205X", "Via Roma 10, 20100 Milano (MI)"] });
// Documenti da sistemare il 15 dicembre (§391).
notification("CLIENT_DOCUMENTS_TO_FIX", "Professionista", "Lavori e appuntamenti", {
  year: 2026,
  accountant: true,
  documents: [
    { label: "Ricevuta n. 4/2026", customerName: "Anna Bianchi", reason: "AMOUNT_CHANGED" },
    { label: "Fattura n. 12/A", customerName: "Bar Sport S.r.l.", reason: "MISSING_AMOUNT" },
    // Lavori terminati senza ricevuta o con la ricevuta mai scaricata (§387).
    { label: "Ricevuta n. 6/2026", customerName: "Luca Verdi", reason: "NOT_DOWNLOADED" },
    { label: "Idraulico del 12 novembre 2026", customerName: "Sara Neri", reason: "NO_RECEIPT" },
  ],
});
// Copia della ricevuta pronta per il cliente (§387).
notification("JOB_DOCUMENT_READY", "Cliente", "Lavori e appuntamenti", { kind: "RECEIPT", label: "Ricevuta n. 4/2026", guidedRequestId: "preview", updated: false });
add("job_document_ready_aggiornata", "Lavori e appuntamenti", "Cliente", renderEmail(notificationEmail("JOB_DOCUMENT_READY", { kind: "INVOICE", label: "Fattura n. 12/A", guidedRequestId: "preview", updated: true }, forClient)!));
notification("QUOTE_REJECTED", "Professionista", "Preventivi e date", {
  note: "Il prezzo è più alto di quanto pensavo, e mi servirebbe prima di venerdì.",
  canResend: true,
  resendUntil: new Date(Date.now() + 10 * 86_400_000).toISOString(),
});
notification("QUOTE_WITHDRAWN", "Cliente", "Preventivi e date");
notification("QUOTE_DATE_PROPOSED", "Professionista", "Preventivi e date", { change: "date" });
notification("QUOTE_DATE_CHANGED", "Cliente", "Preventivi e date", { change: "time" });
notification("QUOTE_DATE_CONFIRMED", "Cliente", "Preventivi e date");
notification("QUOTE_DATE_REJECTED", "Cliente", "Preventivi e date");

// Lavori
add("promemoria-cliente", "Lavori e appuntamenti", "Cliente", bookingReminderClientEmail({ name: "Giulia", businessName: "Idraulica Rossi", professionalFullName: "Marco Rossi", address: "Via Roma 10 — 20100 Milano (MI)", scheduledAt: appointment, category: "Idraulico", calendarUrl: "https://calendar.google.com/calendar/render?action=TEMPLATE" }));
add("promemoria-professionista", "Lavori e appuntamenti", "Professionista", bookingReminderProfessionalEmail({ name: "Marco", clientName: "Giulia Bianchi", clientPhone: "+39 333 1234567", clientEmail: "giulia@example.it", address: "Via Roma 10 — 20100 Milano (MI)", scheduledAt: appointment, category: "Idraulico", city: "Milano", calendarUrl: "https://calendar.google.com/calendar/render?action=TEMPLATE" }));
notification("JOB_COMPLETED", "Cliente", "Lavori e appuntamenti", { finalAmountEurCents: 18000 });
notification("NEW_REVIEW", "Professionista", "Lavori e appuntamenti", {});
notification("BOOKING_CANCELED_BY_PROFESSIONAL", "Cliente", "Lavori e appuntamenti", { cancellationNote: "Imprevisto in cantiere, mi scuso." });
notification("BOOKING_CANCELED_BY_CLIENT", "Professionista", "Lavori e appuntamenti");
notification("BOOKING_REOPENED_BY_PROFESSIONAL", "Cliente", "Lavori e appuntamenti");
notification("BOOKING_REOPENED_BY_CLIENT", "Professionista", "Lavori e appuntamenti");

// Pagamenti
notification("JOB_DEPOSIT_PAID", "Professionista", "Pagamenti dei lavori", { amountEurCents: 3600 });
notification("JOB_BALANCE_DUE", "Cliente", "Pagamenti dei lavori", { amountEurCents: 14400 });
notification("JOB_BALANCE_AUTO_CHARGED", "Cliente", "Pagamenti dei lavori", { amountEurCents: 14400 });
notification("JOB_BALANCE_PAID", "Professionista", "Pagamenti dei lavori", { amountEurCents: 14400 });
notification("JOB_BALANCE_UNPAID", "Cliente", "Pagamenti dei lavori");
notification("JOB_PAYOUT_SENT", "Professionista", "Pagamenti dei lavori", { amountEurCents: 16380 });
notification("JOB_PAYOUT_ACCOUNT_NEEDED", "Professionista", "Pagamenti dei lavori");
notification("JOB_PAYOUT_FAILED", "Professionista", "Pagamenti dei lavori", { amountEurCents: 16380 });
notification("ADMIN_JOB_BALANCE_UNPAID", "Admin", "Pagamenti dei lavori");
notification("JOB_STRIPE_DISPUTE", "Professionista", "Pagamenti dei lavori");
notification("ADMIN_STRIPE_DISPUTE", "Admin", "Pagamenti dei lavori");
notification("JOB_PAYMENT_DEBT", "Professionista", "Pagamenti dei lavori", { amountEurCents: 2650 });
notification("ADMIN_JOB_PAYMENT_LONG_HOLD", "Admin", "Pagamenti dei lavori");
notification("JOB_REFUND_PENDING", "Cliente", "Pagamenti dei lavori", { amountEurCents: 3600 });
notification("JOB_REFUND_COMPLETED", "Cliente", "Pagamenti dei lavori", { amountEurCents: 3600 });
notification("JOB_REFUND_WAITING_FUNDS", "Professionista", "Pagamenti dei lavori", { amountEurCents: 3600 });
notification("ADMIN_JOB_REFUND_FAILED", "Admin", "Pagamenti dei lavori", { amountEurCents: 3600 });
notification("ONLINE_LIMIT_LIFTED", "Professionista", "Pagamenti dei lavori");
notification("ADMIN_STRIPE_ACCOUNT_UNREADABLE", "Admin", "Pagamenti dei lavori", { stripeAccountId: "acct_123", businessName: "Idraulica Rossi", error: "Permission denied" });

// Segnalazioni sul lavoro
notification("JOB_ISSUE_REPORTED", "Professionista", "Segnalazioni sul lavoro", { issueType: "BAD_WORK", assisted: true });
notification("JOB_ISSUE_SETTLED", "Professionista", "Segnalazioni sul lavoro");
notification("JOB_ISSUE_UNRESOLVED", "Professionista", "Segnalazioni sul lavoro");
notification("JOB_ISSUE_ESCALATED", "Professionista", "Segnalazioni sul lavoro", { evidenceDueAt: inThreeDays });
notification("JOB_ISSUE_AUTO_ESCALATED", "Professionista", "Segnalazioni sul lavoro", { evidenceDueAt: inThreeDays });
notification("JOB_ISSUE_TEAM_REVIEW", "Cliente", "Segnalazioni sul lavoro");
notification("JOB_ISSUE_INFO_REQUESTED", "Professionista", "Segnalazioni sul lavoro");
notification("JOB_ISSUE_RESOLVED", "Cliente", "Segnalazioni sul lavoro", {
  audience: "CLIENT",
  text: 'La segnalazione "il lavoro non è andato bene" è stata accolta. Motivazione: le foto mostrano la perdita ancora presente. La nostra decisione non impedisce di rivolgersi a un organismo di mediazione o al giudice.',
});
notification("JOB_ISSUE_APPEAL_DECIDED", "Professionista", "Segnalazioni sul lavoro", { audience: "PROFESSIONAL", decision: "REJECTED", note: "Le nuove foto non cambiano la valutazione." });
notification("JOB_ISSUE_SANCTION", "Professionista", "Segnalazioni sul lavoro", { sanction: "DEMOTED", until: inThreeDays });

// Abbonamento
notification("SUBSCRIPTION_TRIAL_ENDING", "Professionista", "Abbonamento", { date: inThreeDays });
notification("SUBSCRIPTION_BONUS_MONTH", "Professionista", "Abbonamento", { date: inThreeDays });
notification("SUBSCRIPTION_LIMIT_NEAR", "Professionista", "Abbonamento", { used: 4, limit: 5 });
notification("SUBSCRIPTION_LIMIT_REACHED", "Professionista", "Abbonamento");
notification("SUBSCRIPTION_PAUSED", "Professionista", "Abbonamento", { reason: "TRIAL_ENDED" });
notification("SUBSCRIPTION_RENEWING", "Professionista", "Abbonamento", { tierLabel: "Plus", amountEurCents: 5900, date: inThreeDays });
notification("SUBSCRIPTION_RENEWED", "Professionista", "Abbonamento", { tierLabel: "Plus", amountEurCents: 5900, date: inThreeDays });
notification("SUBSCRIPTION_ENDING", "Professionista", "Abbonamento", { tierLabel: "Plus", date: inThreeDays });
notification("SUBSCRIPTION_PAYMENT_FAILED", "Professionista", "Abbonamento");
// Documenti del mese (§378): i mesi gratis a 0 €.
notification("MONTHLY_DOCUMENTS_READY", "Professionista", "Abbonamento", {
  monthLabel: "novembre 2026",
  totalEurCents: 2440,
  lines: [
    { label: "Offerta di lancio (Base)", amountEurCents: 0 },
    { label: "Trattenute sui pagamenti online", amountEurCents: 2440 },
  ],
});
// Moderazione
notification("CONTENT_REPORT_RECEIVED", "Cliente", "Segnalazioni e moderazione", { targetType: "REVIEW" });
notification("CONTENT_REPORT_DECISION", "Cliente", "Segnalazioni e moderazione", { targetType: "REVIEW", status: "RESOLVED" });
notification("CONTENT_REPORT_UPHELD", "Professionista", "Segnalazioni e moderazione", { targetType: "REVIEW", action: "HIDE_CONTENT", ground: "legge-diffamazione", note: "La recensione attribuisce al professionista un furto senza alcun riscontro." });
notification("CONTENT_REPORT_REVERTED", "Professionista", "Segnalazioni e moderazione", { targetType: "REVIEW", note: "Rivista la decisione dopo la contestazione." });
notification("CONTENT_REPORT_APPEAL_REJECTED", "Professionista", "Segnalazioni e moderazione", { note: "La decisione resta valida." });
notification("ACCOUNT_SUSPENDED", "Tutti", "Segnalazioni e moderazione", { note: "Violazioni ripetute dei Termini di servizio." });
notification("ACCOUNT_REACTIVATED", "Tutti", "Segnalazioni e moderazione", { note: "Sospensione annullata dopo verifica." });
add("admin-nuova-segnalazione", "Segnalazioni e moderazione", "Admin", adminNewReportEmail({ what: "Recensione", reason: "Contiene insulti" }));

const outDir = process.argv[2] ?? "email-preview";
mkdirSync(outDir, { recursive: true });
for (const entry of entries) writeFileSync(join(outDir, `${entry.file}.html`), entry.email.html);
writeFileSync(
  join(outDir, "index.json"),
  JSON.stringify(
    entries.map((e) => ({ file: `${e.file}.html`, group: e.group, to: e.to, subject: e.email.subject, text: e.email.text })),
    null,
    2,
  ),
);
console.log(`${entries.length} email scritte in ${outDir}/`);
