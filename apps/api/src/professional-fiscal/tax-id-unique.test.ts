import { describe, expect, it, vi } from "vitest";
import { ProfessionalFiscalService } from "./professional-fiscal.service";

/** Un codice fiscale e una partita IVA per un solo account (collaudo P-03). */
function build(others: { fiscalCodiceFiscale: string | null; vatNumber: string | null }[], testAccount = false) {
  const prisma = {
    professionalProfile: { findUnique: vi.fn().mockResolvedValue({ id: "pro-2" }) },
    professionalFiscalProfile: {
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue(others),
      create: vi.fn().mockResolvedValue({ id: "fp-2" }),
      update: vi.fn(),
    },
    user: { findUnique: vi.fn().mockResolvedValue({ testAccountAt: testAccount ? new Date() : null }) },
  };
  const service = new ProfessionalFiscalService(prisma as never, { record: vi.fn() } as never, {} as never, {} as never, {} as never);
  return { service, prisma };
}

const input = { entityType: "BUSINESS", businessName: "Doppio SRL", vatNumber: "12345678903" } as never;

describe("ProfessionalFiscalService.upsertMine — dati fiscali già usati", () => {
  it("rifiuta una partita IVA già legata a un altro account, senza salvare", async () => {
    const { service, prisma } = build([{ fiscalCodiceFiscale: null, vatNumber: "IT 12345678903" }]);
    await expect(service.upsertMine("user-2", input)).rejects.toThrow("Questa partita IVA è già legata a un altro account");
    expect(prisma.professionalFiscalProfile.create).not.toHaveBeenCalled();
    // Solo account attivi, non dimostrativi né di prova, e mai il proprio profilo.
    expect(prisma.professionalFiscalProfile.findMany.mock.calls[0]?.[0].where).toMatchObject({
      professionalProfileId: { not: "pro-2" },
      professionalProfile: { deletedAt: null, isDemo: false, user: { deletedAt: null, testAccountAt: null } },
    });
  });

  it("un account di prova può riusare i dati di proposito", async () => {
    const { service, prisma } = build([{ fiscalCodiceFiscale: null, vatNumber: "12345678903" }], true);
    await service.upsertMine("user-2", input).catch(() => undefined);
    expect(prisma.professionalFiscalProfile.findMany).not.toHaveBeenCalled();
  });
});
