/**
 * Cose che aspettano il professionista nella pagina Oggi
 * (docs/changelog/2026-11-18-oggi-ti-stanno-aspettando.md): chat a cui
 * rispondere, problemi segnalati dai clienti, fatture chieste, lavori da
 * chiudere. Una voce sparisce appena è fatta, così la pagina vuota vuol
 * dire "hai finito".
 */
import type { JobIssueSummary } from "./jobIssues";

/** Una chat in cui l'ultima parola è del cliente: la risposta tocca al professionista. */
export type ChatAwaitingReply = {
  guidedRequestId: string;
  professionalProfileId: string;
  /** Nome come in Chat: il cognome solo a preventivo accettato (§216). */
  clientName: string;
  categoryLabel: string;
  /** Ultimo messaggio del cliente (testo già controllato in chat: niente contatti prima dell'accettazione). */
  lastMessage: string | null;
  lastMessageHasMedia: boolean;
  lastMessageAt: string;
  /** Primo messaggio del cliente dopo l'ultima parola del professionista: da quanto aspetta. */
  waitingSince: string;
  /** Messaggi del cliente ancora senza risposta (uno o più, sempre una riga sola). */
  messageCount: number;
};

/** Oltre questi giorni un messaggio senza risposta non compare più in Oggi (resta in Chat). */
export const CHAT_AWAITING_DAYS = 14;

/** Evento della chat ridotto a quello che serve per capire a chi tocca. */
export type ChatTurnEvent = {
  actor: "CLIENT" | "PROFESSIONAL" | "SYSTEM";
  automatic: boolean;
  hidden: boolean;
  createdAt: Date;
};

/**
 * Dagli eventi di una chat, dal più recente: tocca al professionista se
 * l'ultimo evento che conta è un messaggio scritto a mano dal cliente.
 * Non contano i messaggi del sistema, quelli nascosti da una segnalazione e
 * quelli automatici del cliente ("Il cliente ha accettato il preventivo"):
 * non chiedono una risposta. Conta come risposta qualunque evento del
 * professionista, anche automatico (preventivo inviato, data confermata).
 */
export function chatTurnOfProfessional<E extends ChatTurnEvent>(newestFirst: E[]): { last: E; waitingSince: Date; count: number } | null {
  let last: E | null = null;
  let waitingSince: Date | null = null;
  let count = 0;
  for (const event of newestFirst) {
    if (event.actor === "SYSTEM" || event.hidden) continue;
    if (event.actor === "PROFESSIONAL") break;
    if (event.automatic) continue;
    last ??= event;
    waitingSince = event.createdAt;
    count += 1;
  }
  return last && waitingSince ? { last, waitingSince, count } : null;
}

/** Cosa deve fare il professionista su un problema segnalato dal cliente, con la scadenza. */
export type IssueToDo = { kind: "CHAT_REPLY" | "VERSION" | "INFO"; dueAt: string | null; label: string };

export function issueToDoForProfessional(issue: JobIssueSummary | null | undefined): IssueToDo | null {
  if (!issue) return null;
  if (issue.status === "CHAT" && !issue.proRepliedInChat) return { kind: "CHAT_REPLY", dueAt: issue.chatReplyDueAt, label: "Rispondi in chat e proponi una soluzione" };
  if (issue.status === "OPEN" && issue.reviewPhase === "AWAITING_EVIDENCE") return { kind: "VERSION", dueAt: issue.phaseDueAt, label: "Invia la tua versione" };
  if (issue.status === "OPEN" && issue.reviewPhase === "AWAITING_INFO") return { kind: "INFO", dueAt: issue.phaseDueAt, label: "Il nostro team ti chiede altre informazioni" };
  return null;
}

type BookingForToDo = {
  status: string;
  scheduledAt: string;
  scheduledEndAt: string | null;
  issue: JobIssueSummary | null;
  refundRequested: boolean;
};

/**
 * Appuntamento confermato già finito (ora di parete, docs/CHANGELOG.md §287)
 * ma non ancora chiuso con "Lavoro terminato": da lì partono saldo,
 * recensione e conteggio dei lavori. Con un problema aperto no: lo segue la
 * riga del problema.
 */
export function bookingToClose(booking: BookingForToDo, wallNow: Date): boolean {
  if (booking.status !== "CONFIRMED" || booking.issue || booking.refundRequested) return false;
  const end = new Date(booking.scheduledEndAt ?? booking.scheduledAt);
  return end.getTime() <= wallNow.getTime();
}

/**
 * Fattura chiesta dal cliente e non ancora segnata come fatta: si fa a
 * lavoro terminato. Chi lavora senza partita IVA fa la ricevuta: per lui la
 * voce sparisce quando scarica il PDF.
 */
export function invoiceToDo(booking: {
  status: string;
  invoiceRequest?: { doneAt?: string | null } | null;
  clientDocumentKind?: "RECEIPT" | "INVOICE";
  courtesyDocument?: { pdfDownloadedAt: string | null; amountChanged: boolean } | null;
}): boolean {
  if (booking.status !== "COMPLETED" || !booking.invoiceRequest) return false;
  if (booking.clientDocumentKind === "RECEIPT") return !booking.courtesyDocument?.pdfDownloadedAt || booking.courtesyDocument.amountChanged;
  return !booking.invoiceRequest.doneAt;
}
