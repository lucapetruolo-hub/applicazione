import type { Prisma } from "@professionisti/database";
import { emailFingerprint } from "../common/email-fingerprint";

/**
 * Ricerca negli archivi admin (rimborsi, contestazioni, problemi sul lavoro,
 * docs/changelog/2026-10-28-stripe-prova.md): un solo campo che trova il
 * lavoro per cliente (anche nome e cognome insieme), email, professionista,
 * descrizione della richiesta o codice del lavoro.
 */
export function bookingSearchWhere(query: string): Prisma.BookingWhereInput | null {
  const q = query.trim().slice(0, 100);
  if (!q) return null;
  const text = { contains: q, mode: "insensitive" as const };
  const or: Prisma.BookingWhereInput[] = [
    { id: text },
    { client: { OR: [{ name: text }, { surname: text }, { email: text }] } },
    { professionalProfile: { businessName: text } },
    { quote: { guidedRequest: { description: text } } },
  ];
  const words = q.split(/\s+/).filter(Boolean);
  if (words.length > 1) {
    or.push({
      client: { AND: words.map((w) => ({ OR: [{ name: { contains: w, mode: "insensitive" as const } }, { surname: { contains: w, mode: "insensitive" as const } }] })) },
    });
  }
  return { OR: or };
}

/** Cifra in euro scritta dall'admin ("220", "220,50", "1.200 €") in centesimi, null se non è una cifra. */
export function searchEurCents(query: string): number | null {
  const cleaned = query.trim().replace(/[€\s]/g, "").replace(/\./g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const cents = Math.round(Number(cleaned) * 100);
  return cents > 0 ? cents : null;
}

/**
 * Ricerca delle persone in Admin (docs/changelog/2026-10-30-admin-persone.md):
 * ogni parola deve stare in email, nome, cognome o nome dell'attività, così
 * "Vera Russo" trova Vera Russo. Con un'email esatta trova anche l'account
 * chiuso, dall'impronta dell'email (l'email vera non c'è più).
 */
export function userSearchWhere(query: string): Prisma.UserWhereInput | null {
  const q = query.trim().slice(0, 100);
  if (!q) return null;
  const words = q.split(/\s+/).filter(Boolean);
  const byWords: Prisma.UserWhereInput = {
    AND: words.map((w) => {
      const text = { contains: w, mode: "insensitive" as const };
      return { OR: [{ email: text }, { name: text }, { surname: text }, { professionalProfile: { businessName: text } }] };
    }),
  };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(q)) return byWords;
  return { OR: [byWords, { deletedEmailHash: emailFingerprint(q) }] };
}
