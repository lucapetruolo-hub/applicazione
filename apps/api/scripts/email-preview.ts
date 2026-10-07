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
import { notificationEmail, type NotificationEmailContext } from "../src/email/templates/notification-emails";

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
add("benvenuto-cliente", "Account", "Cliente", welcomeClientEmail("Giulia"));
add("benvenuto-professionista", "Account", "Professionista", welcomeProfessionalEmail("Marco", { link: `${site}/conferma-email?token=esempio`, hours: 48 }));
add("benvenuto-professionista-google", "Account", "Professionista", welcomeProfessionalEmail("Marco", null));
add("conferma-email", "Account", "Tutti", verifyEmailEmail("Marco", `${site}/conferma-email?token=esempio`, 48));
add("password-dimenticata", "Account", "Tutti", passwordResetEmail("Giulia", `${site}/reimposta-password?token=esempio`, 60));
add("password-cambiata", "Account", "Tutti", passwordChangedEmail("Giulia"));
add("account-eliminato", "Account", "Tutti", accountDeletedEmail("Giulia"));
add("profilo-creato-al-telefono", "Account", "Professionista", profileInviteEmail("Marco", "Idraulica Rossi", `${site}/completa-profilo?codice=esempio`, 7));

// Richieste
add("richiesta-inviata", "Richieste", "Cliente", requestSentEmail({ name: "Giulia", category: "Idraulico", city: "Milano", isUrgent: false, sentTo: 3, direct: false }));
add("richiesta-inviata-diretta", "Richieste", "Cliente", requestSentEmail({ name: "Giulia", category: "Idraulico", city: "Milano", isUrgent: false, sentTo: 1, direct: true }));
add("richiesta-inviata-nessuno", "Richieste", "Cliente", requestSentEmail({ name: "Giulia", category: "Idraulico", city: "Milano", isUrgent: false, sentTo: 0, direct: false }));
notification("NEW_LEAD", "Professionista", "Richieste", { category: "Idraulico", city: "Milano", isUrgent: false });
add("new_lead_urgente", "Richieste", "Professionista", renderEmail(notificationEmail("NEW_LEAD", { category: "Idraulico", city: "Milano", isUrgent: true }, forPro)!));
notification("REQUEST_FORWARDED", "Cliente", "Richieste", { count: 3 });
notification("REQUEST_FORWARD_NO_MATCH", "Cliente", "Richieste");
notification("GUIDED_REQUEST_EXPIRED", "Cliente", "Richieste");

// Preventivi e date
notification("NEW_QUOTE", "Cliente", "Preventivi e date");
notification("QUOTE_ACCEPTED", "Professionista", "Preventivi e date");
notification("QUOTE_REJECTED", "Professionista", "Preventivi e date");
notification("QUOTE_WITHDRAWN", "Cliente", "Preventivi e date");
notification("QUOTE_DATE_PROPOSED", "Professionista", "Preventivi e date", { change: "date" });
notification("QUOTE_DATE_CHANGED", "Cliente", "Preventivi e date", { change: "time" });
notification("QUOTE_DATE_CONFIRMED", "Cliente", "Preventivi e date");
notification("QUOTE_DATE_REJECTED", "Cliente", "Preventivi e date");

// Lavori
add("promemoria-cliente", "Lavori e appuntamenti", "Cliente", bookingReminderClientEmail({ name: "Giulia", businessName: "Idraulica Rossi", scheduledAt: appointment, category: "Idraulico" }));
add("promemoria-professionista", "Lavori e appuntamenti", "Professionista", bookingReminderProfessionalEmail({ name: "Marco", clientName: "Giulia", scheduledAt: appointment, category: "Idraulico", city: "Milano" }));
notification("JOB_COMPLETED", "Cliente", "Lavori e appuntamenti", { finalAmountEurCents: 18000 });
notification("NEW_REVIEW", "Professionista", "Lavori e appuntamenti", { published: false });
notification("BOOKING_CANCELED_BY_PROFESSIONAL", "Cliente", "Lavori e appuntamenti", { cancellationNote: "Imprevisto in cantiere, mi scuso." });
notification("BOOKING_REOPENED_BY_PROFESSIONAL", "Cliente", "Lavori e appuntamenti");
notification("BOOKING_REOPENED_BY_CLIENT", "Professionista", "Lavori e appuntamenti");

// Pagamenti
notification("JOB_DEPOSIT_PAID", "Professionista", "Pagamenti dei lavori", { amountEurCents: 3600 });
notification("JOB_BALANCE_DUE", "Cliente", "Pagamenti dei lavori", { amountEurCents: 14400 });
notification("JOB_BALANCE_PAID", "Professionista", "Pagamenti dei lavori", { amountEurCents: 14400 });
notification("JOB_BALANCE_UNPAID", "Cliente", "Pagamenti dei lavori");
notification("JOB_PAYOUT_SENT", "Professionista", "Pagamenti dei lavori", { amountEurCents: 16380 });
notification("JOB_PAYOUT_ACCOUNT_NEEDED", "Professionista", "Pagamenti dei lavori");
notification("ADMIN_JOB_BALANCE_UNPAID", "Admin", "Pagamenti dei lavori");

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
notification("SUBSCRIPTION_RENEWING", "Professionista", "Abbonamento", { tierLabel: "Plus", amountEurCents: 3900, date: inThreeDays });
notification("SUBSCRIPTION_RENEWED", "Professionista", "Abbonamento", { tierLabel: "Plus", amountEurCents: 3900, date: inThreeDays });
notification("SUBSCRIPTION_ENDING", "Professionista", "Abbonamento", { tierLabel: "Plus", date: inThreeDays });
notification("SUBSCRIPTION_PAYMENT_FAILED", "Professionista", "Abbonamento");

// Moderazione
notification("CONTENT_REPORT_DECISION", "Cliente", "Segnalazioni e moderazione", { targetType: "REVIEW", status: "RESOLVED", note: "La recensione conteneva insulti." });
notification("CONTENT_REPORT_UPHELD", "Professionista", "Segnalazioni e moderazione", { targetType: "REVIEW", action: "HIDE_CONTENT", note: "Linguaggio offensivo." });
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
