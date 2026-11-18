import { describe, expect, it, vi } from "vitest";
import { BadRequestException } from "@nestjs/common";
import { completionDeclaration } from "@professionisti/shared";
import { BookingsService, earlyCompletionDates } from "./bookings.service";

/**
 * Tetto ai pagamenti online alla chiusura del lavoro
 * (docs/changelog/2026-10-28-tetto-pagamenti-online.md): un lavoro pagato
 * tutto online non si chiude sopra 2.000 €; col saldo diretto sì.
 */
function buildService(jobPayment: { paymentMethod: string; balanceDirect: boolean } | null) {
  const prisma = {
    professionalProfile: { findUnique: vi.fn().mockResolvedValue({ id: "pro-1", onlineLimitRemovedAt: null }) },
    booking: {
      findUnique: vi.fn().mockResolvedValue({
        id: "bk-1",
        professionalProfileId: "pro-1",
        clientId: "client-1",
        status: "CONFIRMED",
        scheduledAt: new Date("2026-01-10T09:00:00Z"),
        clientConfirmedCompletedAt: null,
        quote: { guidedRequestId: "gr-1", items: [{ name: "Manodopera", priceMinEurCents: 200000, priceMaxEurCents: 300000 }] },
      }),
      update: vi.fn(),
    },
    professionalFiscalProfile: { findUnique: vi.fn().mockResolvedValue({ entityType: "PRIVATE_INDIVIDUAL" }) },
    jobPayment: { findUnique: vi.fn().mockResolvedValue(jobPayment), findMany: vi.fn().mockResolvedValue([]) },
    bookingFinalItem: { deleteMany: vi.fn(), createMany: vi.fn() },
    $transaction: vi.fn().mockResolvedValue([]),
  };
  const jobPaymentsService = { createOnCompletion: vi.fn().mockResolvedValue(null) };
  const service = new BookingsService(
    prisma as never,
    { notify: vi.fn() } as never,
    { recordJobCompleted: vi.fn(), recordAppointmentOutcome: vi.fn() } as never,
    { log: vi.fn() } as never,
    jobPaymentsService as never,
    { afterJobAccepted: vi.fn() } as never,
    {} as never,
  );
  return { service, prisma, jobPaymentsService };
}

const input = {
  items: [{ name: "Manodopera", priceEurCents: 250000 }],
  photoUrls: [],
  declarationVersion: completionDeclaration("PRIVATE_INDIVIDUAL").version,
};

describe("chiusura del lavoro e tetto ai pagamenti online", () => {
  it("tutto online sopra il tetto: rifiutata con la frase da seguire", async () => {
    const { service, prisma } = buildService({ paymentMethod: "MANOVIA", balanceDirect: false });
    await expect(service.completeWithFinalAmount("pro-user-1", "bk-1", input)).rejects.toThrow(BadRequestException);
    await expect(service.completeWithFinalAmount("pro-user-1", "bk-1", input)).rejects.toThrow(/Indica 2\.000\u00A0€ e fatti pagare il resto direttamente/);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("col saldo diretto o col pagamento diretto si chiude", async () => {
    for (const jp of [{ paymentMethod: "MANOVIA", balanceDirect: true }, { paymentMethod: "DIRECT", balanceDirect: false }, null]) {
      const { service, prisma } = buildService(jp);
      await expect(service.completeWithFinalAmount("pro-user-1", "bk-1", input)).resolves.toMatchObject({ status: "COMPLETED" });
      expect(prisma.$transaction).toHaveBeenCalled();
    }
  });
});

describe("lavoro terminato prima dell'appuntamento (collaudo F-01, docs/changelog/2026-11-18-sposta-e-terminato-in-anticipo.md)", () => {
  it("il professionista non lo chiude prima del giorno senza la conferma del cliente", async () => {
    const { service, prisma } = buildService({ paymentMethod: "MANOVIA", balanceDirect: false });
    const future = { ...(await prisma.booking.findUnique()), scheduledAt: new Date(Date.now() + 3 * 86_400_000) };
    prisma.booking.findUnique.mockResolvedValue(future);

    await expect(service.completeWithFinalAmount("pro-user-1", "bk-1", input)).rejects.toThrow(/chiedi al cliente di confermare/);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("il cliente conferma anche prima del giorno; poi il professionista chiude e la data diventa oggi", async () => {
    const { service, prisma } = buildService({ paymentMethod: "DIRECT", balanceDirect: false });
    const scheduledAt = new Date(Date.now() + 3 * 86_400_000);
    const future = { ...(await prisma.booking.findUnique()), scheduledAt, scheduledEndAt: new Date(scheduledAt.getTime() + 2 * 3_600_000) };
    prisma.booking.findUnique.mockResolvedValue(future);
    (prisma as unknown as { professionalProfile: { findUnique: ReturnType<typeof vi.fn> } }).professionalProfile.findUnique.mockResolvedValue({ id: "pro-1", userId: "pro-user-1", onlineLimitRemovedAt: null });
    const confirmDirect = vi.fn();
    (service as unknown as { jobPaymentsService: { confirmDirect: unknown } }).jobPaymentsService.confirmDirect = confirmDirect;

    await expect(service.clientConfirmComplete("client-1", "bk-1", { photoUrls: [] } as never)).resolves.toEqual({ bookingId: "bk-1" });
    expect(prisma.booking.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ clientConfirmedCompletedAt: expect.any(Date) }) }));

    prisma.booking.findUnique.mockResolvedValue({ ...future, clientConfirmedCompletedAt: new Date() });
    prisma.booking.update.mockClear();
    await expect(service.completeWithFinalAmount("pro-user-1", "bk-1", input)).resolves.toMatchObject({ status: "COMPLETED" });
    const data = (prisma.booking.update.mock.calls.at(-1) as [{ data: { scheduledAt: Date; scheduledEndAt: Date } }])[0].data;
    expect(data.scheduledAt.getTime()).toBeLessThan(scheduledAt.getTime());
    expect(data.scheduledEndAt.getTime() - data.scheduledAt.getTime()).toBeLessThanOrEqual(2 * 3_600_000);
  });
});

describe("chiedere al cliente di confermare il lavoro fatto prima", () => {
  it("una volta sola, solo prima del giorno fissato, con l'avviso al cliente", async () => {
    const { service, prisma } = buildService(null);
    const notify = (service as unknown as { notificationsService: { notify: ReturnType<typeof vi.fn> } }).notificationsService.notify;
    (service as unknown as { professionalMetricsService: { touchActivity: unknown } }).professionalMetricsService.touchActivity = vi.fn();
    const future = { ...(await prisma.booking.findUnique()), scheduledAt: new Date(Date.now() + 3 * 86_400_000), scheduledEndAt: null, recurringJobId: null, earlyCompletionAskedAt: null };
    prisma.booking.findUnique.mockResolvedValue(future);
    (prisma.booking as unknown as { updateMany: unknown }).updateMany = vi.fn().mockResolvedValue({ count: 1 });

    await expect(service.askEarlyCompletion("pro-user-1", "bk-1")).resolves.toEqual({ bookingId: "bk-1" });
    expect(notify).toHaveBeenCalledWith("client-1", "JOB_EARLY_DONE_ASKED", expect.objectContaining({ bookingId: "bk-1" }));

    prisma.booking.findUnique.mockResolvedValue({ ...future, earlyCompletionAskedAt: new Date() });
    await expect(service.askEarlyCompletion("pro-user-1", "bk-1")).rejects.toThrow(/già chiesto/);
    prisma.booking.findUnique.mockResolvedValue({ ...future, scheduledAt: new Date(Date.now() - 3_600_000) });
    await expect(service.askEarlyCompletion("pro-user-1", "bk-1")).rejects.toThrow(/giorno del lavoro/);
  });
});

describe("date di un lavoro chiuso in anticipo", () => {
  it("finisce adesso, dura quanto prima e non comincia ieri", () => {
    // Le 10:30 a Roma (09:30 UTC in novembre) sono le 10:30 "di parete".
    const now = new Date("2026-11-18T09:30:00.000Z");
    const r = earlyCompletionDates(new Date("2026-11-25T14:00:00.000Z"), new Date("2026-11-25T16:00:00.000Z"), now);
    expect(r.scheduledEndAt?.toISOString()).toBe("2026-11-18T10:30:00.000Z");
    expect(r.scheduledAt.toISOString()).toBe("2026-11-18T08:30:00.000Z");
    const early = earlyCompletionDates(new Date("2026-11-25T08:00:00.000Z"), new Date("2026-11-25T18:00:00.000Z"), new Date("2026-11-18T00:30:00.000Z"));
    expect(early.scheduledAt.toISOString()).toBe("2026-11-18T00:00:00.000Z");
    expect(earlyCompletionDates(new Date("2026-11-25T08:00:00.000Z"), null, now)).toEqual({ scheduledAt: new Date("2026-11-18T10:30:00.000Z"), scheduledEndAt: null });
  });
});

describe("riapertura di un appuntamento annullato (collaudo F-08)", () => {
  it("un appuntamento già passato non si riapre", async () => {
    const { service, prisma } = buildService(null);
    prisma.booking.findUnique.mockResolvedValue({
      id: "bk-1",
      clientId: "client-1",
      status: "CANCELED",
      canceledBy: "CLIENT",
      scheduledAt: new Date(Date.now() - 2 * 86_400_000),
      quote: null,
      professionalProfile: { userId: "pro-user-1" },
    });
    (prisma.jobPayment as unknown as { findFirst: unknown }).findFirst = vi.fn().mockResolvedValue(null);

    await expect(service.reopenBooking("client-1", "bk-1")).rejects.toThrow(/già passata/);
    expect(prisma.booking.update).not.toHaveBeenCalled();
  });
});

describe("prezzo finale sopra il minimo: 48 ore al cliente (13/11)", () => {
  const close = (priceEurCents: number) => ({ ...input, items: [{ name: "Manodopera", priceEurCents }] });

  it("sopra il minimo il saldo aspetta, al minimo no", async () => {
    const { service, jobPaymentsService } = buildService(null);
    await service.completeWithFinalAmount("pro-user-1", "bk-1", close(250000));
    await service.completeWithFinalAmount("pro-user-1", "bk-1", close(200000));
    const calls = jobPaymentsService.createOnCompletion.mock.calls.map((call) => (call as [{ autoChargeBalance: boolean; waitForClient: boolean }])[0]);
    expect(calls[0]).toMatchObject({ autoChargeBalance: true, waitForClient: true });
    expect(calls[1]).toMatchObject({ autoChargeBalance: true, waitForClient: false });
  });

  it("aspetta anche se il cliente aveva già confermato il lavoro prima del prezzo", async () => {
    const { service, prisma, jobPaymentsService } = buildService(null);
    prisma.booking.findUnique.mockResolvedValue({ ...(await prisma.booking.findUnique()), clientConfirmedCompletedAt: new Date("2026-01-10T12:00:00Z") });
    await service.completeWithFinalAmount("pro-user-1", "bk-1", close(250000));
    expect(jobPaymentsService.createOnCompletion).toHaveBeenCalledWith(expect.objectContaining({ waitForClient: true }));
  });
});
