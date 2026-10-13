import { describe, expect, it, vi } from "vitest";
import { ReviewsService } from "./reviews.service";

/**
 * Recensione subito dopo il proprio "Lavoro terminato" (docs/CHANGELOG.md
 * §189): il cliente può recensire prima che il professionista chiuda il
 * lavoro, e la recensione è pubblica subito (§215).
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
        professionalProfile: { userId: "pro-user-1" },
        quote: { guidedRequestId: "gr-1" },
        ...booking,
      }),
    },
    review: { create: vi.fn().mockResolvedValue({ id: "r-1" }), findMany: vi.fn().mockResolvedValue([]) },
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
    expect(notifications.notify).toHaveBeenCalledWith("pro-user-1", "NEW_REVIEW", expect.objectContaining({ professionalCompleted: false }));
  });

  it("non prima di aver cliccato \"Lavoro terminato\"", async () => {
    const { service, prisma } = buildService({ status: "COMPLETED", clientConfirmedCompletedAt: null });
    await expect(service.create("client-1", input)).rejects.toThrow("Conferma prima");
    expect(prisma.review.create).not.toHaveBeenCalled();
  });
});

/**
 * Recensioni in home (docs/CHANGELOG.md §232): solo da 3 stelle in su, con
 * un testo, di professionisti attivi (non in pausa, non in attesa di
 * conferma), al massimo 6.
 */
describe("ReviewsService.getRecentPublic — filtri della home", () => {
  it("chiede solo recensioni da 3 stelle, con testo, di profili attivi", async () => {
    const { service, prisma } = buildService({});
    await service.getRecentPublic();
    const args = prisma.review.findMany.mock.calls[0]?.[0];
    expect(args.take).toBe(6);
    expect(args.where).toMatchObject({
      hiddenAt: null,
      rating: { gte: 3 },
      comment: { not: null },
      NOT: { comment: "" },
      booking: {
        professionalProfile: {
          isDemo: false,
          deletedAt: null,
          suspendedAt: null,
          pausedAt: null,
          invitePendingAt: null,
        },
      },
    });
  });
});
