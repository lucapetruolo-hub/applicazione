import type { UnreadNotification } from "./AuthContext";

/**
 * A quale sezione/tab appartiene ogni tipo di notifica — usato per i
 * numeretti per sezione su /dashboard e /le-mie-richieste (richiesta
 * esplicita dell'utente: "indica anche in quale sezione c'è stato
 * l'aggiornamento"), non solo il totale nell'header.
 */
const PROFESSIONAL_RICHIESTE_TYPES = new Set(["NEW_LEAD", "QUOTE_DATE_PROPOSED", "QUOTE_REJECTED"]);
const PROFESSIONAL_LAVORI_TYPES = new Set(["QUOTE_ACCEPTED"]);
const CLIENT_RICHIESTE_TYPES = new Set(["NEW_QUOTE", "QUOTE_DATE_CONFIRMED", "QUOTE_DATE_REJECTED", "QUOTE_WITHDRAWN", "LEAD_DECLINED", "QUOTE_DATE_CHANGED"]);
const CLIENT_LAVORI_TYPES = new Set(["JOB_COMPLETED", "BOOKING_CANCELED_BY_PROFESSIONAL"]);

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

function extractPayloadId(notifications: UnreadNotification[], key: "guidedRequestId" | "bookingId"): Set<string> {
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
 * Numeretto per voce del menu account (AccountMenu, header) — richiesta
 * esplicita dell'utente: oltre al totale accanto al nome, il numero deve
 * comparire anche sulla voce di menu che porta alla pagina con la novità
 * (es. "Dashboard" per un professionista, "Le mie visite" per un cliente).
 * Tutte le notifiche esistenti per un ruolo confluiscono oggi in un'unica
 * pagina (rispettivamente /dashboard e /le-mie-richieste — le due liste già
 * coperte da professionalSectionCounts/clientSectionCounts sopra), quindi
 * la mappa è {"href": count} con una sola voce diversa da zero.
 */
export function accountMenuUnreadCounts(role: "CLIENT" | "PROFESSIONAL" | "ADMIN", notifications: UnreadNotification[]): Record<string, number> {
  if (role === "PROFESSIONAL") {
    const { richieste, lavori } = professionalSectionCounts(notifications);
    return { "/dashboard": richieste + lavori };
  }
  if (role === "CLIENT") {
    const { richieste, lavori } = clientSectionCounts(notifications);
    return { "/le-mie-richieste": richieste + lavori };
  }
  return {};
}
