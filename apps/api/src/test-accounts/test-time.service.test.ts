import { afterEach, describe, expect, it, vi } from "vitest";
import { TestTimeService, shiftedDates } from "./test-time.service";

const DAY_MS = 24 * 60 * 60 * 1000;

function buildService(user: Record<string, unknown> | null, bookings: unknown[] = [], requests: unknown[] = []) {
  const tx = {
    guidedRequest: { update: vi.fn() },
    quote: { update: vi.fn() },
    lead: { update: vi.fn() },
    booking: { update: vi.fn() },
    jobPayment: { update: vi.fn() },
    jobIssue: { update: vi.fn() },
  };
  const prisma = {
    user: { findUnique: vi.fn().mockResolvedValue(user) },
    booking: { findMany: vi.fn().mockResolvedValue(bookings) },
    guidedRequest: { findMany: vi.fn().mockResolvedValue(requests) },
    $transaction: vi.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
  };
  const audit = { record: vi.fn() };
  const check = vi.fn().mockResolvedValue(undefined);
  const job = { runExpiryCheck: check, sendUpcomingReminders: check, run: check, runDeadlines: check, runReleases: check };
  const moduleRef = { get: vi.fn().mockReturnValue(job) };
  const service = new TestTimeService(prisma as never, audit as never, moduleRef as never);
  return { service, prisma, tx, audit, check };
}

describe("shiftedDates", () => {
  it("sposta indietro solo le date presenti", () => {
    const at = new Date("2026-10-29T10:00:00Z");
    expect(shiftedDates({ a: at, b: null }, ["a", "b"], DAY_MS)).toEqual({ a: new Date("2026-10-28T10:00:00Z") });
  });
});

describe("TestTimeService.moveForward", () => {
  afterEach(() => {
    delete process.env.STRIPE_SECRET_KEY;
  });

  it("rifiuta un account che non è di prova", async () => {
    const { service, prisma } = buildService({ id: "u-1", email: "vero@example.com", testAccountAt: null, professionalProfile: null });
    await expect(service.moveForward("admin-1", "u-1", 3)).rejects.toThrow("account di prova");
    expect(prisma.booking.findMany).not.toHaveBeenCalled();
  });

  it("cerca solo lavori e richieste con tutte le persone di prova", async () => {
    const { service, prisma } = buildService({ id: "u-1", email: "prova@example.com", testAccountAt: new Date(), professionalProfile: { id: "pro-1" } });
    await service.moveForward("admin-1", "u-1", 3);
    const bookingWhere = prisma.booking.findMany.mock.calls[0]![0].where;
    expect(bookingWhere.client).toEqual({ testAccountAt: { not: null } });
    expect(bookingWhere.professionalProfile).toEqual({ user: { testAccountAt: { not: null } } });
    const requestWhere = prisma.guidedRequest.findMany.mock.calls[0]![0].where;
    expect(requestWhere.client).toEqual({ testAccountAt: { not: null } });
    expect(requestWhere.quotes).toEqual({ every: { professionalProfile: { user: { testAccountAt: { not: null } } } } });
    expect(requestWhere.leads).toEqual({ every: { professionalProfile: { user: { testAccountAt: { not: null } } } } });
  });

  it("sposta le date di lavoro, pagamento e richiesta e fa girare i controlli", async () => {
    const scheduledAt = new Date("2026-11-05T09:00:00Z");
    const releaseDueAt = new Date("2026-11-12T09:00:00Z");
    const expiresAt = new Date("2026-11-01T09:00:00Z");
    const { service, tx, audit, check } = buildService(
      { id: "u-1", email: "prova@example.com", testAccountAt: new Date(), professionalProfile: null },
      [{ id: "b-1", scheduledAt, createdAt: null, jobPayment: { id: "p-1", releaseDueAt }, issue: null }],
      [{ id: "r-1", expiresAt, quotes: [], leads: [{ id: "l-1", expiresAt }] }],
    );
    await expect(service.moveForward("admin-1", "u-1", 7)).resolves.toEqual({ requests: 1, bookings: 1 });
    expect(tx.booking.update).toHaveBeenCalledWith({ where: { id: "b-1" }, data: { scheduledAt: new Date("2026-10-29T09:00:00Z") } });
    expect(tx.jobPayment.update).toHaveBeenCalledWith({ where: { id: "p-1" }, data: { releaseDueAt: new Date("2026-11-05T09:00:00Z") } });
    expect(tx.lead.update).toHaveBeenCalledWith({ where: { id: "l-1" }, data: { expiresAt: new Date("2026-10-25T09:00:00Z") } });
    expect(tx.jobIssue.update).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ fieldName: "testTimeShift", newValue: "7" }));
    expect(check).toHaveBeenCalledTimes(5);
  });

  it("con le chiavi Stripe vere non tocca i lavori pagati online", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_live_x";
    const { service, tx } = buildService({ id: "u-1", email: "prova@example.com", testAccountAt: new Date(), professionalProfile: null }, [
      { id: "b-1", scheduledAt: new Date(), jobPayment: { id: "p-1", depositPaidAt: new Date() }, issue: null },
    ]);
    await expect(service.moveForward("admin-1", "u-1", 1)).rejects.toThrow("pagamenti veri");
    expect(tx.booking.update).not.toHaveBeenCalled();
  });
});
