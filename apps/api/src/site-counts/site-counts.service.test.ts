import { describe, expect, it, vi } from "vitest";
import { SiteCountsService, UNKNOWN_JOB_MIN_DAYS, retentionCutoff, termHash } from "./site-counts.service";

/**
 * Conteggi dell'andamento del sito (docs/CHANGELOG.md §372): una parola
 * cercata resta un'impronta finché non arriva a 3 giorni diversi; i
 * contatori si cancellano dopo 25 mesi.
 */
function buildService(daysSoFar: number) {
  const prisma = {
    unknownJobSearchDay: { upsert: vi.fn(), count: vi.fn().mockResolvedValue(daysSoFar) },
    unknownJobTerm: { upsert: vi.fn() },
  };
  return { service: new SiteCountsService(prisma as never), prisma };
}

describe("SiteCountsService.recordUnknownJobSearch", () => {
  it("salva solo l'impronta finché la parola non è cercata in 3 giorni diversi", async () => {
    const { service, prisma } = buildService(UNKNOWN_JOB_MIN_DAYS - 1);
    await service.recordUnknownJobSearch("  Antennista ");
    expect(prisma.unknownJobSearchDay.upsert).toHaveBeenCalledOnce();
    expect(prisma.unknownJobSearchDay.upsert.mock.calls[0]?.[0].create.termHash).toBe(termHash("antennista"));
    expect(prisma.unknownJobTerm.upsert).not.toHaveBeenCalled();
  });

  it("al terzo giorno diverso salva la parola", async () => {
    const { service, prisma } = buildService(UNKNOWN_JOB_MIN_DAYS);
    await service.recordUnknownJobSearch("antennista");
    expect(prisma.unknownJobTerm.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: { termHash: termHash("antennista"), term: "antennista" } }));
  });

  it("non conta testi che possono dire chi è la persona (numeri, email, frasi)", async () => {
    for (const text of ["mario 3331234567", "mario@example.com", "cerco qualcuno per sistemare il tetto"]) {
      const { service, prisma } = buildService(10);
      await service.recordUnknownJobSearch(text);
      expect(prisma.unknownJobSearchDay.upsert).not.toHaveBeenCalled();
    }
  });
});

describe("retentionCutoff", () => {
  it("tiene 25 mesi", () => {
    expect(retentionCutoff(new Date("2026-10-27T10:00:00Z")).toISOString()).toBe("2024-09-27T00:00:00.000Z");
  });
});

describe("SiteCountsService.recordServiceSearch", () => {
  it("conta il nome dell'elenco, mai il testo cercato", async () => {
    const prisma = { serviceSearchDay: { upsert: vi.fn() } };
    const service = new SiteCountsService(prisma as never);
    await service.recordServiceSearch("STURATURA", "idraulico");
    expect(prisma.serviceSearchDay.upsert).toHaveBeenCalledOnce();
    expect(prisma.serviceSearchDay.upsert.mock.calls[0]?.[0].create).toMatchObject({ categorySlug: "idraulico", service: "Sturatura scarichi", count: 1 });
    await service.recordServiceSearch("mario rossi");
    expect(prisma.serviceSearchDay.upsert).toHaveBeenCalledOnce();
  });
});

describe("SiteCountsService: richieste dai profili per pulsante (§402)", () => {
  function build() {
    const prisma = { requestStepDay: { upsert: vi.fn() }, profileRequestSourceDay: { upsert: vi.fn() } };
    return { service: new SiteCountsService(prisma as never), prisma };
  }
  const withLaunch = async (value: string | undefined, run: () => Promise<void>) => {
    const before = process.env.LAUNCH_DATE;
    if (value === undefined) delete process.env.LAUNCH_DATE;
    else process.env.LAUNCH_DATE = value;
    try {
      await run();
    } finally {
      if (before === undefined) delete process.env.LAUNCH_DATE;
      else process.env.LAUNCH_DATE = before;
    }
  };

  it("dopo il lancio conta pulsante e dispositivo all'apertura e all'invio, non negli altri passi", async () => {
    await withLaunch("2020-01-01", async () => {
      const { service, prisma } = build();
      await service.recordStep("LAVORO", "idraulico", "PROFILE", { source: "BARRA", device: "TELEFONO" });
      await service.recordStep("DOVE", "idraulico", "PROFILE", { source: "BARRA", device: "TELEFONO" });
      await service.recordStep("INVIATA", "idraulico", "PROFILE", { device: "COMPUTER" });
      await service.recordStep("INVIATA", "idraulico", "GENERAL", { source: "BARRA", device: "COMPUTER" });
      await service.recordProfileView("TELEFONO");
      const created = prisma.profileRequestSourceDay.upsert.mock.calls.map((c) => c[0].create);
      expect(created).toEqual([
        expect.objectContaining({ event: "INIZIATA", source: "BARRA", device: "TELEFONO" }),
        expect.objectContaining({ event: "INVIATA", source: "ALTRO", device: "COMPUTER" }),
        expect.objectContaining({ event: "VISITA", source: "", device: "TELEFONO" }),
      ]);
      expect(prisma.requestStepDay.upsert).toHaveBeenCalledTimes(4);
    });
  });

  it("prima del lancio, o senza data del lancio, non conta niente: le prove non sporcano i numeri", async () => {
    for (const value of ["2999-01-01", undefined]) {
      await withLaunch(value, async () => {
        const { service, prisma } = build();
        await service.recordStep("INVIATA", "idraulico", "PROFILE", { source: "PAGINA", device: "COMPUTER" });
        await service.recordProfileView("COMPUTER");
        expect(prisma.profileRequestSourceDay.upsert).not.toHaveBeenCalled();
        // I passi della richiesta di §372 restano contati come prima.
        expect(prisma.requestStepDay.upsert).toHaveBeenCalledOnce();
      });
    }
  });
});
