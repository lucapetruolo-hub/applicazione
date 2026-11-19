import { describe, expect, it, vi } from "vitest";
import { CompletionDeadlineService, completionDeadlineStep } from "./completion-deadline.service";

/**
 * Solo una parte ha cliccato "Lavoro terminato" (docs/CHANGELOG.md §190):
 * promemoria al 3° e al 6° giorno, chiusura d'ufficio al 7°, lo stesso
 * termine entro cui si può segnalare un lavoro fatto male (collaudo P-04).
 */
const DAY = 24 * 60 * 60 * 1000;
const since = new Date("2026-10-01T10:00:00Z");
const after = (days: number) => new Date(since.getTime() + days * DAY);

describe("completionDeadlineStep", () => {
  it("niente nei primi 3 giorni", () => {
    expect(completionDeadlineStep(since, 0, after(2.9))).toBeNull();
  });
  it("primo promemoria al 3° giorno, secondo al 6°, una volta sola ciascuno", () => {
    expect(completionDeadlineStep(since, 0, after(3))).toBe("REMIND");
    expect(completionDeadlineStep(since, 1, after(5))).toBeNull();
    expect(completionDeadlineStep(since, 1, after(6))).toBe("REMIND");
    expect(completionDeadlineStep(since, 2, after(6.9))).toBeNull();
  });
  it("recupera un promemoria saltato (es. servizio fermo)", () => {
    expect(completionDeadlineStep(since, 0, after(4))).toBe("REMIND");
  });
  it("chiude allo scadere dei 7 giorni", () => {
    expect(completionDeadlineStep(since, 2, after(7))).toBe("CLOSE");
    expect(completionDeadlineStep(since, 0, after(20))).toBe("CLOSE");
  });
});

function buildService(clientSilent: unknown[], proSilent: unknown[], earlyAsked: unknown[] = []) {
  const prisma = {
    booking: {
      // Le liste per query, riconosciute dal filtro: il promemoria della mattina (nobodyClosed) non trova nulla.
      findMany: vi.fn().mockImplementation(({ where }: { where: Record<string, unknown> }) =>
        Promise.resolve(
          "closeReminderSentAt" in where ? [] : "earlyCompletionAskedAt" in where ? earlyAsked : where.status === "COMPLETED" ? clientSilent : proSilent,
        ),
      ),
      update: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    user: { findMany: vi.fn().mockResolvedValue([{ id: "admin-1", adminRoles: [] }]) },
  };
  const notifications = { notify: vi.fn() };
  const timeline = { log: vi.fn() };
  const service = new CompletionDeadlineService(prisma as never, notifications as never, timeline as never);
  return { service, prisma, notifications, timeline };
}

describe("CompletionDeadlineService.run", () => {
  it("cliente silenzioso: al 7° giorno il lavoro vale come confermato anche da lui", async () => {
    const booking = { id: "b-1", clientId: "c-1", professionalProfileId: "p-1", professionalCompletedAt: since, completionReminderCount: 2, quote: { guidedRequestId: "gr-1" } };
    const { service, prisma, notifications } = buildService([booking], []);
    const now = after(14);
    await service.run(now);
    expect(prisma.booking.updateMany).toHaveBeenCalledWith({
      where: { id: "b-1", clientConfirmedCompletedAt: null, completionAutoClosedAt: null },
      data: { clientConfirmedCompletedAt: now, completionAutoClosedAt: now },
    });
    expect(notifications.notify).toHaveBeenCalledWith("c-1", "JOB_AUTO_CONFIRMED", { bookingId: "b-1", guidedRequestId: "gr-1" });
  });

  it("professionista silenzioso: promemoria con la scadenza", async () => {
    const booking = {
      id: "b-2",
      professionalProfileId: "p-1",
      clientConfirmedCompletedAt: since,
      completionReminderCount: 0,
      quote: null,
      professionalProfile: { userId: "pro-user" },
      jobPayment: null,
    };
    const { service, prisma, notifications } = buildService([], [booking]);
    await service.run(after(3));
    expect(prisma.booking.update).toHaveBeenCalledWith({ where: { id: "b-2" }, data: { completionReminderCount: { increment: 1 } } });
    expect(notifications.notify).toHaveBeenCalledWith("pro-user", "JOB_CLOSE_REMINDER", { bookingId: "b-2", guidedRequestId: null, deadline: after(7).toISOString() });
  });

  it("professionista silenzioso con soldi online in custodia: avvisa il nostro team, il lavoro resta aperto", async () => {
    const booking = {
      id: "b-3",
      professionalProfileId: "p-1",
      clientConfirmedCompletedAt: since,
      completionReminderCount: 2,
      quote: null,
      professionalProfile: { userId: "pro-user" },
      jobPayment: { paymentMethod: "MANOVIA", paidEurCents: 5000, refundedEurCents: 0 },
    };
    const { service, prisma, notifications } = buildService([], [booking]);
    const now = after(14);
    await service.run(now);
    expect(prisma.booking.updateMany).toHaveBeenCalledWith({ where: { id: "b-3", status: "CONFIRMED", completionAutoClosedAt: null }, data: { completionAutoClosedAt: now } });
    expect(notifications.notify).toHaveBeenCalledWith("pro-user", "JOB_CLOSE_EXPIRED", { bookingId: "b-3", guidedRequestId: null });
    expect(notifications.notify).toHaveBeenCalledWith("admin-1", "ADMIN_JOB_NOT_CLOSED", { bookingId: "b-3" });
  });
});

describe("CompletionDeadlineService.nobodyClosed", () => {
  // 18/11/2026 alle 9 in Italia (8 UTC).
  const morning = new Date("2026-11-18T08:00:00Z");

  function service(rows: unknown[]) {
    const prisma = { booking: { findMany: vi.fn().mockResolvedValue(rows), updateMany: vi.fn().mockResolvedValue({ count: 1 }) } };
    const notifications = { notify: vi.fn() };
    return { svc: new CompletionDeadlineService(prisma as never, notifications as never, {} as never), prisma, notifications };
  }

  it("la mattina dopo: un promemoria al professionista per il lavoro non chiuso", async () => {
    const { svc, prisma, notifications } = service([{ id: "b-1", quote: { guidedRequestId: "gr-1" }, professionalProfile: { userId: "u-pro" } }]);
    await svc.nobodyClosed(morning);
    const where = prisma.booking.findMany.mock.calls[0]![0].where;
    expect(where).toMatchObject({ status: "CONFIRMED", closeReminderSentAt: null, clientConfirmedCompletedAt: null, issue: { is: null } });
    // Solo i lavori finiti prima di oggi (ora di parete) e non più di 3 giorni fa.
    expect(where.OR[0].scheduledEndAt).toEqual({ gte: new Date("2026-11-15T00:00:00Z"), lt: new Date("2026-11-18T00:00:00Z") });
    expect(notifications.notify).toHaveBeenCalledWith("u-pro", "JOB_TO_CLOSE", { bookingId: "b-1", guidedRequestId: "gr-1" });
  });

  it("prima delle 8 non manda nulla, e mai due volte lo stesso lavoro", async () => {
    const early = service([{ id: "b-1", quote: null, professionalProfile: { userId: "u-pro" } }]);
    await early.svc.nobodyClosed(new Date("2026-11-18T05:00:00Z"));
    expect(early.prisma.booking.findMany).not.toHaveBeenCalled();
    const twice = service([{ id: "b-1", quote: null, professionalProfile: { userId: "u-pro" } }]);
    twice.prisma.booking.updateMany.mockResolvedValue({ count: 0 });
    await twice.svc.nobodyClosed(morning);
    expect(twice.notifications.notify).not.toHaveBeenCalled();
  });
});

// "Il lavoro è già finito?" senza risposta (docs/changelog/2026-11-18-sposta-e-terminato-in-anticipo.md).
describe("Promemoria sulla conferma chiesta prima del giorno", () => {
  const asked = { id: "b-9", clientId: "c-9", scheduledAt: new Date("2026-11-25T10:00:00Z"), quote: { guidedRequestId: "gr-9" } };

  it("dopo 24 ore, uno solo, solo prima del giorno fissato", async () => {
    const { service, prisma, notifications } = buildService([], [], [asked]);
    // 20/11 alle 11 italiane.
    const now = new Date("2026-11-20T10:00:00Z");
    await service.run(now);
    const where = prisma.booking.findMany.mock.calls.find((call) => "earlyCompletionAskedAt" in (call[0] as { where: object }).where)![0].where;
    expect(where.earlyCompletionAskedAt.lte.toISOString()).toBe("2026-11-19T10:00:00.000Z");
    expect(where.earlyCompletionReminderAt).toBeNull();
    expect(where.scheduledAt.gte.toISOString()).toBe("2026-11-21T00:00:00.000Z");
    expect(prisma.booking.updateMany).toHaveBeenCalledWith({ where: { id: "b-9", earlyCompletionReminderAt: null, clientConfirmedCompletedAt: null }, data: { earlyCompletionReminderAt: now } });
    expect(notifications.notify).toHaveBeenCalledWith("c-9", "JOB_EARLY_DONE_ASKED", expect.objectContaining({ bookingId: "b-9", reminder: true }));
  });

  it("mai di notte", async () => {
    const { service, notifications } = buildService([], [], [asked]);
    await service.run(new Date("2026-11-20T22:00:00Z"));
    expect(notifications.notify).not.toHaveBeenCalled();
  });
});
