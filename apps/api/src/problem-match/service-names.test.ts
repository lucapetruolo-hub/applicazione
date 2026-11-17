import { describe, expect, it, vi } from "vitest";
import { ServiceNamesService, countSearchedServices, rankSearchedServices } from "./service-names.service";
import { ProblemMatchAdminService } from "./problem-match-admin.service";
import { ProblemTakeoverService } from "./problem-takeover.service";

describe("ServiceNamesService", () => {
  it("un'unione fatta in admin vince sulla tabella dei sinonimi", async () => {
    const prisma = {
      serviceNameAlias: { findMany: vi.fn().mockResolvedValue([{ key: "rifaciment bagn", canonical: "Ristrutturazione bagno" }]) },
      standardServiceName: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const canonical = await new ServiceNamesService(prisma as never).canonicalizer();
    expect(canonical("Rifacimento bagni")).toBe("Ristrutturazione bagno");
    expect(canonical("cambio serrature")).toBe("Sostituzione serratura");
    expect(canonical("Posa carta da parati")).toBe("Posa carta da parati");
  });
});

describe("Prestazioni per mestiere (§388)", () => {
  const profile = (slug: string, extra: string[] = []) => ({ category: { slug }, extraCategories: extra.map((s) => ({ slug: s })) });
  function setup(
    services: { name: string; professionalProfileId: string; professionalProfile: ReturnType<typeof profile> }[],
    standard: object[] = [],
    searches: { slug: string; service: string; count: bigint }[] = [],
  ) {
    const prisma = {
      professionalService: { findMany: vi.fn().mockResolvedValue(services) },
      $queryRaw: vi.fn().mockResolvedValue(searches),
      serviceNameAlias: { findMany: vi.fn().mockResolvedValue([]) },
      standardServiceName: {
        findMany: vi.fn().mockResolvedValue(standard),
        create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: "s1", ...data })),
      },
    };
    const audit = { record: vi.fn() };
    const names = new ServiceNamesService(prisma as never);
    return { prisma, service: new ProblemMatchAdminService(prisma as never, audit as never, {} as never, names, {} as never) };
  }

  it("conta chi usa le standard e mette a parte quelle scritte a mano, per ogni mestiere del professionista", async () => {
    const { service } = setup([
      { name: "cambio serrature", professionalProfileId: "p1", professionalProfile: profile("fabbro") },
      { name: "Pulizia pannelli solari", professionalProfileId: "p2", professionalProfile: profile("pulizie", ["tuttofare"]) },
      { name: "pulizia pannelli solari", professionalProfileId: "p3", professionalProfile: profile("pulizie") },
    ]);
    const overview = await service.handwrittenServices();
    const fabbro = overview.categories.find((c) => c.slug === "fabbro");
    expect(fabbro?.standard.find((s) => s.name === "Sostituzione serratura")?.professionalCount).toBe(1);
    expect(fabbro?.handwritten).toEqual([]);
    const pulizie = overview.categories.find((c) => c.slug === "pulizie");
    expect(pulizie?.handwritten).toEqual([
      { name: "Pulizia pannelli solari", variants: ["Pulizia pannelli solari", "pulizia pannelli solari"], professionalCount: 2 },
    ]);
    expect(overview.categories.find((c) => c.slug === "tuttofare")?.handwritten[0]?.professionalCount).toBe(1);
  });

  it("accanto alle più cercate dai clienti, quanti professionisti le offrono", async () => {
    const { service } = setup(
      [{ name: "Sturatura scarichi", professionalProfileId: "p1", professionalProfile: profile("idraulico") }],
      [],
      [
        { slug: "idraulico", service: "Sturatura scarichi", count: 40n },
        { slug: "idraulico", service: "Sostituzione sifone", count: 3n },
      ],
    );
    const idraulico = (await service.handwrittenServices()).categories.find((c) => c.slug === "idraulico");
    expect(idraulico?.searched).toEqual([
      { name: "Sturatura scarichi", searchCount: 40, professionalCount: 1 },
      { name: "Sostituzione sifone", searchCount: 3, professionalCount: 0 },
    ]);
  });

  it("una prestazione aggiunta alle standard non è più tra le scritte a mano", async () => {
    const { service } = setup(
      [{ name: "pulizia pannelli solari", professionalProfileId: "p3", professionalProfile: profile("pulizie") }],
      [{ id: "s1", categorySlug: "pulizie", name: "Pulizia pannelli solari", createdAt: new Date() }],
    );
    const pulizie = (await service.handwrittenServices()).categories.find((c) => c.slug === "pulizie");
    expect(pulizie?.handwritten).toEqual([]);
    expect(pulizie?.standard.find((s) => s.name === "Pulizia pannelli solari")).toEqual({
      name: "Pulizia pannelli solari",
      id: "s1",
      professionalCount: 1,
    });
  });

  it("non aggiunge un doppione di una standard né una categoria sconosciuta", async () => {
    const { service, prisma } = setup([]);
    await expect(service.addStandardService("a1", { name: "sostituzione serrature", categorySlug: "fabbro" })).rejects.toThrow();
    await expect(service.addStandardService("a1", { name: "Qualcosa", categorySlug: "inventata" })).rejects.toThrow();
    expect(await service.addStandardService("a1", { name: "pulizia  pannelli solari", categorySlug: "pulizie" })).toEqual({
      id: "s1",
      categorySlug: "pulizie",
      name: "Pulizia pannelli solari",
    });
    expect(prisma.standardServiceName.create).toHaveBeenCalledTimes(1);
  });
});

describe("ProblemTakeoverService", () => {
  it("la stessa richiesta mandata due volte resta una", async () => {
    const prisma = {
      problemTakeover: {
        findFirst: vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "t1" }),
        create: vi.fn().mockResolvedValue({ id: "t1" }),
      },
    };
    const service = new ProblemTakeoverService(prisma as never);
    const input = { description: "antenna da orientare", city: "Latina", outOfService: "antennista" };
    expect(await service.create("u1", input)).toEqual({ id: "t1" });
    expect(await service.create("u1", input)).toEqual({ id: "t1" });
    expect(prisma.problemTakeover.create).toHaveBeenCalledTimes(1);
  });

  it("un tipo di lavoro sconosciuto non si salva", async () => {
    const prisma = { problemTakeover: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({ id: "t2" }) } };
    await new ProblemTakeoverService(prisma as never).create("u1", { description: "boh", outOfService: "inventato" });
    expect(prisma.problemTakeover.create).toHaveBeenCalledWith({
      data: { userId: "u1", description: "boh", city: null, outOfService: null, missingTrade: null },
    });
  });

  // docs/changelog/2026-11-11-mestieri-che-mancano.md
  it("salva il mestiere che non abbiamo, pulito", async () => {
    const prisma = { problemTakeover: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({ id: "t3" }) } };
    await new ProblemTakeoverService(prisma as never).create("u1", { description: "orlo dei pantaloni", missingTrade: " sarto " });
    expect(prisma.problemTakeover.create).toHaveBeenCalledWith({
      data: { userId: "u1", description: "orlo dei pantaloni", city: null, outOfService: null, missingTrade: "Sarto" },
    });
  });
});

describe("Prestazioni più cercate dai clienti (docs/changelog/2026-11-17-prestazioni-veloci.md)", () => {
  const same = (name: string) => (name === "Perdite" ? "Riparazione perdita d'acqua" : name);
  it("somma le varianti, ordina per ricerche e scarta le cercate una volta", () => {
    const counts = countSearchedServices(
      [
        { slug: "idraulico", service: "Sturatura scarichi", count: 3n },
        { slug: "idraulico", service: "Riparazione perdita d'acqua", count: 2n },
        { slug: "idraulico", service: "Perdite", count: 2n },
        { slug: "idraulico", service: "Sostituzione sifone", count: 1n },
        { slug: "elettricista", service: "Sostituzione presa", count: 1n },
      ],
      same,
    );
    expect(counts.idraulico).toEqual({ "Sturatura scarichi": 3, "Riparazione perdita d'acqua": 4, "Sostituzione sifone": 1 });
    expect(rankSearchedServices(counts)).toEqual({ idraulico: ["Riparazione perdita d'acqua", "Sturatura scarichi"] });
  });

  it("legge il database una volta ogni dieci minuti", async () => {
    const prisma = {
      $queryRaw: vi.fn().mockResolvedValue([{ slug: "pulizie", service: "Pulizie di casa", count: 4n }]),
      serviceNameAlias: { findMany: vi.fn().mockResolvedValue([]) },
      standardServiceName: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const service = new ServiceNamesService(prisma as never);
    const now = new Date("2026-11-17T10:00:00Z");
    expect(await service.searchedByCategory(now)).toEqual({ pulizie: ["Pulizie di casa"] });
    await service.searchedByCategory(new Date(now.getTime() + 5 * 60_000));
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    await service.searchedByCategory(new Date(now.getTime() + 11 * 60_000));
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
  });
});
