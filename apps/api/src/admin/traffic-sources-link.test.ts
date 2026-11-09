import { describe, expect, it, vi } from "vitest";
import { AdminService } from "./admin.service";

/** Admin → Da dove arrivano le richieste: il canale del professionista (docs/changelog/2026-11-08-canale-del-professionista.md). */
describe("richieste dal link personale in Admin", () => {
  it("conta le richieste dal link e quanti professionisti diversi le hanno portate", async () => {
    const rows = [
      { id: "r1", submissionGroupId: null, trafficSource: "direct", fromProfessionalLink: true, professionalProfileId: "pro-a" },
      { id: "r2", submissionGroupId: null, trafficSource: "direct", fromProfessionalLink: true, professionalProfileId: "pro-a" },
      { id: "r3", submissionGroupId: null, trafficSource: "google", fromProfessionalLink: true, professionalProfileId: "pro-b" },
      { id: "r4", submissionGroupId: null, trafficSource: "google", fromProfessionalLink: false, professionalProfileId: "pro-c" },
      { id: "r5", submissionGroupId: null, trafficSource: null, fromProfessionalLink: false, professionalProfileId: null },
    ];
    const prisma = { guidedRequest: { findMany: vi.fn().mockResolvedValue(rows) } };
    const service = new AdminService(prisma as never, {} as never, {} as never, {} as never, {} as never, {} as never);
    const result = await service.getTrafficSources();
    expect(result.total).toBe(5);
    expect(result.fromProfessionalLink).toBe(3);
    expect(result.professionalsUsingLink).toBe(2);
  });
});
