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
  const service = new BookingsService(
    prisma as never,
    { notify: vi.fn() } as never,
    { recordJobCompleted: vi.fn(), recordAppointmentOutcome: vi.fn() } as never,
    { log: vi.fn() } as never,
    { createOnCompletion: vi.fn().mockResolvedValue(null) } as never,
    { afterJobAccepted: vi.fn() } as never,
    {} as never,
  );
  return { service, prisma };
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
