import type { ProfessionalBooking, ProfessionalLead } from "@professionisti/shared";
import { brand, type IconName } from "@professionisti/ui";

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

/**
 * Palette per stadio — eccezione deliberata e circoscritta alla regola
 * "solo token `brand.*`" (CLAUDE.md §19), concessa perché l'utente ha
 * chiesto colori arbitrari per nome per queste pillole (§41 "Rifinitura",
 * §61). Spostata qui (era locale a `/dashboard/richieste`) perché
 * `/dashboard/agenda` la riusa per colorare le caselle prenotazione dello
 * stesso significato — un'unica fonte di verità invece di duplicare gli
 * hex in due file, richiesta esplicita dell'utente: "in agenda colora le
 * caselle degli appuntamento in base ai colori che sono stati usati per le
 * schede in richieste ricevute".
 */
export const REQUEST_STAGE_STYLE: Record<RequestStage, { label: string; icon: IconName; fg: string; bg: string; border: string }> = {
  da_quotare: { label: "Da quotare", icon: "zap", fg: "#0D6EFD", bg: "#E7F1FF", border: "#0D6EFD" },
  // "In attesa" da solo era ambiguo sulla singola card (segnalato in
  // revisione UX: "il pro ha già inviato il preventivo, in attesa di
  // chi?") — la pillola sulla card ora lo dice esplicitamente, il tab
  // resta "In attesa" (spazio ridotto nella riga a scorrimento, stesso
  // significato).
  in_attesa: { label: "In attesa del cliente", icon: "clock", fg: "#8A6D00", bg: "#FFF3CD", border: "#FFC107" },
  modifica_richiesta: { label: "Modifica richiesta", icon: "rotate-ccw", fg: "#7A4F01", bg: "#FFE8A3", border: "#B8860B" },
  accettata: { label: "Accettata", icon: "check", fg: "#28A745", bg: "#E6F4EA", border: "#28A745" },
  completata: { label: "Completata", icon: "check", fg: "#0E7C7B", bg: "#DFF7F5", border: "#20B2AA" },
  // Richiesta esplicita dell'utente: "rendi chiare quelle che sono state
  // annullate" — prima indistinguibile da "accettata" (nessuno stadio
  // dedicato). Icona "x" (già usata per "chiusa", stesso significato
  // "non riuscita") a distinguerla visivamente da "scaduta" pur
  // condividendo lo stesso significato semantico "rosso".
  annullata: { label: "Annullata", icon: "x", fg: "#B22222", bg: "#F8D7DA", border: "#B22222" },
  scaduta: { label: "Scaduta", icon: "clock", fg: "#DC3545", bg: "#FBEAEA", border: "#DC3545" },
  chiusa: { label: "Chiusa", icon: "x", fg: brand.grafite70, bg: brand.gesso, border: brand.filetto },
};

/**
 * Stesso stile per un lavoro accettato (`ProfessionalBooking`, non un
 * `ProfessionalLead`) — richiesta esplicita dell'utente: "rendi la
 * dashboard del professionista più colorata e omogenea alle richieste
 * ricevute... il colore in base allo stato della richiesta". Nessuno
 * stadio di `RequestStage` corrisponde 1:1 a un `BookingStatus`, ma
 * condividono lo stesso significato pratico — stessa mappatura già in uso
 * per colorare le caselle dell'agenda (`BookingDetailPanel.tsx`,
 * `dashboard/agenda/page.tsx`, CLAUDE.md §81), qui spostata a un solo
 * punto di verità invece di una terza copia duplicata degli stessi hex.
 */
export function bookingStageStyle(status: ProfessionalBooking["status"]): (typeof REQUEST_STAGE_STYLE)[RequestStage] {
  if (status === "COMPLETED") return REQUEST_STAGE_STYLE.completata;
  if (status === "CANCELED" || status === "NO_SHOW") return REQUEST_STAGE_STYLE.annullata;
  if (status === "PENDING") return REQUEST_STAGE_STYLE.in_attesa;
  return REQUEST_STAGE_STYLE.accettata; // CONFIRMED
}

/** Motivo per cui un preventivo/richiesta "chiusa" non è più azionabile — mostrato al posto delle azioni. */
export function describeClosedReason(lead: ProfessionalLead): string {
  if (lead.status === "DECLINED") return "Hai rifiutato questa richiesta." + (lead.declineNote ? ` Nota: "${lead.declineNote}"` : "");
  if (lead.quote?.status === "WITHDRAWN") return "Hai ritirato il preventivo inviato per questa richiesta.";
  if (lead.quote?.status === "REJECTED") return "Il cliente ha rifiutato il preventivo che hai inviato.";
  return "Questa richiesta non è più azionabile.";
}

/**
 * Etichette per la stessa `StagePill` mostrata dal lato cliente
 * (`/le-mie-richieste`, richiesta esplicita dell'utente: "rendi la pagina
 * le mie richieste simile a quella delle richieste ricevute adattandola al
 * contesto") — stessi colori/icone di `REQUEST_STAGE_STYLE` (nessuna nuova
 * palette), solo il testo cambia: lo stesso stadio letto da un
 * professionista ("Da quotare" = tocca a te) e da un cliente ("In attesa di
 * preventivo" = sto aspettando una risposta) non può condividere la stessa
 * frase senza confondere chi legge.
 */
export const CLIENT_STAGE_LABEL: Record<RequestStage, string> = {
  da_quotare: "In attesa di preventivo",
  in_attesa: "Preventivo ricevuto",
  modifica_richiesta: "In attesa di conferma",
  accettata: "Accettata",
  completata: "Completata",
  annullata: "Annullata",
  scaduta: "Scaduta",
  chiusa: "Annullata da te",
};

/**
 * Stessa classificazione a stadi di `classifyLeadStage`, ma lato cliente —
 * richiesta esplicita dell'utente. A differenza di un `Lead` (al più un
 * solo preventivo), una `ClientGuidedRequest` generica può avere più
 * preventivi da professionisti diversi (fan-out, CLAUDE.md §14): lo stadio
 * riflette il preventivo più "attivo" tra quelli ricevuti (una proposta in
 * corso conta più di una già rifiutata/ritirata), non una media né un
 * elenco di tutti — la lista dei singoli preventivi resta comunque visibile
 * per intero nella scheda espansa, questo stadio è solo il riassunto in
 * cima alla card.
 */
export function classifyClientRequestStage(
  request: {
    status: "OPEN" | "MATCHED" | "CLOSED";
    closedReason: "EXPIRED" | "CANCELED_BY_CLIENT" | "COMPLETED" | null;
    quotes: { status: "SENT" | "ACCEPTED" | "REJECTED" | "MODIFICATION_REQUESTED" | "WITHDRAWN" }[];
  },
  booking: { status: "PENDING" | "CONFIRMED" | "COMPLETED" | "CANCELED" | "NO_SHOW" } | null,
): RequestStage {
  if (booking) {
    if (booking.status === "COMPLETED") return "completata";
    if (booking.status === "CANCELED" || booking.status === "NO_SHOW") return "annullata";
    return "accettata"; // PENDING o CONFIRMED
  }
  if (request.status === "CLOSED") {
    return request.closedReason === "EXPIRED" ? "scaduta" : "chiusa";
  }
  if (request.quotes.some((q) => q.status === "MODIFICATION_REQUESTED")) return "modifica_richiesta";
  if (request.quotes.some((q) => q.status === "SENT")) return "in_attesa";
  return "da_quotare";
}
