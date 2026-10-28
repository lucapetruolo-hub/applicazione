import { describe, expect, it, vi } from "vitest";
import { ServiceNamesService } from "./service-names.service";
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
  ) {
    const prisma = {
      professionalService: { findMany: vi.fn().mockResolvedValue(services) },
      serviceNameAlias: { findMany: vi.fn().mockResolvedValue([]) },
      standardServiceName: {
        findMany: vi.fn().mockResolvedValue(standard),
        create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: "s1", ...data })),
      },
    };
    const audit = { record: vi.fn() };
    const names = new ServiceNamesService(prisma as never);
    return { prisma, service: new ProblemMatchAdminService(prisma as never, audit as never, {} as never, names) };
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
      data: { userId: "u1", description: "boh", city: null, outOfService: null },
    });
  });
});
