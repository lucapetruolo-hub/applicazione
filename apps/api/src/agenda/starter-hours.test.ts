import { describe, expect, it, vi } from "vitest";
import { AgendaService } from "./agenda.service";

/** Orari di partenza dei nuovi profili (docs/CHANGELOG.md §356). */
function build({ filledUntil = null as Date | null, slotCount = 0 } = {}) {
  const tx = {
    availabilitySlot: { findMany: vi.fn().mockResolvedValue([]), createMany: vi.fn(), deleteMany: vi.fn() },
    availabilityException: { findMany: vi.fn().mockResolvedValue([]) },
    booking: { findMany: vi.fn().mockResolvedValue([]) },
    professionalProfile: { update: vi.fn() },
  };
  const prisma = {
    professionalProfile: { findUnique: vi.fn().mockResolvedValue({ agendaTemplateFilledUntil: filledUntil }), update: vi.fn() },
    availabilitySlot: { count: vi.fn().mockResolvedValue(slotCount) },
    $transaction: vi.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  return { service: new AgendaService(prisma as never, {} as never), prisma, tx };
}

describe("orari di partenza", () => {
  it("un profilo nuovo riceve lun-sab 8–13 e 14–20 con 5 clienti a domicilio e 5 online", async () => {
    const { service, prisma, tx } = build();
    await service.applyStarterHours("pro-1", true);
    const added = tx.availabilitySlot.createMany.mock.calls[0]![0].data as { dayOfWeek: number; startTime: string; endTime: string; homeMaxBookings: number; onlineMaxBookings: number; fromWeekTemplate: boolean }[];
    expect(added.length).toBeGreaterThan(0);
    expect(added.some((slot) => slot.dayOfWeek === 0)).toBe(false);
    expect(new Set(added.map((slot) => slot.dayOfWeek))).toEqual(new Set([1, 2, 3, 4, 5, 6]));
    expect(new Set(added.map((slot) => `${slot.startTime}-${slot.endTime}`))).toEqual(new Set(["08:00-13:00", "14:00-20:00"]));
    expect(added.every((slot) => slot.homeMaxBookings === 5 && slot.onlineMaxBookings === 5 && slot.fromWeekTemplate)).toBe(true);
    expect(prisma.professionalProfile.update).toHaveBeenCalledWith({ where: { id: "pro-1" }, data: { agendaStarterHoursAt: expect.any(Date) } });
  });

  it("senza lavoro online le fasce sono solo a domicilio", async () => {
    const { service, tx } = build();
    await service.applyStarterHours("pro-1", false);
    const added = tx.availabilitySlot.createMany.mock.calls[0]![0].data as { allowsOnline: boolean; onlineMaxBookings: number | null }[];
    expect(added.every((slot) => !slot.allowsOnline && slot.onlineMaxBookings === null)).toBe(true);
  });

  it("un'agenda che ha già orari non si tocca", async () => {
    for (const setup of [{ slotCount: 3 }, { filledUntil: new Date() }]) {
      const { service, prisma } = build(setup);
      await service.applyStarterHours("pro-1", true);
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.professionalProfile.update).not.toHaveBeenCalled();
    }
  });
});

describe("togliere gli orari online (§357)", () => {
  it("toglie la parte online dalle fasce da oggi in poi e dalla settimana tipo", async () => {
    const template = {
      days: [
        [],
        [
          { start: "08:00", end: "13:00", allowsHome: true, allowsOnline: true, homeMax: 5, onlineMax: 5 },
          { start: "18:00", end: "20:00", allowsHome: false, allowsOnline: true, homeMax: null, onlineMax: 2 },
        ],
        [],
        [],
        [],
        [],
        [],
      ],
    };
    const tx = { availabilitySlot: { deleteMany: vi.fn(), updateMany: vi.fn() }, professionalProfile: { update: vi.fn() } };
    const prisma = {
      professionalProfile: { findUnique: vi.fn().mockResolvedValue({ id: "pro-1", agendaWeekTemplate: template }) },
      availabilitySlot: { count: vi.fn().mockResolvedValue(12) },
      $transaction: vi.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
    };
    const service = new AgendaService(prisma as never, {} as never);
    expect(await service.removeOnlineSlots("user-1", new Date("2026-10-26T10:00:00.000Z"))).toEqual({ count: 12 });
    const future = { professionalProfileId: "pro-1", allowsOnline: true, OR: [{ date: null }, { date: { gte: new Date("2026-10-26T00:00:00.000Z") } }] };
    expect(tx.availabilitySlot.deleteMany).toHaveBeenCalledWith({ where: { ...future, allowsHome: false } });
    expect(tx.availabilitySlot.updateMany).toHaveBeenCalledWith({ where: future, data: { allowsOnline: false, onlineMaxBookings: null } });
    const saved = tx.professionalProfile.update.mock.calls[0]![0].data.agendaWeekTemplate as typeof template;
    expect(saved.days[1]).toEqual([{ start: "08:00", end: "13:00", allowsHome: true, allowsOnline: false, homeMax: 5, onlineMax: null }]);
  });
});

describe("riattivare l'online dagli orari di lavoro (§359)", () => {
  it("accende il lavoro online nel profilo", async () => {
    const { service, prisma } = build();
    prisma.professionalProfile.findUnique.mockResolvedValue({ id: "pro-1" });
    await expect(service.enableOnline("user-1")).resolves.toEqual({ online: true });
    expect(prisma.professionalProfile.update).toHaveBeenCalledWith({ where: { id: "pro-1" }, data: { remoteAvailable: true } });
  });
});
