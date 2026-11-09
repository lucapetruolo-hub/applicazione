import { externalClientKey, formatBookingAddress, type ProfessionalClient, type ProfessionalClientJob } from "@professionisti/shared";

/** Righe lette dal database, ridotte al necessario (provabili senza Prisma). */
export type ClientBookBooking = {
  id: string;
  clientId: string;
  status: "PENDING" | "CONFIRMED" | "COMPLETED" | "CANCELED" | "NO_SHOW";
  scheduledAt: Date;
  finalAmountEurCents: number | null;
  recipientPhone: string | null;
  street: string | null;
  houseNumber: string | null;
  addressExtra: string | null;
  postalCode: string | null;
  city: string | null;
  province: string | null;
  client: { name: string | null; surname: string | null; phone: string | null; email: string | null; deletedAt: Date | null };
  quote: { guidedRequestId: string; items: { name: string }[]; guidedRequest: { category: { label: string } } } | null;
};

export type ClientBookExternalJob = {
  id: string;
  clientName: string;
  clientPhone: string | null;
  address: string | null;
  description: string | null;
  scheduledAt: Date;
  priceEurCents: number | null;
  status: "SCHEDULED" | "COMPLETED" | "CANCELED";
};

const BOOKING_STATUS: Record<ClientBookBooking["status"], ProfessionalClientJob["status"]> = {
  PENDING: "SCHEDULED",
  CONFIRMED: "SCHEDULED",
  COMPLETED: "COMPLETED",
  CANCELED: "CANCELED",
  NO_SHOW: "CANCELED",
};

type Draft = Omit<ProfessionalClient, "jobsDone" | "lastJobAt" | "nextJobAt" | "totalEurCents" | "note">;

/**
 * Rubrica "I miei clienti" (docs/changelog/2026-11-08-rubrica-clienti.md).
 * Clienti del sito: solo con almeno un lavoro accettato e non annullato
 * (CLAUDE.md §5 punto 9: i contatti si vedono solo dopo l'impegno
 * reciproco) e mai chi ha chiuso l'account. Clienti esterni: raggruppati
 * per telefono, altrimenti per nome (`externalClientKey`). Ordine: chi ha un
 * appuntamento in arrivo per primo, poi l'ultimo lavoro più recente.
 * Date e `now` in ora italiana scritta come UTC, come in tutta l'agenda.
 * Il nome è quello scritto più per intero ("Luigi Neri" batte "Luigi").
 */
export function buildClientBook(bookings: ClientBookBooking[], externalJobs: ClientBookExternalJob[], notes: Map<string, string>, now: Date): ProfessionalClient[] {
  const drafts = new Map<string, Draft>();

  const committed = new Set(bookings.filter((b) => b.status === "CONFIRMED" || b.status === "COMPLETED").map((b) => b.clientId));
  const sortedBookings = [...bookings].sort((a, b) => b.scheduledAt.getTime() - a.scheduledAt.getTime());
  for (const booking of sortedBookings) {
    if (!committed.has(booking.clientId) || booking.client.deletedAt) continue;
    const key = `u:${booking.clientId}`;
    let draft = drafts.get(key);
    if (!draft) {
      draft = {
        key,
        kind: "SITE",
        name: [booking.client.name, booking.client.surname].filter(Boolean).join(" ") || "Cliente",
        phone: booking.recipientPhone ?? booking.client.phone,
        email: booking.client.email,
        address: formatBookingAddress(booking),
        jobs: [],
        chatGuidedRequestId: booking.quote?.guidedRequestId ?? null,
      };
      drafts.set(key, draft);
    }
    draft.phone ??= booking.recipientPhone ?? booking.client.phone;
    draft.address ??= formatBookingAddress(booking);
    draft.chatGuidedRequestId ??= booking.quote?.guidedRequestId ?? null;
    draft.jobs.push({
      id: booking.id,
      kind: "BOOKING",
      label: booking.quote?.items[0]?.name ?? booking.quote?.guidedRequest.category.label ?? "Lavoro dal sito",
      at: booking.scheduledAt.toISOString(),
      status: BOOKING_STATUS[booking.status],
      amountEurCents: booking.finalAmountEurCents,
      guidedRequestId: booking.quote?.guidedRequestId ?? null,
    });
  }

  const sortedExternal = [...externalJobs].sort((a, b) => b.scheduledAt.getTime() - a.scheduledAt.getTime());
  for (const job of sortedExternal) {
    const key = externalClientKey(job.clientName, job.clientPhone);
    let draft = drafts.get(key);
    if (!draft) {
      draft = { key, kind: "EXTERNAL", name: job.clientName.trim(), phone: job.clientPhone, email: null, address: job.address, jobs: [], chatGuidedRequestId: null };
      drafts.set(key, draft);
    }
    if (job.clientName.trim().length > draft.name.length) draft.name = job.clientName.trim();
    draft.phone ??= job.clientPhone;
    draft.address ??= job.address;
    draft.jobs.push({
      id: job.id,
      kind: "EXTERNAL",
      label: job.description?.trim() || "Lavoro aggiunto in agenda",
      at: job.scheduledAt.toISOString(),
      status: job.status,
      amountEurCents: job.priceEurCents,
      guidedRequestId: null,
    });
  }

  const clients = [...drafts.values()].map((draft): ProfessionalClient => {
    const done = draft.jobs.filter((j) => j.status === "COMPLETED");
    const upcoming = draft.jobs.filter((j) => j.status === "SCHEDULED" && new Date(j.at) >= now).map((j) => j.at).sort();
    const past = draft.jobs.filter((j) => j.status !== "CANCELED" && new Date(j.at) < now);
    return {
      ...draft,
      jobsDone: done.length,
      lastJobAt: past[0]?.at ?? null,
      nextJobAt: upcoming[0] ?? null,
      totalEurCents: done.reduce((sum, j) => sum + (j.amountEurCents ?? 0), 0),
      note: notes.get(draft.key) ?? null,
    };
  });

  return clients.sort((a, b) => {
    if (a.nextJobAt && b.nextJobAt) return a.nextJobAt.localeCompare(b.nextJobAt);
    if (a.nextJobAt || b.nextJobAt) return a.nextJobAt ? -1 : 1;
    return (b.lastJobAt ?? b.jobs[0]?.at ?? "").localeCompare(a.lastJobAt ?? a.jobs[0]?.at ?? "");
  });
}
