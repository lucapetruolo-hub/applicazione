import type { ProfessionalLead } from "@professionisti/shared";

/**
 * I 7 stati di pipeline mostrati in `/dashboard/richieste` — derivati
 * puramente lato client dai campi già esposti da `ProfessionalLead`, nessun
 * campo nuovo nel dominio: ogni stato corrisponde a una combinazione già
 * esistente di `Lead.status`/`Quote.status`/`Quote.bookingStatus`.
 *
 * `annullata` (richiesta esplicita dell'utente: "rendi chiare quelle che
 * sono state annullate aggiungendo un tab") — prima una prenotazione
 * CANCELED ricadeva silenziosamente sotto `accettata` (nessun controllo
 * dedicato, l'unico esistente distingueva solo `bookingStatus ===
 * "COMPLETED"`), indistinguibile da un lavoro ancora da svolgere.
 *
 * `chiusa` non è uno degli stati richiesti esplicitamente (rifiuto lato
 * professionista/cliente, o preventivo ritirato) — non ha un tab dedicato,
 * raggruppata sotto "Scadute" nel filtro perché condivide lo stesso
 * significato pratico ("non più azionabile"), ma resta distinguibile in UI
 * tramite `describeClosedReason`.
 */
export type RequestStage = "da_quotare" | "in_attesa" | "modifica_richiesta" | "accettata" | "completata" | "annullata" | "scaduta" | "chiusa";

export function classifyLeadStage(lead: ProfessionalLead): RequestStage {
  if (lead.status === "EXPIRED") return "scaduta";
  if (lead.status === "DECLINED") return "chiusa";

  const quote = lead.quote;
  if (!quote) return "da_quotare";
  if (quote.status === "WITHDRAWN" || quote.status === "REJECTED") return "chiusa";
  if (quote.status === "MODIFICATION_REQUESTED") return "modifica_richiesta";
  if (quote.status === "SENT") return "in_attesa";
  // ACCEPTED
  if (quote.bookingStatus === "COMPLETED") return "completata";
  if (quote.bookingStatus === "CANCELED") return "annullata";
  return "accettata";
}

/** Motivo per cui un preventivo/richiesta "chiusa" non è più azionabile — mostrato al posto delle azioni. */
export function describeClosedReason(lead: ProfessionalLead): string {
  if (lead.status === "DECLINED") return "Hai rifiutato questa richiesta." + (lead.declineNote ? ` Nota: "${lead.declineNote}"` : "");
  if (lead.quote?.status === "WITHDRAWN") return "Hai ritirato il preventivo inviato per questa richiesta.";
  if (lead.quote?.status === "REJECTED") return "Il cliente ha rifiutato il preventivo che hai inviato.";
  return "Questa richiesta non è più azionabile.";
}
