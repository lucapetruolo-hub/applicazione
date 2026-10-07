import { describe, expect, it, vi } from "vitest";
import { ReviewsService } from "./reviews.service";

/**
 * Recensione subito dopo il proprio "Lavoro terminato" (docs/CHANGELOG.md
 * §186): il cliente può recensire prima del professionista, ma la coppia
 * diventa pubblica solo quando entrambi hanno chiuso il lavoro.
 */
function buildService(booking: Record<string, unknown>) {
  const prisma = {
    booking: {
      findUnique: vi.fn().mockResolvedValue({
        id: "b-1",
        clientId: "client-1",
        professionalProfileId: "pro-1",
        review: null,
        issue: null,
        clientReview: null,
        professionalProfile: { userId: "pro-user-1" },
        quote: { guidedRequestId: "gr-1" },
        ...booking,
      }),
    },
    review: { create: vi.fn().mockResolvedValue({ id: "r-1" }), findMany: vi.fn().mockResolvedValue([]) },
    clientReview: { create: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
  };
  const metrics = { recordReview: vi.fn() };
  const notifications = { notify: vi.fn() };
  const service = new ReviewsService(prisma as never, metrics as never, notifications as never);
  return { service, prisma, notifications };
}

const input = { bookingId: "b-1", rating: 4, comment: "Bene", photoUrls: [] };

describe("ReviewsService.create — recensione subito dopo \"Lavoro terminato\"", () => {
  it("il cliente recensisce anche se il professionista non ha ancora chiuso il lavoro", async () => {
    const { service, prisma, notifications } = buildService({ status: "CONFIRMED", clientConfirmedCompletedAt: new Date() });
    await expect(service.create("client-1", input)).resolves.toEqual({ id: "r-1" });
    expect(prisma.review.create).toHaveBeenCalled();
    expect(notifications.notify).toHaveBeenCalledWith("pro-user-1", "NEW_REVIEW", expect.objectContaining({ published: false, professionalCompleted: false }));
  });

  it("non prima di aver cliccato \"Lavoro terminato\"", async () => {
    const { service, prisma } = buildService({ status: "COMPLETED", clientConfirmedCompletedAt: null });
    await expect(service.create("client-1", input)).rejects.toThrow("Conferma prima");
    expect(prisma.review.create).not.toHaveBeenCalled();
  });
});

describe("ReviewsService.runAutoPublishCheck — attesa solo con entrambi i \"Lavoro terminato\"", () => {
  it("la recensione automatica scatta solo se entrambi hanno chiuso il lavoro da 3 giorni", async () => {
    const { service, prisma } = buildService({});
    await service.runAutoPublishCheck();

    const clientSide = prisma.review.findMany.mock.calls[0]![0].where.booking;
    expect(clientSide.OR[0]).toMatchObject({ status: "COMPLETED", clientConfirmedCompletedAt: { lt: expect.any(Date) } });
    expect(clientSide.OR[1]).toEqual({ completionAutoClosedAt: { not: null } });
    expect(clientSide.OR[2]).toEqual({ issue: { status: { in: ["UPHELD", "REJECTED", "RESOLVED", "UNRESOLVED"] } } });

    const proSide = prisma.clientReview.findMany.mock.calls[0]![0].where.booking;
    expect(proSide.AND[0].OR[0]).toMatchObject({ status: "COMPLETED", clientConfirmedCompletedAt: { lt: expect.any(Date) } });
  });
});
