import { describe, expect, it, vi } from "vitest";
import { RECURRING_STOPPED_NOTE, RecurringJobsService, recurringVisitInfo } from "./recurring-jobs.service";

/** Lavori ricorrenti (docs/changelog/2026-11-09-lavori-ricorrenti.md): "Interrompi" e dati per le schede. */
function buildService(series: Record<string, unknown> | null) {
  const prisma = {
    recurringJob: {
      findUnique: vi.fn().mockResolvedValue(series),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    professionalProfile: { findUnique: vi.fn().mockResolvedValue({ userId: "pro-user" }) },
    booking: { updateMany: vi.fn().mockResolvedValue({ count: 2 }) },
  };
  const notifications = { notify: vi.fn() };
  const timeline = { log: vi.fn() };
  const service = new RecurringJobsService(prisma as never, notifications as never, timeline as never, {} as never);
  return { service, prisma, notifications, timeline };
}

const SERIES = { id: "rj-1", clientId: "client-1", professionalProfileId: "pp-1", stoppedAt: null, quote: { guidedRequestId: "gr-1" } };

describe("RecurringJobsService.stop", () => {
  it("il cliente interrompe: si tolgono solo le visite future dopo la prima e il professionista lo sa", async () => {
    const { service, prisma, notifications, timeline } = buildService(SERIES);
    const result = await service.stop("client-1", "rj-1");
    expect(result.canceledVisits).toBe(2);
    expect(prisma.recurringJob.updateMany).toHaveBeenCalledWith({ where: { id: "rj-1", stoppedAt: null }, data: expect.objectContaining({ stoppedBy: "CLIENT" }) });
    const cancel = prisma.booking.updateMany.mock.calls[0]![0];
    expect(cancel.where).toMatchObject({ recurringJobId: "rj-1", recurringNumber: { gt: 1 }, status: { in: ["PENDING", "CONFIRMED"] }, professionalCompletedAt: null });
    expect(cancel.data).toEqual({ status: "CANCELED", canceledBy: "CLIENT", cancellationNote: RECURRING_STOPPED_NOTE });
    expect(notifications.notify).toHaveBeenCalledWith("pro-user", "RECURRING_JOB_STOPPED", expect.objectContaining({ guidedRequestId: "gr-1", stoppedBy: "CLIENT", audience: "PROFESSIONAL" }));
    expect(timeline.log).toHaveBeenCalledWith("gr-1", "pp-1", "CLIENT", expect.stringContaining("interrotto il lavoro ricorrente"));
  });

  it("anche il professionista può interrompere, e avvisa il cliente", async () => {
    const { service, notifications } = buildService(SERIES);
    await service.stop("pro-user", "rj-1");
    expect(notifications.notify).toHaveBeenCalledWith("client-1", "RECURRING_JOB_STOPPED", expect.objectContaining({ stoppedBy: "PROFESSIONAL", audience: "CLIENT" }));
  });

  it("nessun altro può interromperlo, e non due volte", async () => {
    await expect(buildService(SERIES).service.stop("altro", "rj-1")).rejects.toThrow("non è tuo");
    await expect(buildService({ ...SERIES, stoppedAt: new Date() }).service.stop("client-1", "rj-1")).rejects.toThrow("già interrotto");
    await expect(buildService(null).service.stop("client-1", "rj-1")).rejects.toThrow("non trovato");
  });
});

describe("recurringVisitInfo", () => {
  it("null per un lavoro di una volta", () => {
    expect(recurringVisitInfo({ recurringNumber: null, skippedAt: null, recurringJob: null })).toBeNull();
  });
  it("numero della visita, ripetizione, salto e pagamento online", () => {
    const info = recurringVisitInfo({
      recurringNumber: 3,
      skippedAt: new Date("2026-11-20T09:00:00Z"),
      recurringJob: { id: "rj-1", frequency: "BIWEEKLY", stoppedAt: null, stoppedBy: null, paymentChoice: "ONLINE" },
    });
    expect(info).toEqual({ seriesId: "rj-1", frequency: "BIWEEKLY", number: 3, skippedAt: "2026-11-20T09:00:00.000Z", stoppedAt: null, stoppedBy: null, paysOnline: true });
  });
});
