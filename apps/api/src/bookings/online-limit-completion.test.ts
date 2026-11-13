import { describe, expect, it, vi } from "vitest";
import { BadRequestException } from "@nestjs/common";
import { completionDeclaration } from "@professionisti/shared";
import { BookingsService } from "./bookings.service";

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

describe("lavoro terminato prima dell'appuntamento (collaudo F-01)", () => {
  it("né il professionista né il cliente lo chiudono prima dell'ora dell'appuntamento", async () => {
    const { service, prisma } = buildService({ paymentMethod: "MANOVIA", balanceDirect: false });
    const future = { ...(await prisma.booking.findUnique()), scheduledAt: new Date(Date.now() + 3 * 86_400_000) };
    prisma.booking.findUnique.mockResolvedValue(future);

    await expect(service.completeWithFinalAmount("pro-user-1", "bk-1", input)).rejects.toThrow(/dal giorno dell'appuntamento/);
    await expect(service.clientConfirmComplete("client-1", "bk-1", { photoUrls: [] } as never)).rejects.toThrow(/dal giorno dell'appuntamento/);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.booking.update).not.toHaveBeenCalled();
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

  it("se il cliente ha già confermato il lavoro non aspetta", async () => {
    const { service, prisma, jobPaymentsService } = buildService(null);
    prisma.booking.findUnique.mockResolvedValue({ ...(await prisma.booking.findUnique()), clientConfirmedCompletedAt: new Date("2026-01-10T12:00:00Z") });
    await service.completeWithFinalAmount("pro-user-1", "bk-1", close(250000));
    expect(jobPaymentsService.createOnCompletion).toHaveBeenCalledWith(expect.objectContaining({ waitForClient: false }));
  });
});
