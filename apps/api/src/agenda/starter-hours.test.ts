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
