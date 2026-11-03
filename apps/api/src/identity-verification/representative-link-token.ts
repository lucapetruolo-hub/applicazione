import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * Link per il legale rappresentante di un'azienda (collaudo E-03, M-07,
 * docs/changelog/2026-11-02-iscrizione-verifica-professionisti.md): il
 * consenso al confronto del volto lo dà lui, dal suo telefono, senza un
 * account. Il link porta l'id del profilo e la scadenza con una firma del
 * server; la firma comprende nome e cognome del legale rappresentante, così
 * cambiandolo nei dati fiscali il vecchio link non vale più.
 */
export const REPRESENTATIVE_LINK_DAYS = 7;

function key(): Buffer {
  return createHash("sha256")
    .update(`representative-link:${process.env.JWT_SECRET ?? "dev-secret-change-me"}`)
    .digest();
}

function personKey(person: { firstName: string; lastName: string }): string {
  return `${person.firstName.trim().toLowerCase()}|${person.lastName.trim().toLowerCase()}`;
}

function signature(profileId: string, expiresAtMs: number, person: { firstName: string; lastName: string }): string {
  return createHmac("sha256", key()).update(`${profileId}.${expiresAtMs}.${personKey(person)}`).digest("base64url");
}

export function representativeLinkToken(profileId: string, person: { firstName: string; lastName: string }, now: Date = new Date()): { token: string; expiresAt: Date } {
  const expiresAt = new Date(now.getTime() + REPRESENTATIVE_LINK_DAYS * 24 * 60 * 60_000);
  return { token: `${profileId}.${expiresAt.getTime()}.${signature(profileId, expiresAt.getTime(), person)}`, expiresAt };
}

/** Id del profilo e scadenza, se il link ha la forma giusta (la firma si controlla con `representativeLinkValid`). */
export function parseRepresentativeLinkToken(token: string): { profileId: string; expiresAtMs: number; sig: string } | null {
  const match = /^([0-9a-f-]{36})\.(\d{10,16})\.([A-Za-z0-9_-]{20,100})$/i.exec(token);
  if (!match) return null;
  return { profileId: match[1]!, expiresAtMs: Number(match[2]), sig: match[3]! };
}

/** Firma giusta per questo legale rappresentante e link non scaduto. */
export function representativeLinkValid(
  parsed: { profileId: string; expiresAtMs: number; sig: string },
  person: { firstName: string; lastName: string },
  now: Date = new Date(),
): boolean {
  if (parsed.expiresAtMs < now.getTime()) return false;
  const given = Buffer.from(parsed.sig);
  const expected = Buffer.from(signature(parsed.profileId, parsed.expiresAtMs, person));
  return given.length === expected.length && timingSafeEqual(given, expected);
}
