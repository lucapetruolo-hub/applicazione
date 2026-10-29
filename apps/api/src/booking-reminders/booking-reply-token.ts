import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * Link dei pulsanti "Ci sarò" e "Non posso più" nell'email del giorno
 * prima: funzionano senza accedere, quindi portano l'id del lavoro con una
 * firma del server. Valgono solo per rispondere a quel promemoria, finché
 * l'appuntamento è in programma (lo controlla `BookingRepliesService`).
 * Chiave legata a `JWT_SECRET` ma distinta dalle sessioni, come gli inviti.
 */
function key(): Buffer {
  return createHash("sha256")
    .update(`booking-reply:${process.env.JWT_SECRET ?? "dev-secret-change-me"}`)
    .digest();
}

function signature(bookingId: string): string {
  return createHmac("sha256", key()).update(bookingId).digest("base64url");
}

export function bookingReplyToken(bookingId: string): string {
  return `${bookingId}.${signature(bookingId)}`;
}

/** Id del lavoro se la firma è giusta, altrimenti `null`. */
export function readBookingReplyToken(token: string): string | null {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const bookingId = token.slice(0, dot);
  if (!/^[0-9a-f-]{36}$/i.test(bookingId)) return null;
  const given = Buffer.from(token.slice(dot + 1));
  const expected = Buffer.from(signature(bookingId));
  return given.length === expected.length && timingSafeEqual(given, expected)
    ? bookingId
    : null;
}
