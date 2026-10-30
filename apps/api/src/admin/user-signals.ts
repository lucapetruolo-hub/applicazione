import type { PrismaClient } from "@professionisti/database";
import { NEW_PROFESSIONAL_DAYS, QUICK_REVIEW_HOURS, type AdminUserSignal, type AdminUserSignalKind } from "@professionisti/shared";

/**
 * Segnali da controllare (docs/changelog/2026-10-30-admin-persone.md): stesso
 * telefono, indirizzo, codice fiscale o P.IVA di un altro account, recensione
 * scritta subito dopo l'iscrizione, lavoro chiuso prima dell'appuntamento,
 * acconto del 100% da un professionista nuovo. Restano fuori gli account
 * chiusi e quelli di prova, che userebbero gli stessi dati di proposito.
 */
export type SignalPerson = { id: string; label: string };
export type SignalInput = {
  people: SignalPerson[];
  /** Un valore (telefono, indirizzo, codice fiscale) usato da una persona. */
  phones: { userId: string; value: string }[];
  addresses: { userId: string; value: string }[];
  taxIds: { userId: string; value: string }[];
  reviews: { clientId: string; clientCreatedAt: Date; createdAt: Date; professionalLabel: string }[];
  completions: { proUserId: string; clientLabel: string; scheduledAt: Date; completedAt: Date }[];
  fullDeposits: { proUserId: string; proCreatedAt: Date; createdAt: Date; clientLabel: string }[];
};

const HOUR_MS = 60 * 60 * 1000;

/** Solo le ultime 10 cifre: "+39 333 123 4567" e "3331234567" sono lo stesso numero. */
export function normalizePhone(value: string | null | undefined): string | null {
  const digits = (value ?? "").replace(/\D/g, "");
  return digits.length >= 8 ? digits.slice(-10) : null;
}

/** Via, civico e città in minuscolo senza punteggiatura; senza civico non conta (troppo vago). */
export function normalizeAddress(street: string | null | undefined, houseNumber: string | null | undefined, city: string | null | undefined): string | null {
  const clean = (v: string | null | undefined) => (v ?? "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const s = clean(street);
  const n = clean(houseNumber);
  const c = clean(city);
  return s && n && c ? `${s}|${n}|${c}` : null;
}

export function normalizeTaxId(value: string | null | undefined): string | null {
  const v = (value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return v.length >= 11 ? v : null;
}

export function buildUserSignals(input: SignalInput): Map<string, AdminUserSignal[]> {
  const labels = new Map(input.people.map((p) => [p.id, p.label]));
  const known = (id: string) => labels.has(id);
  const result = new Map<string, AdminUserSignal[]>();
  const add = (userId: string, signal: AdminUserSignal) => {
    if (!known(userId)) return;
    const list = result.get(userId) ?? [];
    if (!list.some((s) => s.kind === signal.kind && s.detail === signal.detail)) list.push(signal);
    result.set(userId, list);
  };

  const shared = (rows: { userId: string; value: string }[], kind: AdminUserSignalKind) => {
    const byValue = new Map<string, Set<string>>();
    for (const row of rows) {
      if (!known(row.userId)) continue;
      const set = byValue.get(row.value) ?? new Set<string>();
      set.add(row.userId);
      byValue.set(row.value, set);
    }
    for (const users of byValue.values()) {
      if (users.size < 2) continue;
      for (const userId of users) {
        const others = [...users].filter((id) => id !== userId).map((id) => ({ id, label: labels.get(id) ?? "Account" }));
        add(userId, { kind, detail: `anche ${others.map((o) => o.label).join(", ")}`, others });
      }
    }
  };
  shared(input.phones, "SAME_PHONE");
  shared(input.addresses, "SAME_ADDRESS");
  shared(input.taxIds, "SAME_TAX_ID");

  for (const review of input.reviews) {
    const hours = (review.createdAt.getTime() - review.clientCreatedAt.getTime()) / HOUR_MS;
    if (hours < QUICK_REVIEW_HOURS) {
      add(review.clientId, { kind: "QUICK_REVIEW", detail: `a ${review.professionalLabel}, ${Math.max(0, Math.round(hours))} ore dopo l'iscrizione`, others: [] });
    }
  }
  for (const job of input.completions) {
    if (job.completedAt.getTime() < job.scheduledAt.getTime()) {
      add(job.proUserId, { kind: "CLOSED_BEFORE_APPOINTMENT", detail: `lavoro per ${job.clientLabel}`, others: [] });
    }
  }
  for (const quote of input.fullDeposits) {
    if (quote.createdAt.getTime() - quote.proCreatedAt.getTime() < NEW_PROFESSIONAL_DAYS * 24 * HOUR_MS) {
      add(quote.proUserId, { kind: "FULL_DEPOSIT_NEW_PRO", detail: `preventivo per ${quote.clientLabel}`, others: [] });
    }
  }
  return result;
}

export function personLabel(user: { name: string | null; surname: string | null; email: string | null; professionalProfile?: { businessName: string } | null }): string {
  return user.professionalProfile?.businessName || [user.name, user.surname].filter(Boolean).join(" ") || user.email || "Account";
}

const PERSON_SELECT = { id: true, name: true, surname: true, email: true, professionalProfile: { select: { businessName: true } } } as const;

/**
 * Carica i dati dell'ultimo anno e calcola i segnali di tutti: con i numeri
 * di oggi (pochi account) basta una lettura alla volta; se un giorno
 * diventasse lenta, si sposta in un calcolo notturno salvato.
 */
export async function loadUserSignals(prisma: PrismaClient, now: Date = new Date()): Promise<{ signals: Map<string, AdminUserSignal[]>; people: Map<string, SignalPerson & { role: "CLIENT" | "PROFESSIONAL" | "ADMIN" }> }> {
  const since = new Date(now.getTime() - 365 * 24 * HOUR_MS);
  const [users, requests, fiscal, reviews, completions, fullDeposits] = await Promise.all([
    prisma.user.findMany({
      where: { deletedAt: null, testAccountAt: null },
      select: { ...PERSON_SELECT, role: true, phone: true, phoneVerifiedNumber: true, street: true, houseNumber: true, city: true },
    }),
    prisma.guidedRequest.findMany({
      where: { createdAt: { gte: since } },
      select: { clientId: true, recipientPhone: true, address: true, houseNumber: true, city: true },
    }),
    prisma.professionalFiscalProfile.findMany({ select: { fiscalCodiceFiscale: true, vatNumber: true, professionalProfile: { select: { userId: true } } } }),
    prisma.review.findMany({
      where: { createdAt: { gte: since } },
      select: { createdAt: true, booking: { select: { clientId: true, client: { select: { createdAt: true } }, professionalProfile: { select: { businessName: true } } } } },
    }),
    prisma.booking.findMany({
      where: { professionalCompletedAt: { gte: since } },
      select: { scheduledAt: true, professionalCompletedAt: true, client: { select: PERSON_SELECT }, professionalProfile: { select: { userId: true } } },
    }),
    prisma.quote.findMany({
      where: { depositPercent: 100, createdAt: { gte: since } },
      select: { createdAt: true, professionalProfile: { select: { userId: true, user: { select: { createdAt: true } } } }, guidedRequest: { select: { client: { select: PERSON_SELECT } } } },
    }),
  ]);

  const people = new Map(users.map((u) => [u.id, { id: u.id, label: personLabel(u), role: u.role }]));
  const phones: SignalInput["phones"] = [];
  const addresses: SignalInput["addresses"] = [];
  for (const u of users) {
    for (const p of new Set([normalizePhone(u.phone), normalizePhone(u.phoneVerifiedNumber)])) if (p) phones.push({ userId: u.id, value: p });
    const a = normalizeAddress(u.street, u.houseNumber, u.city);
    if (a) addresses.push({ userId: u.id, value: a });
  }
  for (const r of requests) {
    const p = normalizePhone(r.recipientPhone);
    if (p) phones.push({ userId: r.clientId, value: p });
    const a = normalizeAddress(r.address, r.houseNumber, r.city);
    if (a) addresses.push({ userId: r.clientId, value: a });
  }
  const taxIds: SignalInput["taxIds"] = [];
  for (const f of fiscal) {
    for (const v of new Set([normalizeTaxId(f.fiscalCodiceFiscale), normalizeTaxId(f.vatNumber)])) if (v) taxIds.push({ userId: f.professionalProfile.userId, value: v });
  }

  const signals = buildUserSignals({
    people: [...people.values()],
    phones,
    addresses,
    taxIds,
    reviews: reviews.map((r) => ({
      clientId: r.booking.clientId,
      clientCreatedAt: r.booking.client.createdAt,
      createdAt: r.createdAt,
      professionalLabel: r.booking.professionalProfile.businessName,
    })),
    completions: completions.flatMap((b) =>
      b.professionalCompletedAt ? [{ proUserId: b.professionalProfile.userId, clientLabel: personLabel(b.client), scheduledAt: b.scheduledAt, completedAt: b.professionalCompletedAt }] : [],
    ),
    fullDeposits: fullDeposits.map((q) => ({
      proUserId: q.professionalProfile.userId,
      proCreatedAt: q.professionalProfile.user.createdAt,
      createdAt: q.createdAt,
      clientLabel: personLabel(q.guidedRequest.client),
    })),
  });
  return { signals, people };
}
