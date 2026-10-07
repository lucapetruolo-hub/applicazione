import { describe, expect, it, vi } from "vitest";
import { CompletionDeadlineService, completionDeadlineStep } from "./completion-deadline.service";

/**
 * Solo una parte ha cliccato "Lavoro terminato" (docs/CHANGELOG.md §189):
 * promemoria al 3° e al 10° giorno, chiusura d'ufficio al 14°, lo stesso
 * termine entro cui si può segnalare un lavoro fatto male.
 */
const DAY = 24 * 60 * 60 * 1000;
const since = new Date("2026-10-01T10:00:00Z");
const after = (days: number) => new Date(since.getTime() + days * DAY);

describe("completionDeadlineStep", () => {
  it("niente nei primi 3 giorni", () => {
    expect(completionDeadlineStep(since, 0, after(2.9))).toBeNull();
  });
  it("primo promemoria al 3° giorno, secondo al 10°, una volta sola ciascuno", () => {
    expect(completionDeadlineStep(since, 0, after(3))).toBe("REMIND");
    expect(completionDeadlineStep(since, 1, after(5))).toBeNull();
    expect(completionDeadlineStep(since, 1, after(10))).toBe("REMIND");
    expect(completionDeadlineStep(since, 2, after(13.9))).toBeNull();
  });
  it("recupera un promemoria saltato (es. servizio fermo)", () => {
    expect(completionDeadlineStep(since, 0, after(11))).toBe("REMIND");
  });
  it("chiude allo scadere dei 14 giorni", () => {
    expect(completionDeadlineStep(since, 2, after(14))).toBe("CLOSE");
    expect(completionDeadlineStep(since, 0, after(20))).toBe("CLOSE");
  });
});

function buildService(clientSilent: unknown[], proSilent: unknown[]) {
  const prisma = {
    booking: {
      findMany: vi.fn().mockResolvedValueOnce(clientSilent).mockResolvedValueOnce(proSilent),
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
  it("cliente silenzioso: al 14° giorno il lavoro vale come confermato anche da lui", async () => {
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
    expect(notifications.notify).toHaveBeenCalledWith("pro-user", "JOB_CLOSE_REMINDER", { bookingId: "b-2", guidedRequestId: null, deadline: after(14).toISOString() });
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
