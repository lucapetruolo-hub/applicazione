import { describe, expect, it, vi } from "vitest";
import { ServiceNamesService } from "./service-names.service";
import { ProblemTakeoverService } from "./problem-takeover.service";

describe("ServiceNamesService", () => {
  it("un'unione fatta in admin vince sulla tabella dei sinonimi", async () => {
    const prisma = { serviceNameAlias: { findMany: vi.fn().mockResolvedValue([{ key: "rifaciment bagn", canonical: "Ristrutturazione bagno" }]) } };
    const canonical = await new ServiceNamesService(prisma as never).canonicalizer();
    expect(canonical("Rifacimento bagni")).toBe("Ristrutturazione bagno");
    expect(canonical("cambio serrature")).toBe("Sostituzione serratura");
    expect(canonical("Posa carta da parati")).toBe("Posa carta da parati");
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
    expect(prisma.problemTakeover.create).toHaveBeenCalledWith({ data: { userId: "u1", description: "boh", city: null, outOfService: null } });
  });
});
