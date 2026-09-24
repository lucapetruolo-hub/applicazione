import { describe, expect, it, vi } from "vitest";
import { AdminService } from "./admin.service";

/**
 * "Risolvi" deve applicare davvero la misura (docs/CHANGELOG.md §144, DSA
 * art. 17): prima cambiava solo lo stato e il contenuto restava online.
 */
function buildService(report: Record<string, unknown>, overrides: Record<string, unknown> = {}) {
  const tx = {
    review: { update: vi.fn().mockResolvedValue({ booking: { professionalProfileId: "pro-1" } }) },
    clientReview: { update: vi.fn() },
    guidedRequest: { findUnique: vi.fn().mockResolvedValue({ status: "OPEN" }), update: vi.fn() },
    professionalProfile: { update: vi.fn(), updateMany: vi.fn() },
    user: { update: vi.fn(), updateMany: vi.fn() },
    contentReport: { update: vi.fn() },
  };
  const prisma = {
    contentReport: {
      findUnique: vi.fn().mockResolvedValue({ id: "rep-1", reporterId: "reporter-1", status: "OPEN", targetId: "target-1", ...report }),
      update: vi.fn(),
    },
    review: {
      count: vi.fn().mockResolvedValue(1),
      findUnique: vi.fn().mockResolvedValue({ booking: { clientId: "author-1" } }),
    },
    clientReview: { count: vi.fn().mockResolvedValue(1), findUnique: vi.fn().mockResolvedValue({ booking: { professionalProfile: { userId: "author-1" } } }) },
    guidedRequest: { count: vi.fn().mockResolvedValue(1), findUnique: vi.fn().mockResolvedValue({ clientId: "author-1" }) },
    professionalProfile: { count: vi.fn().mockResolvedValue(1), findUnique: vi.fn().mockResolvedValue({ userId: "author-1" }) },
    $transaction: vi.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
    ...overrides,
  };
  const notifications = { notify: vi.fn() };
  const metrics = { recomputeReviews: vi.fn() };
  const service = new AdminService(prisma as never, notifications as never, metrics as never);
  return { service, prisma, tx, notifications, metrics };
}

describe("AdminService.resolveContentReport — misure reali", () => {
  it("nasconde una recensione, ricalcola la media e manda la motivazione con la misura all'autore", async () => {
    const { service, tx, notifications, metrics } = buildService({ targetType: "REVIEW" });
    await service.resolveContentReport("rep-1", { status: "RESOLVED", action: "HIDE_CONTENT", resolutionNote: "Insulti" });

    expect(tx.review.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "target-1" }, data: { hiddenAt: expect.any(Date) } }));
    expect(tx.contentReport.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "RESOLVED", action: "HIDE_CONTENT", contentOwnerId: "author-1" }) }),
    );
    expect(metrics.recomputeReviews).toHaveBeenCalledWith("pro-1");
    expect(notifications.notify).toHaveBeenCalledWith("author-1", "CONTENT_REPORT_UPHELD", expect.objectContaining({ action: "HIDE_CONTENT", note: "Insulti" }));
    expect(notifications.notify).toHaveBeenCalledWith("reporter-1", "CONTENT_REPORT_DECISION", expect.objectContaining({ status: "RESOLVED" }));
  });

  it("toglie un profilo dalla ricerca con SUSPEND_PROFILE", async () => {
    const { service, tx } = buildService({ targetType: "PROFESSIONAL_PROFILE" });
    await service.resolveContentReport("rep-1", { status: "RESOLVED", action: "SUSPEND_PROFILE", resolutionNote: "Dati falsi" });
    expect(tx.professionalProfile.update).toHaveBeenCalledWith({ where: { id: "target-1" }, data: { suspendedAt: expect.any(Date) } });
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it("sospende l'autore e nasconde anche il contenuto segnalato con SUSPEND_USER", async () => {
    const { service, tx } = buildService({ targetType: "GUIDED_REQUEST" });
    await service.resolveContentReport("rep-1", { status: "RESOLVED", action: "SUSPEND_USER", resolutionNote: "Minacce" });
    expect(tx.user.update).toHaveBeenCalledWith({ where: { id: "author-1" }, data: { suspendedAt: expect.any(Date) } });
    expect(tx.guidedRequest.update).toHaveBeenCalledWith({ where: { id: "target-1" }, data: { hiddenAt: expect.any(Date), status: "CLOSED" } });
  });

  it("rifiuta una misura non compatibile con il tipo di contenuto", async () => {
    const { service, prisma } = buildService({ targetType: "REVIEW" });
    await expect(service.resolveContentReport("rep-1", { status: "RESOLVED", action: "SUSPEND_PROFILE", resolutionNote: "x" })).rejects.toThrow(
      "Misura non valida",
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("un avvertimento non tocca il contenuto", async () => {
    const { service, tx } = buildService({ targetType: "REVIEW" });
    await service.resolveContentReport("rep-1", { status: "RESOLVED", action: "WARN", resolutionNote: "Tono" });
    expect(tx.review.update).not.toHaveBeenCalled();
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it("ignorare una segnalazione non applica misure e non avvisa l'autore", async () => {
    const { service, tx, notifications } = buildService({ targetType: "REVIEW" });
    await service.resolveContentReport("rep-1", { status: "DISMISSED" });
    expect(tx.review.update).not.toHaveBeenCalled();
    expect(notifications.notify).toHaveBeenCalledTimes(1);
    expect(notifications.notify).toHaveBeenCalledWith("reporter-1", "CONTENT_REPORT_DECISION", expect.anything());
  });

  it("non decide due volte la stessa segnalazione", async () => {
    const { service } = buildService({ targetType: "REVIEW", status: "RESOLVED" });
    await expect(service.resolveContentReport("rep-1", { status: "DISMISSED" })).rejects.toThrow("già stata decisa");
  });
});

describe("AdminService.revertContentReport — annulla misura", () => {
  it("ripristina la recensione, ricalcola la media e avvisa l'autore", async () => {
    const { service, tx, metrics, notifications } = buildService({
      targetType: "REVIEW",
      status: "RESOLVED",
      action: "HIDE_CONTENT",
      contentOwnerId: "author-1",
      revertedAt: null,
    });
    await service.revertContentReport("rep-1", "Ricorso accolto");
    expect(tx.review.update).toHaveBeenCalledWith(expect.objectContaining({ data: { hiddenAt: null } }));
    expect(metrics.recomputeReviews).toHaveBeenCalledWith("pro-1");
    expect(notifications.notify).toHaveBeenCalledWith("author-1", "CONTENT_REPORT_REVERTED", expect.objectContaining({ note: "Ricorso accolto" }));
  });

  it("riattiva l'account sospeso", async () => {
    const { service, tx } = buildService({
      targetType: "PROFESSIONAL_PROFILE",
      status: "RESOLVED",
      action: "SUSPEND_USER",
      contentOwnerId: "author-1",
      revertedAt: null,
    });
    await service.revertContentReport("rep-1", "Errore");
    expect(tx.user.updateMany).toHaveBeenCalledWith({ where: { id: "author-1" }, data: { suspendedAt: null } });
    expect(tx.professionalProfile.updateMany).toHaveBeenCalledWith({ where: { userId: "author-1" }, data: { suspendedAt: null } });
  });
});
