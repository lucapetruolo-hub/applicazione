import { describe, expect, it, vi } from "vitest";
import { AuthService } from "./auth.service";

// Foto cancellate alla chiusura dell'account (docs/changelog/2026-11-26-foto-cancellate-alla-chiusura.md).
describe("chiusura dell'account: foto da Cloudinary", () => {
  function setup(requests: { id: string; photoUrls: string[] }[]) {
    const prisma = {
      guidedRequest: { findMany: vi.fn().mockResolvedValue(requests), updateMany: vi.fn().mockResolvedValue({ count: requests.length }) },
    };
    const cloudinary = { deleteOwnMedia: vi.fn().mockResolvedValue(3) };
    const service = new AuthService(prisma as never, {} as never, {} as never, {} as never, cloudinary as never);
    const run = (urls: (string | null)[]) => (service as unknown as { deleteClosedAccountMedia: (id: string, u: (string | null)[]) => Promise<void> }).deleteClosedAccountMedia("u-1", urls);
    return { prisma, cloudinary, run };
  }

  it("cancella le foto del profilo e quelle delle richieste che non sono diventate un lavoro", async () => {
    const { prisma, cloudinary, run } = setup([{ id: "r-1", photoUrls: ["https://res.cloudinary.com/demo/image/upload/v1/guided-requests/a.jpg"] }]);
    await run(["https://res.cloudinary.com/demo/image/upload/v1/professionisti/me.jpg", null]);
    expect(prisma.guidedRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ clientId: "u-1", quotes: { none: { booking: { isNot: null } } } }) }),
    );
    expect(prisma.guidedRequest.updateMany).toHaveBeenCalledWith({ where: { id: { in: ["r-1"] } }, data: { photoUrls: [] } });
    expect(cloudinary.deleteOwnMedia).toHaveBeenCalledWith([
      "https://res.cloudinary.com/demo/image/upload/v1/professionisti/me.jpg",
      null,
      "https://res.cloudinary.com/demo/image/upload/v1/guided-requests/a.jpg",
    ]);
  });

  it("se Cloudinary o il database non rispondono la chiusura va avanti", async () => {
    const { prisma, run } = setup([]);
    prisma.guidedRequest.findMany.mockRejectedValue(new Error("database giù"));
    await expect(run(["x"])).resolves.toBeUndefined();
  });
});
