import { describe, expect, it, vi } from "vitest";
import { AwayService } from "./away.service";

/** "Metti in pausa": avviso il giorno prima e richieste aperte alla fine (docs/changelog/2026-11-02-iscrizione-verifica-professionisti.md). */
const now = new Date("2026-11-11T09:00:00Z"); // 10:00 a Roma
const returnDay = new Date("2026-11-12T00:00:00Z");

function setup(rows: { id: string; userId?: string; awayUntil: Date | null }[], count = 1) {
  const prisma = {
    professionalProfile: {
      findMany: vi.fn().mockResolvedValue(rows),
      updateMany: vi.fn().mockResolvedValue({ count }),
    },
  };
  const notifications = { notify: vi.fn() };
  const guided = { matchWhenVisible: vi.fn() };
  return { prisma, notifications, guided, service: new AwayService(prisma as never, notifications as never, guided as never) };
}

describe("il giorno prima del ritorno", () => {
  it("cerca chi torna domani e lo avvisa una volta sola", async () => {
    const { prisma, notifications, service } = setup([{ id: "p-1", userId: "u-1", awayUntil: returnDay }]);
    await service.remindEnding(now);
    expect(prisma.professionalProfile.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ awayUntil: { gte: returnDay, lt: new Date("2026-11-13T00:00:00Z") }, awayReminderSentAt: null }) }),
    );
    expect(prisma.professionalProfile.updateMany).toHaveBeenCalledWith({ where: { id: "p-1", awayUntil: returnDay, awayReminderSentAt: null }, data: { awayReminderSentAt: now } });
    expect(notifications.notify).toHaveBeenCalledWith("u-1", "AWAY_ENDING", expect.objectContaining({ dayLabel: "giovedì 12 novembre" }));
  });

  it("niente avviso se un altro giro l'ha già segnato", async () => {
    const { notifications, service } = setup([{ id: "p-1", userId: "u-1", awayUntil: returnDay }], 0);
    await service.remindEnding(now);
    expect(notifications.notify).not.toHaveBeenCalled();
  });
});

describe("fine della pausa", () => {
  it("azzera la pausa e manda le richieste aperte della zona", async () => {
    const { prisma, guided, service } = setup([{ id: "p-1", awayUntil: returnDay }]);
    await service.endPauses(new Date("2026-11-12T01:00:00Z"));
    expect(prisma.professionalProfile.updateMany).toHaveBeenCalledWith({ where: { id: "p-1", awayUntil: returnDay }, data: { awayUntil: null, awayReminderSentAt: null } });
    expect(guided.matchWhenVisible).toHaveBeenCalledWith("p-1");
  });

  it("se la data è appena cambiata non tocca nulla", async () => {
    const { guided, service } = setup([{ id: "p-1", awayUntil: returnDay }], 0);
    await service.endPauses(new Date("2026-11-12T01:00:00Z"));
    expect(guided.matchWhenVisible).not.toHaveBeenCalled();
  });
});
