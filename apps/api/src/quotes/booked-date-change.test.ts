import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@professionisti/database";
import { QuotesService } from "./quotes.service";
import { proposedByProfessionalFirst } from "./booked-date-change";
import type { NotificationsService } from "../notifications/notifications.service";
import type { ProfessionalMetricsService } from "../professional-metrics/professional-metrics.service";
import type { TimelineService } from "../timeline/timeline.service";
import type { SubscriptionsService } from "../subscriptions/subscriptions.service";
import type { WhatsAppService } from "../whatsapp/whatsapp.service";

// "Non posso più" → "Proponi un'altra data" su un appuntamento già fissato
// passa dalla stessa proposta di data del preventivo
// (docs/changelog/2026-10-28-promemoria-whatsapp.md).

const FAR = new Date("2099-03-10T10:00:00.000Z");
const FAR_END = new Date("2099-03-10T12:00:00.000Z");

function setup(options: { otherBookings?: { scheduledAt: Date; scheduledEndAt: Date | null; serviceMode: string | null }[]; depositKept?: boolean } = {}) {
  const booking: Record<string, unknown> = {
    id: "b1",
    status: "CONFIRMED",
    scheduledAt: FAR,
    scheduledEndAt: FAR_END,
    serviceMode: "HOME",
    clientConfirmedAt: new Date("2099-03-01T10:00:00.000Z"),
    clientCantComeAt: null,
    rescheduleRequestedAt: null,
    rescheduleProposedBy: null,
    rescheduleReminderAt: null,
    rescheduleRounds: 0,
    reminderSentAt: new Date("2099-03-09T08:00:00.000Z"),
    clientDepositReminderAt: null,
    clientReplyChannel: "WHATSAPP",
    cancellationNoticeHours: 24,
    recurringJobId: null,
  };
  const quote: Record<string, unknown> = {
    id: "q1",
    status: "ACCEPTED",
    guidedRequestId: "r1",
    professionalProfileId: "p1",
    estimatedStartDate: FAR,
    estimatedEndDate: FAR_END,
    clientProposedDate: null,
    clientProposedEndDate: null,
    clientProposedNote: null,
    clientNote: null,
    professionalCounterNote: null,
    guidedRequest: { clientId: "c1", serviceMode: "HOME", closedReason: "COMPLETED" },
    professionalProfile: { userId: "pro1" },
  };
  const own = () => ({ ...quote, booking: { ...booking } });
  const prisma = {
    professionalProfile: { findUnique: vi.fn(async () => ({ id: "p1", userId: "pro1", cancellationNoticeHours: 24 })) },
    quote: {
      findUnique: vi.fn(async () => own()),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => Object.assign(quote, data)),
    },
    booking: {
      // Soldi e preavviso del lavoro, per la nuova scadenza nell'email (docs/changelog/2026-11-13-annullare-spostamento.md).
      findUnique: vi.fn(async () => ({
        cancellationNoticeHours: 24,
        acceptedTerms: null,
        finalAmountEurCents: null,
        jobPayment: options.depositKept
          ? { paymentMethod: "MANOVIA", balanceDirect: true, onlineStage: "DEPOSIT_PAID", depositEurCents: 2400, paidEurCents: 2400, refundedEurCents: 0, platformFeeEurCents: 0, stripeFeeEurCents: 0, netAmountEurCents: 0, releaseDueAt: null, releasedAt: null, balanceUnpaidAt: null }
          : null,
        quote: { lateCancelKeepsDeposit: !!options.depositKept, items: [{ priceMinEurCents: 12000, priceMaxEurCents: 12000 }] },
      })),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        // `{ increment: n }` di Prisma, per i giri di proposte.
        for (const [key, value] of Object.entries(data)) {
          booking[key] = value && typeof value === "object" && "increment" in value ? Number(booking[key] ?? 0) + Number((value as { increment: number }).increment) : value;
        }
        return booking;
      }),
      updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        if (booking.status !== where.status || booking.rescheduleRequestedAt === null) return { count: 0 };
        Object.assign(booking, data);
        return { count: 1 };
      }),
      findMany: vi.fn(async () => [{ professionalProfileId: "p1", scheduledAt: booking.scheduledAt, scheduledEndAt: booking.scheduledEndAt, serviceMode: "HOME" }, ...(options.otherBookings ?? []).map((b) => ({ professionalProfileId: "p1", ...b }))]),
    },
    externalJob: { findMany: vi.fn(async () => []) },
    // Spostamenti per le Statistiche (docs/changelog/2026-11-18-sposta-e-terminato-in-anticipo.md).
    bookingReschedule: { create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => data) },
    availabilitySlot: { findMany: vi.fn(async () => []) },
    $executeRaw: vi.fn(async () => 1),
    $transaction: vi.fn(async (arg: unknown) => (typeof arg === "function" ? (arg as (tx: unknown) => Promise<unknown>)(prisma) : Promise.all(arg as Promise<unknown>[]))),
  };
  const notify = vi.fn(async () => undefined);
  const log = vi.fn(async () => undefined);
  const forgetBookingReminders = vi.fn(async () => undefined);
  const afterJobAccepted = vi.fn(async () => undefined);
  const service = new QuotesService(
    prisma as unknown as PrismaClient,
    { notify } as unknown as NotificationsService,
    { recordJobAccepted: vi.fn(), touchActivity: vi.fn() } as unknown as ProfessionalMetricsService,
    { log } as unknown as TimelineService,
    { afterJobAccepted } as unknown as SubscriptionsService,
    { forgetBookingReminders } as unknown as WhatsAppService,
  );
  return { service, booking, quote, prisma, notify, log, forgetBookingReminders, afterJobAccepted };
}

const PROPOSAL = { date: "2099-03-12", startTime: "15:00", endTime: "17:00", note: "Posso solo il pomeriggio", isManual: true };

describe("Altra data per un appuntamento già fissato, dalla proposta standard", () => {
  it("il cliente propone: il preventivo resta accettato, la proposta sta sul preventivo", async () => {
    const { service, booking, quote, notify, log } = setup();
    await service.proposeDate("c1", "q1", PROPOSAL);
    expect(quote.status).toBe("ACCEPTED");
    expect((quote.clientProposedDate as Date).toISOString()).toBe("2099-03-12T15:00:00.000Z");
    expect((quote.clientProposedEndDate as Date).toISOString()).toBe("2099-03-12T17:00:00.000Z");
    expect(quote.clientProposedNote).toBe("Posso solo il pomeriggio");
    // L'appuntamento resta com'era finché il professionista non risponde.
    expect(booking.scheduledAt).toBe(FAR);
    expect(booking.rescheduleRequestedAt).toBeInstanceOf(Date);
    expect(booking.clientConfirmedAt).toBeNull();
    expect(booking.clientCantComeAt).toBeInstanceOf(Date);
    expect(notify).toHaveBeenCalledWith("pro1", "QUOTE_DATE_PROPOSED", expect.objectContaining({ bookingId: "b1", booked: true, change: "both" }));
    expect(log).toHaveBeenCalledWith("r1", "p1", "CLIENT", expect.stringContaining("spostare l'appuntamento"));
  });

  it("la stessa data dell'appuntamento non è una proposta", async () => {
    const { service } = setup();
    await expect(service.proposeDate("c1", "q1", { date: "2099-03-10", startTime: "10:00", endTime: "12:00", isManual: true })).rejects.toThrow("È la data dell'appuntamento");
  });

  it("niente proposta su un appuntamento annullato", async () => {
    const { service, booking } = setup();
    booking.status = "CANCELED";
    await expect(service.proposeDate("c1", "q1", PROPOSAL)).rejects.toThrow("non si può più spostare");
  });

  it("il professionista accetta: l'appuntamento si sposta e promemoria e risposte ripartono", async () => {
    const { service, booking, quote, notify, forgetBookingReminders, afterJobAccepted } = setup();
    await service.proposeDate("c1", "q1", PROPOSAL);
    notify.mockClear();
    const result = await service.confirmProposedDate("pro1", "q1");
    expect(result).toEqual({ bookingId: "b1" });
    expect((booking.scheduledAt as Date).toISOString()).toBe("2099-03-12T15:00:00.000Z");
    expect((booking.scheduledEndAt as Date).toISOString()).toBe("2099-03-12T17:00:00.000Z");
    expect(booking.rescheduleRequestedAt).toBeNull();
    expect(booking.reminderSentAt).toBeNull();
    expect(booking.clientCantComeAt).toBeNull();
    expect(booking.clientReplyChannel).toBeNull();
    expect((quote.estimatedStartDate as Date).toISOString()).toBe("2099-03-12T15:00:00.000Z");
    expect(quote.clientProposedDate).toBeNull();
    expect(quote.status).toBe("ACCEPTED");
    expect(forgetBookingReminders).toHaveBeenCalledWith("b1", expect.any(Date));
    expect(notify).toHaveBeenCalledWith("c1", "QUOTE_DATE_CONFIRMED", expect.objectContaining({ bookingId: "b1", booked: true }));
    // Non è un lavoro nuovo: niente conteggio nell'abbonamento.
    expect(afterJobAccepted).not.toHaveBeenCalled();
  });

  it("la fascia nuova già piena non si accetta", async () => {
    const { service } = setup({ otherBookings: [{ scheduledAt: new Date("2099-03-12T15:00:00.000Z"), scheduledEndAt: new Date("2099-03-12T17:00:00.000Z"), serviceMode: "HOME" }] });
    await service.proposeDate("c1", "q1", PROPOSAL);
    await expect(service.confirmProposedDate("pro1", "q1")).rejects.toThrow("non è più libera");
  });

  it("il professionista rifiuta: l'appuntamento resta com'era", async () => {
    const { service, booking, quote, notify } = setup();
    await service.proposeDate("c1", "q1", PROPOSAL);
    notify.mockClear();
    await service.rejectProposedDate("pro1", "q1");
    expect(booking.scheduledAt).toBe(FAR);
    expect(booking.rescheduleRequestedAt).toBeNull();
    expect(quote.clientProposedDate).toBeNull();
    expect(quote.status).toBe("ACCEPTED");
    expect(notify).toHaveBeenCalledWith("c1", "QUOTE_DATE_REJECTED", expect.objectContaining({ bookingId: "b1", booked: true }));
  });

  it("senza una proposta in sospeso non c'è nulla da accettare", async () => {
    const { service } = setup();
    await expect(service.confirmProposedDate("pro1", "q1")).rejects.toThrow("Nessuna data proposta");
  });

  it("il cliente non accetta la data che ha proposto lui", async () => {
    const { service } = setup();
    await service.proposeDate("c1", "q1", PROPOSAL);
    await expect(service.confirmProposedDate("c1", "q1")).rejects.toThrow("Hai proposto tu");
  });

  it("\"Modifica\" del professionista: il cliente accetta e l'appuntamento si sposta", async () => {
    const { service, booking, quote, notify, log } = setup();
    await service.proposeDate("c1", "q1", PROPOSAL);
    await service.counterProposeDate("pro1", "q1", { date: "2099-03-13", startTime: "09:00", endTime: "11:00", note: "Il 12 non riesco", isManual: true });
    expect(booking.rescheduleProposedBy).toBe("PROFESSIONAL");
    expect((quote.clientProposedDate as Date).toISOString()).toBe("2099-03-13T09:00:00.000Z");
    expect(quote.professionalCounterNote).toBe("Il 12 non riesco");
    expect(quote.status).toBe("ACCEPTED");
    expect(notify).toHaveBeenCalledWith("c1", "QUOTE_DATE_CHANGED", expect.objectContaining({ booked: true, bookingId: "b1" }));
    // Ora tocca al cliente: il professionista non può accettare la sua stessa proposta.
    await expect(service.confirmProposedDate("pro1", "q1")).rejects.toThrow("Hai proposto tu");
    notify.mockClear();
    await service.confirmProposedDate("c1", "q1");
    expect((booking.scheduledAt as Date).toISOString()).toBe("2099-03-13T09:00:00.000Z");
    expect(booking.rescheduleProposedBy).toBeNull();
    expect(quote.professionalCounterNote).toBeNull();
    expect(notify).toHaveBeenCalledWith("pro1", "QUOTE_DATE_CONFIRMED_BY_CLIENT", expect.objectContaining({ bookingId: "b1" }));
    expect(log).toHaveBeenLastCalledWith("r1", "p1", "CLIENT", expect.stringContaining("Il cliente ha accettato"));
  });

  it("il cliente rifiuta la data del professionista: l'appuntamento resta com'era", async () => {
    const { service, booking, notify } = setup();
    await service.proposeDate("c1", "q1", PROPOSAL);
    await service.counterProposeDate("pro1", "q1", { date: "2099-03-13", startTime: "09:00", endTime: "11:00", isManual: true });
    notify.mockClear();
    await service.rejectProposedDate("c1", "q1");
    expect(booking.scheduledAt).toBe(FAR);
    expect(booking.rescheduleRequestedAt).toBeNull();
    expect(notify).toHaveBeenCalledWith("pro1", "QUOTE_DATE_REJECTED_BY_CLIENT", expect.objectContaining({ bookingId: "b1" }));
  });

  it("l'email della data spostata dice la nuova scadenza per annullare (docs/changelog/2026-11-13-annullare-spostamento.md)", async () => {
    const { service, notify } = setup({ depositKept: true });
    await service.proposeDate("c1", "q1", PROPOSAL);
    notify.mockClear();
    await service.confirmProposedDate("pro1", "q1");
    expect(notify).toHaveBeenCalledWith(
      "c1",
      "QUOTE_DATE_CONFIRMED",
      expect.objectContaining({ cancelNotice: expect.stringMatching(/^Annullamento gratuito fino a mercoledì 11 marzo alle 15:00\. Dopo, l'acconto di 24,00\s€ non è rimborsabile\.$/) }),
    );
  });

  it("senza acconto trattenuto, al professionista si dice entro quando il cliente deve avvisare", async () => {
    const { service, notify } = setup();
    await service.proposeDate("c1", "q1", PROPOSAL);
    await service.counterProposeDate("pro1", "q1", { date: "2099-03-13", startTime: "09:00", endTime: "11:00", isManual: true });
    notify.mockClear();
    await service.confirmProposedDate("c1", "q1");
    expect(notify).toHaveBeenCalledWith("pro1", "QUOTE_DATE_CONFIRMED_BY_CLIENT", expect.objectContaining({ cancelNotice: "Se annulla, il cliente deve avvisarti entro giovedì 12 marzo alle 09:00." }));
  });

  it("il professionista propone per primo un'altra data: il cliente risponde, l'appuntamento resta finché non accetta", async () => {
    const { service, booking, quote, notify, log, prisma } = setup();
    await service.counterProposeDate("pro1", "q1", { date: "2099-03-13", startTime: "09:00", endTime: "11:00", note: "Mi si è rotto il furgone", isManual: true });
    expect(booking.scheduledAt).toBe(FAR);
    expect(booking.rescheduleProposedBy).toBe("PROFESSIONAL");
    // Non è il cliente a non poter venire: può annullare gratis finché non risponde.
    expect(booking.clientCantComeAt).toBeNull();
    expect(quote.professionalCounterNote).toBe("Mi si è rotto il furgone");
    expect(notify).toHaveBeenCalledWith("c1", "QUOTE_DATE_CHANGED", expect.objectContaining({ booked: true, fromProfessional: true, change: "both" }));
    expect(log).toHaveBeenCalledWith("r1", "p1", "PROFESSIONAL", expect.stringContaining("propone di spostare"));
    expect(prisma.bookingReschedule.create).toHaveBeenCalledWith({ data: expect.objectContaining({ bookingId: "b1", proposedBy: "PROFESSIONAL", late: false }) });
    await expect(service.counterProposeDate("pro1", "q1", { date: "2099-03-14", startTime: "09:00", endTime: "11:00", isManual: true })).rejects.toThrow("aspetta la risposta");
    await service.confirmProposedDate("c1", "q1");
    expect((booking.scheduledAt as Date).toISOString()).toBe("2099-03-13T09:00:00.000Z");
  });

  it("niente proposta del professionista sulla stessa data o su una visita di un lavoro ricorrente", async () => {
    const { service, booking } = setup();
    await expect(service.counterProposeDate("pro1", "q1", { date: "2099-03-10", startTime: "10:00", endTime: "12:00", isManual: true })).rejects.toThrow("scegline un'altra");
    booking.recurringJobId = "serie1";
    await expect(service.counterProposeDate("pro1", "q1", { date: "2099-03-13", startTime: "09:00", endTime: "11:00", isManual: true })).rejects.toThrow("lavoro ricorrente");
  });

  it("conta i giri di proposte senza accordo e li azzera all'accordo", async () => {
    const { service, booking } = setup();
    await service.proposeDate("c1", "q1", PROPOSAL);
    expect(booking.rescheduleRounds).toBe(1);
    await service.counterProposeDate("pro1", "q1", { date: "2099-03-13", startTime: "09:00", endTime: "11:00", isManual: true });
    expect(booking.rescheduleRounds).toBe(2);
    await service.proposeDate("c1", "q1", { ...PROPOSAL, date: "2099-03-14" });
    expect(booking.rescheduleRounds).toBe(3);
    await service.confirmProposedDate("pro1", "q1");
    expect(booking.rescheduleRounds).toBe(0);
  });

  it("la proposta del cliente resta segnata per le Statistiche", async () => {
    const { service, prisma } = setup();
    await service.proposeDate("c1", "q1", PROPOSAL);
    expect(prisma.bookingReschedule.create).toHaveBeenCalledWith({ data: expect.objectContaining({ proposedBy: "CLIENT", professionalProfileId: "p1", late: false }) });
  });
});

describe("chi ha chiesto per primo lo spostamento", () => {
  it("solo il professionista che propone senza una richiesta del cliente", () => {
    const at = new Date("2099-03-01T10:00:00.000Z");
    expect(proposedByProfessionalFirst({ rescheduleRequestedAt: at, rescheduleProposedBy: "PROFESSIONAL", clientCantComeAt: null })).toBe(true);
    expect(proposedByProfessionalFirst({ rescheduleRequestedAt: at, rescheduleProposedBy: "PROFESSIONAL", clientCantComeAt: at })).toBe(false);
    expect(proposedByProfessionalFirst({ rescheduleRequestedAt: at, rescheduleProposedBy: "CLIENT", clientCantComeAt: null })).toBe(false);
    expect(proposedByProfessionalFirst({ rescheduleRequestedAt: null, rescheduleProposedBy: null, clientCantComeAt: null })).toBe(false);
  });
});
