import type { UnreadNotification } from "./AuthContext";

/**
 * A quale sezione/tab appartiene ogni tipo di notifica — usato per i
 * numeretti per sezione su /dashboard e /le-mie-richieste (richiesta
 * esplicita dell'utente: "indica anche in quale sezione c'è stato
 * l'aggiornamento"), non solo il totale nell'header.
 */
const PROFESSIONAL_RICHIESTE_TYPES = new Set(["NEW_LEAD", "QUOTE_DATE_PROPOSED", "QUOTE_REJECTED", "TIMELINE_MESSAGE_FROM_CLIENT"]);
const PROFESSIONAL_LAVORI_TYPES = new Set(["QUOTE_ACCEPTED", "BOOKING_NO_SHOW_REPORTED"]);
const CLIENT_RICHIESTE_TYPES = new Set([
  "NEW_QUOTE",
  "QUOTE_DATE_CONFIRMED",
  "QUOTE_DATE_REJECTED",
  "QUOTE_WITHDRAWN",
  "LEAD_DECLINED",
  "QUOTE_DATE_CHANGED",
  "GUIDED_REQUEST_EXPIRED",
  "TIMELINE_MESSAGE_FROM_PROFESSIONAL",
]);
const CLIENT_LAVORI_TYPES = new Set(["JOB_COMPLETED", "BOOKING_CANCELED_BY_PROFESSIONAL"]);

/**
 * Pagina+tab a cui porta un click sul toast di una notifica (richiesta
 * esplicita dell'utente: "se ci cliccano sopra fagli aprire l'aggiornamento
 * relativo a quel banner") — ogni `type` appartiene già a esattamente uno
 * dei quattro insiemi sopra (pagina professionista/cliente × sezione
 * richieste/lavori, mai ambiguo), stessa fonte di verità riusata invece di
 * una seconda mappa parallela.
 */
export function notificationDestination(type: string): { page: "/dashboard" | "/le-mie-richieste"; tab: "richieste" | "lavori" } | null {
  if (PROFESSIONAL_RICHIESTE_TYPES.has(type)) return { page: "/dashboard", tab: "richieste" };
  if (PROFESSIONAL_LAVORI_TYPES.has(type)) return { page: "/dashboard", tab: "lavori" };
  if (CLIENT_RICHIESTE_TYPES.has(type)) return { page: "/le-mie-richieste", tab: "richieste" };
  if (CLIENT_LAVORI_TYPES.has(type)) return { page: "/le-mie-richieste", tab: "lavori" };
  return null;
}

function countByTypes(notifications: UnreadNotification[], types: Set<string>): number {
  return notifications.filter((n) => types.has(n.type)).length;
}

export function professionalSectionCounts(notifications: UnreadNotification[]): { richieste: number; lavori: number } {
  return {
    richieste: countByTypes(notifications, PROFESSIONAL_RICHIESTE_TYPES),
    lavori: countByTypes(notifications, PROFESSIONAL_LAVORI_TYPES),
  };
}

export function clientSectionCounts(notifications: UnreadNotification[]): { richieste: number; lavori: number } {
  return {
    richieste: countByTypes(notifications, CLIENT_RICHIESTE_TYPES),
    lavori: countByTypes(notifications, CLIENT_LAVORI_TYPES),
  };
}

function extractPayloadId(notifications: UnreadNotification[], key: "guidedRequestId" | "bookingId" | "quoteId"): Set<string> {
  const ids = new Set<string>();
  for (const n of notifications) {
    if (n.payload && typeof n.payload === "object" && key in n.payload) {
      const value = (n.payload as Record<string, unknown>)[key];
      if (typeof value === "string") ids.add(value);
    }
  }
  return ids;
}

/**
 * ID delle richieste guidate/prenotazioni con un aggiornamento non letto —
 * richiesta esplicita dell'utente ("rendilo evidente anche nella lista"):
 * oltre al numeretto per sezione (già esistente), la singola card/riga
 * della lista che ha generato la notifica deve distinguersi visivamente
 * (badge "Nuovo"), non solo il conteggio aggregato del tab. Ogni tipo di
 * notifica porta `guidedRequestId` o `bookingId` nel payload (mai
 * entrambi assenti — vedi i punti di creazione in NotificationsService),
 * quindi basta un set per tipo di chiave.
 */
export function unreadGuidedRequestIds(notifications: UnreadNotification[]): Set<string> {
  return extractPayloadId(notifications, "guidedRequestId");
}

export function unreadBookingIds(notifications: UnreadNotification[]): Set<string> {
  return extractPayloadId(notifications, "bookingId");
}

/**
 * ID dei singoli preventivi con un aggiornamento non letto (richiesta
 * esplicita dell'utente: "metti un simbolo sul preventivo... per far capire
 * che è proprio quello che ha ricevuto un aggiornamento") — a differenza di
 * `unreadGuidedRequestIds`, serve a distinguere QUALE preventivo tra più
 * ricevuti per la stessa richiesta (il fan-out, CLAUDE.md §14, può
 * raggiungere più professionisti: una richiesta può avere più preventivi,
 * il numeretto a livello di richiesta da solo non basta a capire quale sia
 * cambiato). La maggior parte degli eventi legati a un preventivo porta già
 * `quoteId` nel payload (NEW_QUOTE, QUOTE_DATE_*, QUOTE_REJECTED,
 * QUOTE_WITHDRAWN — vedi i punti di notify in quotes.service.ts).
 */
export function unreadQuoteIds(notifications: UnreadNotification[]): Set<string> {
  return extractPayloadId(notifications, "quoteId");
}

/**
 * Numeretto per voce del menu account (AccountMenu, header) — richiesta
 * esplicita dell'utente: oltre al totale accanto al nome, il numero deve
 * comparire anche sulla voce di menu che porta alla pagina con la novità
 * (es. "Dashboard" per un professionista, "Le mie visite" per un cliente).
 * Tutte le notifiche esistenti per un ruolo confluiscono oggi in un'unica
 * pagina (rispettivamente /dashboard e /le-mie-richieste — le due liste già
 * coperte da professionalSectionCounts/clientSectionCounts sopra), quindi
 * la mappa è {"href": count} con una sola voce diversa da zero.
 */
export function accountMenuUnreadCounts(isProfessional: boolean, notifications: UnreadNotification[]): Record<string, number> {
  if (isProfessional) {
    const { richieste, lavori } = professionalSectionCounts(notifications);
    return { "/dashboard": richieste + lavori };
  }
  const { richieste, lavori } = clientSectionCounts(notifications);
  return { "/le-mie-richieste": richieste + lavori };
}
