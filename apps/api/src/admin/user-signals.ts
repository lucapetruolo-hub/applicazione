import type { PrismaClient } from "@professionisti/database";
import {
  MANY_ISSUES_COUNT,
  MANY_ISSUES_DAYS,
  NEW_CLIENT_DAYS,
  NEW_PROFESSIONAL_DAYS,
  QUICK_REVIEW_HOURS,
  REVIEW_BURST_COUNT,
  REVIEW_BURST_DAYS,
  isDisposableEmail,
  messageHasContacts,
  type AdminSignalRole,
  type AdminUserSignal,
  type AdminUserSignalKind,
} from "@professionisti/shared";
import { emailFingerprint } from "../common/email-fingerprint";
import { decryptFiscal } from "../common/fiscal-crypto";

/**
 * Segnali da controllare (docs/changelog/2026-10-30-admin-persone.md): stesso
 * telefono, indirizzo, codice fiscale o P.IVA di un altro account, recensione
 * scritta subito dopo l'iscrizione, lavoro chiuso prima dell'appuntamento,
 * acconto del 100% da un professionista nuovo, recensione tra due account con
 * gli stessi dati. Dal 02/11/2026 anche: stesso IBAN, contatti in chat prima
 * dell'accettazione, ritorno con l'email di un account chiuso, email usa e
 * getta, ondata di recensioni da clienti nuovi, troppi problemi accolti
 * (professionista) o respinti (cliente). Restano fuori gli account chiusi e
 * quelli di prova, che userebbero gli stessi dati di proposito.
 */
export type SignalPerson = { id: string; label: string; role?: AdminSignalRole };
export type SignalInput = {
  people: SignalPerson[];
  /** Un valore (telefono, indirizzo, codice fiscale) usato da una persona. */
  phones: { userId: string; value: string }[];
  addresses: { userId: string; value: string }[];
  taxIds: { userId: string; value: string }[];
  reviews: { clientId: string; clientCreatedAt: Date; createdAt: Date; proUserId: string; professionalLabel: string }[];
  completions: { proUserId: string; clientLabel: string; scheduledAt: Date; completedAt: Date }[];
  fullDeposits: { proUserId: string; proCreatedAt: Date; createdAt: Date; clientLabel: string }[];
  ibans?: { userId: string; value: string }[];
  /** Messaggi scritti a mano in chat prima che esistesse il lavoro (solo se contengono contatti). */
  chatContacts?: { userId: string; otherId: string; otherLabel: string }[];
  /** Account aperti con l'email di un account chiuso. */
  returned?: { userId: string; closedAt: Date; wasSuspended: boolean }[];
  emails?: { userId: string; email: string }[];
  issues?: { proUserId: string; clientId: string; status: string; createdAt: Date }[];
  now?: Date;
};

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

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

/** IBAN senza spazi, in maiuscolo. */
export function normalizeIban(value: string | null | undefined): string | null {
  const v = (value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return v.length >= 15 ? v : null;
}

export function normalizeTaxId(value: string | null | undefined): string | null {
  const v = (value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return v.length >= 11 ? v : null;
}

export function buildUserSignals(input: SignalInput): Map<string, AdminUserSignal[]> {
  const labels = new Map(input.people.map((p) => [p.id, p.label]));
  const roles = new Map(input.people.map((p) => [p.id, p.role]));
  const known = (id: string) => labels.has(id);
  const person = (id: string) => ({ id, label: labels.get(id) ?? "Account", ...(roles.get(id) ? { role: roles.get(id) } : {}) });
  /** Coppie di account con un dato in comune, per le recensioni tra loro. */
  const sameData = new Map<string, Set<string>>();
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
        const others = [...users].filter((id) => id !== userId).map(person);
        add(userId, { kind, detail: `anche ${others.map((o) => o.label).join(", ")}`, others });
        const set = sameData.get(userId) ?? new Set<string>();
        for (const o of others) set.add(o.id);
        sameData.set(userId, set);
      }
    }
  };
  shared(input.phones, "SAME_PHONE");
  shared(input.addresses, "SAME_ADDRESS");
  shared(input.taxIds, "SAME_TAX_ID");
  shared(input.ibans ?? [], "SAME_IBAN");

  for (const review of input.reviews) {
    const hours = (review.createdAt.getTime() - review.clientCreatedAt.getTime()) / HOUR_MS;
    const pro = known(review.proUserId) ? [person(review.proUserId)] : [];
    if (hours < QUICK_REVIEW_HOURS) {
      add(review.clientId, { kind: "QUICK_REVIEW", detail: `a ${review.professionalLabel}, ${Math.max(0, Math.round(hours))} ore dopo l'iscrizione`, others: pro });
    }
    // Il caso più chiaro di recensione finta: chi la scrive e chi la riceve hanno gli stessi dati.
    if (sameData.get(review.clientId)?.has(review.proUserId)) {
      add(review.clientId, { kind: "REVIEW_SAME_PERSON", detail: `a ${review.professionalLabel}`, others: pro });
      add(review.proUserId, { kind: "REVIEW_SAME_PERSON", detail: `da ${labels.get(review.clientId) ?? "Account"}`, others: [person(review.clientId)] });
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

  // Ondata di recensioni: almeno 3 in 7 giorni da clienti iscritti da meno di 30 giorni.
  const newClientReviews = new Map<string, Date[]>();
  for (const review of input.reviews) {
    if (review.createdAt.getTime() - review.clientCreatedAt.getTime() >= NEW_CLIENT_DAYS * DAY_MS) continue;
    const list = newClientReviews.get(review.proUserId) ?? [];
    list.push(review.createdAt);
    newClientReviews.set(review.proUserId, list);
  }
  for (const [proUserId, dates] of newClientReviews) {
    const sorted = dates.map((d) => d.getTime()).sort((a, b) => a - b);
    let best = 0;
    for (let i = 0, j = 0; i < sorted.length; i++) {
      while (sorted[i]! - sorted[j]! > REVIEW_BURST_DAYS * DAY_MS) j++;
      best = Math.max(best, i - j + 1);
    }
    if (best >= REVIEW_BURST_COUNT) add(proUserId, { kind: "REVIEW_BURST", detail: `${best} recensioni in ${REVIEW_BURST_DAYS} giorni da clienti appena iscritti`, others: [] });
  }

  // Contatti in chat prima dell'accettazione: un segnale per persona, con chi era dall'altra parte.
  const chats = new Map<string, Map<string, { label: string; count: number }>>();
  for (const row of input.chatContacts ?? []) {
    const byOther = chats.get(row.userId) ?? new Map<string, { label: string; count: number }>();
    const entry = byOther.get(row.otherId) ?? { label: row.otherLabel, count: 0 };
    entry.count += 1;
    byOther.set(row.otherId, entry);
    chats.set(row.userId, byOther);
  }
  for (const [userId, byOther] of chats) {
    const total = [...byOther.values()].reduce((sum, e) => sum + e.count, 0);
    const others = [...byOther.keys()].filter(known).map(person);
    const withWho = [...byOther.values()].map((e) => e.label).join(", ");
    add(userId, { kind: "CONTACTS_IN_CHAT", detail: `${total === 1 ? "1 messaggio" : `${total} messaggi`} con ${withWho}`, others });
  }

  for (const row of input.returned ?? []) {
    const when = row.closedAt.toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Rome" });
    add(row.userId, { kind: row.wasSuspended ? "RETURNED_AFTER_SUSPENSION" : "RETURNED_AFTER_CLOSE", detail: `account chiuso il ${when}`, others: [] });
  }
  for (const row of input.emails ?? []) {
    if (isDisposableEmail(row.email)) add(row.userId, { kind: "DISPOSABLE_EMAIL", detail: row.email.split("@")[1] ?? "", others: [] });
  }

  // Problemi sul lavoro negli ultimi 6 mesi: accolti contro il professionista, respinti per il cliente.
  const now = input.now ?? new Date();
  const upheld = new Map<string, number>();
  const rejected = new Map<string, number>();
  for (const issue of input.issues ?? []) {
    if (now.getTime() - issue.createdAt.getTime() > MANY_ISSUES_DAYS * DAY_MS) continue;
    if (issue.status === "UPHELD") upheld.set(issue.proUserId, (upheld.get(issue.proUserId) ?? 0) + 1);
    if (issue.status === "REJECTED") rejected.set(issue.clientId, (rejected.get(issue.clientId) ?? 0) + 1);
  }
  for (const [userId, count] of upheld) {
    if (count >= MANY_ISSUES_COUNT) add(userId, { kind: "MANY_UPHELD_ISSUES", detail: `${count} problemi sul lavoro accolti contro di lui in 6 mesi`, others: [] });
  }
  for (const [userId, count] of rejected) {
    if (count >= MANY_ISSUES_COUNT) add(userId, { kind: "MANY_REJECTED_ISSUES", detail: `${count} problemi sul lavoro segnalati e respinti in 6 mesi`, others: [] });
  }
  return result;
}

export function personLabel(user: { name: string | null; surname: string | null; email: string | null; professionalProfile?: { businessName: string } | null }): string {
  return user.professionalProfile?.businessName || [user.name, user.surname].filter(Boolean).join(" ") || user.email || "Account";
}

const PERSON_SELECT = { id: true, name: true, surname: true, email: true, professionalProfile: { select: { businessName: true } } } as const;

/**
 * Carica i dati dell'ultimo anno e calcola i segnali di tutti. Lo fa il
 * controllo del mattino (SuspiciousAccountsService), che salva il risultato:
 * le pagine leggono solo quello.
 */
export async function loadUserSignals(prisma: PrismaClient, now: Date = new Date()): Promise<{ signals: Map<string, AdminUserSignal[]>; people: Map<string, SignalPerson & { role: AdminSignalRole }> }> {
  const since = new Date(now.getTime() - 365 * 24 * HOUR_MS);
  const [users, requests, fiscal, reviews, completions, fullDeposits, payouts, chatMessages, bookingsByPair, closedAccounts, issues] = await Promise.all([
    prisma.user.findMany({
      where: { deletedAt: null, testAccountAt: null },
      select: { ...PERSON_SELECT, role: true, phone: true, phoneVerifiedNumber: true, street: true, houseNumber: true, city: true, createdAt: true },
    }),
    prisma.guidedRequest.findMany({
      where: { createdAt: { gte: since } },
      select: { clientId: true, recipientPhone: true, address: true, houseNumber: true, city: true },
    }),
    prisma.professionalFiscalProfile.findMany({ select: { fiscalCodiceFiscale: true, vatNumber: true, professionalProfile: { select: { userId: true } } } }),
    prisma.review.findMany({
      // Una recensione già nascosta da un admin è un caso chiuso.
      where: { createdAt: { gte: since }, hiddenAt: null },
      select: { createdAt: true, booking: { select: { clientId: true, client: { select: { createdAt: true } }, professionalProfile: { select: { businessName: true, userId: true } } } } },
    }),
    prisma.booking.findMany({
      where: { professionalCompletedAt: { gte: since } },
      select: { scheduledAt: true, professionalCompletedAt: true, client: { select: PERSON_SELECT }, professionalProfile: { select: { userId: true } } },
    }),
    prisma.quote.findMany({
      where: { depositPercent: 100, createdAt: { gte: since } },
      select: { createdAt: true, professionalProfile: { select: { userId: true, user: { select: { createdAt: true } } } }, guidedRequest: { select: { client: { select: PERSON_SELECT } } } },
    }),
    prisma.professionalPayoutAccount.findMany({ select: { ibanEncrypted: true, fiscalProfile: { select: { professionalProfile: { select: { userId: true } } } } } }),
    // Solo i messaggi scritti a mano; il testo serve solo a contare quelli con contatti, non si salva.
    prisma.conversationEvent.findMany({
      where: { createdAt: { gte: since }, automatic: false, actor: { in: ["CLIENT", "PROFESSIONAL"] } },
      select: {
        guidedRequestId: true,
        professionalProfileId: true,
        actor: true,
        message: true,
        createdAt: true,
        guidedRequest: { select: { client: { select: { ...PERSON_SELECT } } } },
        professionalProfile: { select: { userId: true, businessName: true } },
      },
    }),
    prisma.booking.findMany({ where: { guidedRequestId: { not: null }, createdAt: { gte: since } }, select: { guidedRequestId: true, professionalProfileId: true, createdAt: true } }),
    prisma.user.findMany({
      where: { deletedAt: { not: null }, deletedEmailHash: { not: null } },
      select: { deletedEmailHash: true, deletedAt: true, suspendedAt: true, professionalProfile: { select: { suspendedAt: true } } },
    }),
    prisma.jobIssue.findMany({
      where: { createdAt: { gte: since }, status: { in: ["UPHELD", "REJECTED"] } },
      select: { status: true, createdAt: true, booking: { select: { clientId: true, professionalProfile: { select: { userId: true } } } } },
    }),
  ]);

  const people = new Map(users.map((u) => [u.id, { id: u.id, label: personLabel(u), role: u.role as AdminSignalRole }]));
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

  const ibans: SignalInput["ibans"] = [];
  for (const p of payouts) {
    const iban = normalizeIban(decryptFiscal(p.ibanEncrypted));
    if (iban) ibans.push({ userId: p.fiscalProfile.professionalProfile.userId, value: iban });
  }

  // Un messaggio conta se è stato scritto prima del lavoro tra quelle due persone (o se il lavoro non c'è).
  const bookedAt = new Map(bookingsByPair.map((b) => [`${b.guidedRequestId}|${b.professionalProfileId}`, b.createdAt.getTime()]));
  const chatContacts: SignalInput["chatContacts"] = [];
  for (const m of chatMessages) {
    const booked = bookedAt.get(`${m.guidedRequestId}|${m.professionalProfileId}`);
    if (booked !== undefined && m.createdAt.getTime() >= booked) continue;
    if (!messageHasContacts(m.message)) continue;
    const client = m.guidedRequest.client;
    if (m.actor === "PROFESSIONAL") chatContacts.push({ userId: m.professionalProfile.userId, otherId: client.id, otherLabel: personLabel(client) });
    else chatContacts.push({ userId: client.id, otherId: m.professionalProfile.userId, otherLabel: m.professionalProfile.businessName });
  }

  // Chi si è iscritto con l'email di un account chiuso (impronta HMAC, mai l'email).
  const closedByHash = new Map<string, { closedAt: Date; wasSuspended: boolean }>();
  for (const c of closedAccounts) {
    if (!c.deletedEmailHash || !c.deletedAt) continue;
    const prev = closedByHash.get(c.deletedEmailHash);
    const wasSuspended = Boolean(c.suspendedAt || c.professionalProfile?.suspendedAt) || Boolean(prev?.wasSuspended);
    const closedAt = prev && prev.closedAt > c.deletedAt ? prev.closedAt : c.deletedAt;
    closedByHash.set(c.deletedEmailHash, { closedAt, wasSuspended });
  }
  const returned: SignalInput["returned"] = [];
  const emails: SignalInput["emails"] = [];
  for (const u of users) {
    if (!u.email) continue;
    emails.push({ userId: u.id, email: u.email });
    const closed = closedByHash.size ? closedByHash.get(emailFingerprint(u.email)) : undefined;
    if (closed && closed.closedAt <= u.createdAt) returned.push({ userId: u.id, ...closed });
  }

  const signals = buildUserSignals({
    now,
    ibans,
    chatContacts,
    returned,
    emails,
    issues: issues.map((i) => ({ proUserId: i.booking.professionalProfile.userId, clientId: i.booking.clientId, status: i.status, createdAt: i.createdAt })),
    people: [...people.values()],
    phones,
    addresses,
    taxIds,
    reviews: reviews.map((r) => ({
      clientId: r.booking.clientId,
      clientCreatedAt: r.booking.client.createdAt,
      createdAt: r.createdAt,
      proUserId: r.booking.professionalProfile.userId,
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
