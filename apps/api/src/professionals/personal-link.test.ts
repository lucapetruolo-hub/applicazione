import { describe, expect, it, vi } from "vitest";
import { Prisma } from "@professionisti/database";
import { isPersonalLinkCode, ownClientRequest, personalInviteMessage } from "@professionisti/shared";
import { SubscriptionsService } from "../subscriptions/subscriptions.service";
import { PersonalLinkService, newPersonalLinkCode, personalLinkQrSvg } from "./personal-link.service";

/** Canale del professionista (docs/changelog/2026-11-08-canale-del-professionista.md). */
describe("codice del link personale", () => {
  it("6 caratteri senza quelli che si confondono", () => {
    for (let i = 0; i < 200; i += 1) {
      const code = newPersonalLinkCode();
      expect(isPersonalLinkCode(code)).toBe(true);
      expect(code).not.toMatch(/[01ilo]/);
    }
    expect(isPersonalLinkCode("abc12")).toBe(false);
    expect(isPersonalLinkCode("ABCDEF")).toBe(false);
  });

  it("il QR è un SVG", () => {
    expect(personalLinkQrSvg("https://esempio.it/p/abcdef")).toMatch(/^<svg/);
  });
});

function buildService(profile: Record<string, unknown> | null) {
  const prisma = {
    professionalProfile: {
      findUnique: vi.fn().mockResolvedValue(profile),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const subscriptions = { personalLinkUsage: vi.fn().mockResolvedValue({ requests: 2, jobs: 1 }) };
  return { service: new PersonalLinkService(prisma as never, subscriptions as never), prisma };
}

describe("PersonalLinkService", () => {
  it("crea il codice alla prima apertura, poi lo tiene", async () => {
    const { service, prisma } = buildService({ id: "pro-1", businessName: "Idraulica Rossi", personalLinkCode: null, deletedAt: null });
    const link = await service.getMine("user-1");
    expect(isPersonalLinkCode(link.code)).toBe(true);
    expect(link.path).toBe(`/p/${link.code}`);
    expect(prisma.professionalProfile.updateMany.mock.calls[0]![0].where).toEqual({ id: "pro-1", personalLinkCode: null });
    expect(link).toMatchObject({ requestsThisPeriod: 2, jobsThisPeriod: 1, businessName: "Idraulica Rossi" });

    const again = buildService({ id: "pro-1", businessName: "Idraulica Rossi", personalLinkCode: "k7m2qa", deletedAt: null });
    expect((await again.service.getMine("user-1")).code).toBe("k7m2qa");
    expect(again.prisma.professionalProfile.updateMany).not.toHaveBeenCalled();
  });

  it("se il codice è già di un altro ne prova un altro", async () => {
    const { service, prisma } = buildService({ id: "pro-1", businessName: "Rossi", personalLinkCode: null, deletedAt: null });
    prisma.professionalProfile.updateMany
      .mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError("unico", { code: "P2002", clientVersion: "6" }))
      .mockResolvedValueOnce({ count: 1 });
    const link = await service.getMine("user-1");
    expect(prisma.professionalProfile.updateMany).toHaveBeenCalledTimes(2);
    expect(isPersonalLinkCode(link.code)).toBe(true);
  });

  it("dal codice al profilo; un profilo sospeso o un codice strano non si trovano", async () => {
    const { service } = buildService({ id: "pro-1", businessName: "Rossi", city: "Latina", deletedAt: null, suspendedAt: null, invitePendingAt: null });
    await expect(service.resolve("K7M2QA")).resolves.toEqual({ id: "pro-1", businessName: "Rossi", city: "Latina" });
    await expect(service.resolve("../x")).rejects.toThrow("Link non trovato");
    const suspended = buildService({ id: "pro-1", businessName: "Rossi", city: "Latina", deletedAt: null, suspendedAt: new Date(), invitePendingAt: null });
    await expect(suspended.service.resolve("k7m2qa")).rejects.toThrow("Link non trovato");
  });
});

describe("lavori contati", () => {
  it("non contano i lavori dei clienti arrivati dal link, contano quelli senza preventivo", async () => {
    const prisma = {
      booking: { count: vi.fn().mockResolvedValue(2), findMany: vi.fn().mockResolvedValue([]) },
    };
    const service = new SubscriptionsService(prisma as never, {} as never, {} as never);
    await service.countUsedJobs("pro-1", null, new Date("2026-11-08T10:00:00Z"));
    const where = prisma.booking.count.mock.calls[0]![0].where;
    expect(where.OR).toEqual([{ quoteId: null }, { quote: { is: { guidedRequest: { fromProfessionalLink: false } } } }]);
    expect(where.NOT).toEqual({ status: "CANCELED", canceledBy: "CLIENT" });
  });
});

describe("testi e regole condivise", () => {
  it("il messaggio d'invito ha il nome, l'attività e il link", () => {
    const text = personalInviteMessage({ clientName: " Mario ", businessName: "Idraulica Rossi", siteName: "Professionisti", url: "https://x.it/p/abcdef" });
    expect(text).toMatch(/^Ciao Mario, sono Idraulica Rossi\./);
    expect(text).toContain("https://x.it/p/abcdef");
    expect(personalInviteMessage({ businessName: "Rossi", siteName: "P", url: "u" })).toMatch(/^Ciao, sono Rossi/);
  });

  it("per un altro professionista una richiesta inoltrata dal link non è un cliente suo", () => {
    expect(ownClientRequest({ fromProfessionalLink: true, professionalProfileId: "pro-1" }, "pro-1")).toBe(true);
    expect(ownClientRequest({ fromProfessionalLink: true, professionalProfileId: "pro-1" }, "pro-2")).toBe(false);
    expect(ownClientRequest({ fromProfessionalLink: false, professionalProfileId: "pro-1" }, "pro-1")).toBe(false);
  });
});
