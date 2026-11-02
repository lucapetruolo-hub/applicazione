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

describe("ProfessionalFiscalService.upsertMine — mesi gratis una volta per partita IVA", () => {
  function buildWithSubscription(
    closedWithFreeMonths: boolean,
    mine = { freeMonthsGranted: 3, freeMonthsWaiting: 0 },
  ) {
    const saved = {
      id: "fp-2",
      vatNumber: "12345678903",
      fiscalCodiceFiscale: null,
    };
    const prisma = {
      professionalProfile: {
        findUnique: vi.fn().mockResolvedValue({ id: "pro-2" }),
      },
      professionalFiscalProfile: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValue(saved),
        // Primo giro: account attivi (nessuno); secondo: account chiusi con mesi gratis.
        findMany: vi
          .fn()
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce(
            closedWithFreeMonths
              ? [{ fiscalCodiceFiscale: null, vatNumber: "IT12345678903" }]
              : [],
          ),
        create: vi.fn().mockResolvedValue(saved),
        update: vi.fn().mockResolvedValue(saved),
      },
      subscription: { findUnique: vi.fn().mockResolvedValue(mine) },
      user: { findUnique: vi.fn().mockResolvedValue({ testAccountAt: null }) },
    };
    const subscriptions = { revokeUsedFreeMonths: vi.fn() };
    const service = new ProfessionalFiscalService(
      prisma as never,
      { record: vi.fn() } as never,
      {} as never,
      {} as never,
      { syncForFiscalProfile: vi.fn() } as never,
      undefined,
      subscriptions as never,
    );
    return { service, prisma, subscriptions };
  }

  it("toglie i mesi gratis se un account chiuso con la stessa partita IVA li aveva già avuti", async () => {
    const { service, prisma, subscriptions } = buildWithSubscription(true);
    await service.upsertMine("user-2", input);
    expect(subscriptions.revokeUsedFreeMonths).toHaveBeenCalledWith("pro-2");
    // Solo account chiusi, non dimostrativi né di prova, che avevano avuto mesi gratis.
    expect(
      prisma.professionalFiscalProfile.findMany.mock.calls[1]?.[0].where
        .professionalProfile,
    ).toEqual({
      isDemo: false,
      OR: [
        { deletedAt: { not: null } },
        { user: { deletedAt: { not: null } } },
      ],
      user: { testAccountAt: null },
      subscription: {
        OR: [{ freeMonthsGranted: null }, { freeMonthsGranted: { gt: 0 } }],
      },
    });
  });

  it("partita IVA mai usata prima: i mesi gratis restano", async () => {
    const { service, subscriptions } = buildWithSubscription(false);
    await service.upsertMine("user-2", input);
    expect(subscriptions.revokeUsedFreeMonths).not.toHaveBeenCalled();
  });

  it("nessun mese gratis su questo account: nessun controllo", async () => {
    const { service, prisma, subscriptions } = buildWithSubscription(true, {
      freeMonthsGranted: 0,
      freeMonthsWaiting: 0,
    });
    await service.upsertMine("user-2", input);
    expect(prisma.professionalFiscalProfile.findMany).toHaveBeenCalledTimes(1);
    expect(subscriptions.revokeUsedFreeMonths).not.toHaveBeenCalled();
  });
});
