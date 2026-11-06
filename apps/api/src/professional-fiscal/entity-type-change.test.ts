import { describe, expect, it, vi } from "vitest";
import { ProfessionalFiscalService } from "./professional-fiscal.service";

/** Il tipo lo cambia il professionista, ma non con Stripe già collegato (docs/changelog/2026-11-05-registrazione-colonna-unica.md). */
function build(existing: { entityType: string; stripeConnectAccountId: string | null }) {
  const prisma = {
    professionalProfile: { findUnique: vi.fn().mockResolvedValue({ id: "pro-1" }) },
    professionalFiscalProfile: {
      findUnique: vi.fn().mockResolvedValue({ id: "fp-1", representative: null, ...existing }),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      update: vi.fn(),
    },
    user: { findUnique: vi.fn().mockResolvedValue({ testAccountAt: null }) },
  };
  const service = new ProfessionalFiscalService(prisma as never, { record: vi.fn() } as never, {} as never, {} as never, {} as never);
  return { service, prisma };
}

describe("ProfessionalFiscalService.upsertMine — cambio del tipo", () => {
  it("con Stripe collegato il tipo non cambia", async () => {
    const { service, prisma } = build({ entityType: "SOLE_PROPRIETOR", stripeConnectAccountId: "acct_1" });
    await expect(service.upsertMine("user-1", { entityType: "PRIVATE_INDIVIDUAL" } as never)).rejects.toThrow("su Stripe il tipo non si cambia");
    expect(prisma.professionalFiscalProfile.update).not.toHaveBeenCalled();
  });

  it("senza Stripe il cambio non viene fermato da questo controllo", async () => {
    const { service } = build({ entityType: "SOLE_PROPRIETOR", stripeConnectAccountId: null });
    await expect(service.upsertMine("user-1", { entityType: "PRIVATE_INDIVIDUAL" } as never)).rejects.not.toThrow("su Stripe il tipo non si cambia");
  });
});

describe("ProfessionalFiscalService.upsertMine — passaggio a Privato", () => {
  it("cancella Partita IVA, REA e IVA nelle fatture del tipo di prima", async () => {
    const existing = {
      id: "fp-1",
      representative: null,
      entityType: "SOLE_PROPRIETOR",
      stripeConnectAccountId: null,
      vatNumber: "12345678903",
      businessRegistrationNumber: "LT-123456",
      chargesVat: true,
    };
    const prisma = {
      professionalProfile: { findUnique: vi.fn().mockResolvedValue({ id: "pro-1", businessName: "Mario Rossi" }) },
      professionalFiscalProfile: {
        findUnique: vi.fn().mockResolvedValue(existing),
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn(),
        update: vi.fn().mockRejectedValue(new Error("fermato dopo il salvataggio")),
      },
      user: { findUnique: vi.fn().mockResolvedValue({ testAccountAt: null }) },
    };
    const service = new ProfessionalFiscalService(prisma as never, { record: vi.fn() } as never, {} as never, {} as never, {} as never);
    await service.upsertMine("user-1", { entityType: "PRIVATE_INDIVIDUAL", vatNumber: "12345678903" } as never).catch(() => undefined);
    const data = prisma.professionalFiscalProfile.update.mock.calls[0]?.[0].data;
    expect(data).toMatchObject({ entityType: "PRIVATE_INDIVIDUAL", vatNumber: null, businessRegistrationNumber: null, chargesVat: null });
  });
});
