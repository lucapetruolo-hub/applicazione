import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * Link del file .ics di "Altri calendari" (docs/changelog/2026-11-10-calendario-iphone.md).
 * Safari su iPhone non apre un file scritto nella pagina (link `data:`):
 * serve un indirizzo vero che risponda `text/calendar`, e lì l'iPhone
 * mostra da solo "Aggiungi al calendario". Il link si apre senza accesso
 * (anche dalle email), quindi porta l'id del lavoro, per chi è il file
 * (cliente o professionista), una scadenza e la firma del server. Chiave
 * legata a `JWT_SECRET` ma distinta dalle sessioni, come i promemoria.
 */
export type IcsRole = "client" | "professional";

const DAY_MS = 24 * 60 * 60_000;
const ROLE_CODE: Record<IcsRole, string> = { client: "c", professional: "p" };

function key(): Buffer {
  return createHash("sha256")
    .update(`booking-ics:${process.env.JWT_SECRET ?? "dev-secret-change-me"}`)
    .digest();
}

function signature(body: string): string {
  return createHmac("sha256", key()).update(body).digest("base64url");
}

/** Scadenza: un mese dopo l'appuntamento (le email arrivano giorni prima), e mai meno di un giorno da adesso. */
export function bookingIcsExpiry(scheduledAt: Date, now = Date.now()): number {
  return Math.max(now + DAY_MS, scheduledAt.getTime() + 30 * DAY_MS);
}

export function bookingIcsToken(bookingId: string, role: IcsRole, expiresAt: number): string {
  const body = `${bookingId}.${ROLE_CODE[role]}.${Math.floor(expiresAt / 1000)}`;
  return `${body}.${signature(body)}`;
}

/** Lavoro e destinatario se la firma è giusta e il link non è scaduto, altrimenti `null`. */
export function readBookingIcsToken(token: string, now = Date.now()): { bookingId: string; role: IcsRole } | null {
  const match = /^([0-9a-f-]{36})\.([cp])\.(\d{1,12})\.([A-Za-z0-9_-]+)$/i.exec(token);
  const [, bookingId, code, exp, sig] = match ?? [];
  if (!bookingId || !code || !exp || !sig) return null;
  const given = Buffer.from(sig);
  const expected = Buffer.from(signature(`${bookingId}.${code}.${exp}`));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  if (Number(exp) * 1000 <= now) return null;
  return { bookingId, role: code === "p" ? "professional" : "client" };
}

