import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * Link del file .ics di "Aggiungi al calendario" (docs/changelog/2026-11-10-calendario-iphone.md).
 * Safari su iPhone non apre un file scritto nella pagina (link `data:`):
 * serve un indirizzo vero che risponda `text/calendar`, e lì l'iPhone
 * mostra da solo "Aggiungi al calendario". Il link si apre senza accesso,
 * quindi porta l'id del lavoro, una scadenza e la firma del server. Chiave
 * legata a `JWT_SECRET` ma distinta dalle sessioni, come i promemoria.
 */
export const BOOKING_ICS_TTL_MS = 24 * 60 * 60_000;

function key(): Buffer {
  return createHash("sha256")
    .update(`booking-ics:${process.env.JWT_SECRET ?? "dev-secret-change-me"}`)
    .digest();
}

function signature(body: string): string {
  return createHmac("sha256", key()).update(body).digest("base64url");
}

export function bookingIcsToken(bookingId: string, now = Date.now()): string {
  const body = `${bookingId}.${Math.floor((now + BOOKING_ICS_TTL_MS) / 1000)}`;
  return `${body}.${signature(body)}`;
}

/** Id del lavoro se la firma è giusta e il link non è scaduto, altrimenti `null`. */
export function readBookingIcsToken(token: string, now = Date.now()): string | null {
  const match = /^([0-9a-f-]{36})\.(\d{1,12})\.([A-Za-z0-9_-]+)$/i.exec(token);
  const [, bookingId, exp, sig] = match ?? [];
  if (!bookingId || !exp || !sig) return null;
  const given = Buffer.from(sig);
  const expected = Buffer.from(signature(`${bookingId}.${exp}`));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  return Number(exp) * 1000 > now ? bookingId : null;
}
