import { describe, expect, it, vi } from "vitest";
import { ReviewsService } from "./reviews.service";

/**
 * Recensione aggiornata una volta dopo una segnalazione a lavoro chiuso senza
 * accordo, e risposta del professionista (decisioni di Luca del 30/10/2026,
 * docs/changelog/2026-10-30-collaudo-soldi-online.md).
 */
function build(review: Record<string, unknown> | null, updateCount = 1) {
  const prisma = {
    review: {
      findUnique: vi.fn().mockResolvedValue(
        review && {
          id: "r-1",
          updatedAfterIssueAt: null,
          booking: {
            id: "b-1",
            clientId: "client-1",
            professionalProfileId: "pro-1",
            professionalProfile: { userId: "pro-user-1" },
            quote: { guidedRequestId: "gr-1" },
            issue: { late: true, status: "UNRESOLVED" },
          },
          ...review,
        },
      ),
      updateMany: vi.fn().mockResolvedValue({ count: updateCount }),
      update: vi.fn().mockResolvedValue({}),
    },
  };
  const metrics = { recomputeReviews: vi.fn() };
  const notifications = { notify: vi.fn() };
  const service = new ReviewsService(prisma as never, metrics as never, notifications as never);
  return { service, prisma, metrics, notifications };
}

const input = { rating: 2, comment: "Dopo un mese perde di nuovo", photoUrls: [] };

describe("aggiornare la recensione dopo una segnalazione a lavoro chiuso", () => {
  it("una volta, con la media dei voti ricalcolata e l'avviso al professionista", async () => {
    const { service, prisma, metrics, notifications } = build({});
    await expect(service.update("client-1", "r-1", input)).resolves.toEqual({ id: "r-1" });
    expect(prisma.review.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "r-1", updatedAfterIssueAt: null } }));
    expect(metrics.recomputeReviews).toHaveBeenCalledWith("pro-1");
    expect(notifications.notify).toHaveBeenCalledWith("pro-user-1", "NEW_REVIEW", expect.objectContaining({ updated: true, reviewId: "r-1" }));
  });

  it("non una seconda volta", async () => {
    const { service } = build({ updatedAfterIssueAt: new Date() });
    await expect(service.update("client-1", "r-1", input)).rejects.toThrow("una volta sola");
  });

  it("non con due tocchi insieme", async () => {
    const { service, metrics } = build({}, 0);
    await expect(service.update("client-1", "r-1", input)).rejects.toThrow("già aggiornato");
    expect(metrics.recomputeReviews).not.toHaveBeenCalled();
  });

  it("non senza una segnalazione a lavoro chiuso finita senza accordo", async () => {
    const base = { id: "b-1", clientId: "client-1", professionalProfileId: "pro-1", professionalProfile: { userId: "pro-user-1" }, quote: null };
    for (const issue of [null, { late: false, status: "UNRESOLVED" }, { late: true, status: "CHAT" }]) {
      const { service } = build({ booking: { ...base, issue } });
      await expect(service.update("client-1", "r-1", input)).rejects.toThrow("una volta sola");
    }
  });

  it("solo il cliente che l'ha scritta", async () => {
    const { service } = build({});
    await expect(service.update("client-2", "r-1", input)).rejects.toThrow("non è tua");
  });
});

describe("risposta del professionista", () => {
  it("il titolare risponde e può modificare la risposta", async () => {
    const { service, prisma } = build({ booking: { professionalProfile: { userId: "pro-user-1" } } });
    await service.reply("pro-user-1", "r-1", "  Grazie, torno a sistemare  ");
    expect(prisma.review.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ professionalReply: "Grazie, torno a sistemare" }) }));
  });

  it("un altro professionista no", async () => {
    const { service, prisma } = build({ booking: { professionalProfile: { userId: "pro-user-1" } } });
    await expect(service.reply("pro-user-2", "r-1", "Ciao")).rejects.toThrow("tuoi lavori");
    expect(prisma.review.update).not.toHaveBeenCalled();
  });
});
