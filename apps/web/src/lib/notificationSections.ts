import type { UnreadNotification } from "./AuthContext";

/**
 * A quale sezione/tab appartiene ogni tipo di notifica — usato per i
 * numeretti per sezione su /dashboard e /le-mie-richieste (richiesta
 * esplicita dell'utente: "indica anche in quale sezione c'è stato
 * l'aggiornamento"), non solo il totale nell'header.
 */
const PROFESSIONAL_RICHIESTE_TYPES = new Set(["NEW_LEAD", "QUOTE_DATE_PROPOSED", "QUOTE_REJECTED"]);
const PROFESSIONAL_LAVORI_TYPES = new Set(["QUOTE_ACCEPTED"]);
const CLIENT_RICHIESTE_TYPES = new Set(["NEW_QUOTE", "QUOTE_DATE_CONFIRMED", "QUOTE_DATE_REJECTED", "QUOTE_WITHDRAWN", "LEAD_DECLINED"]);
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
