import { describe, expect, it, vi } from "vitest";
import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { BookingsService } from "./bookings.service";

/** Ora di arrivo scritta da "Oggi" per i lavori di domani (docs/changelog/2026-11-11-fasce-ampie.md). */
function build(booking: Record<string, unknown> | null) {
  const prisma = {
    professionalProfile: { findUnique: vi.fn().mockResolvedValue({ id: "pro-1" }) },
    booking: { findUnique: vi.fn().mockResolvedValue(booking), update: vi.fn() },
  };
  const notificationsService = { notify: vi.fn() };
  const timelineService = { log: vi.fn() };
  const service = new BookingsService(
    prisma as never,
    notificationsService as never,
    { touchActivity: vi.fn() } as never,
    timelineService as never,
    {} as never,
    {} as never,
    {} as never,
  );
  return { service, prisma, notificationsService, timelineService };
}

const booking = {
  id: "b-1",
  professionalProfileId: "pro-1",
  clientId: "client-1",
  status: "CONFIRMED",
  scheduledAt: new Date("2026-11-12T08:00:00.000Z"),
  scheduledEndAt: new Date("2026-11-12T19:00:00.000Z"),
  arrivalTime: null,
  quote: { guidedRequestId: "gr-1" },
};

describe("updateArrivalTime", () => {
  it("salva l'ora e avvisa il cliente con la finestra di un'ora", async () => {
    const { service, prisma, notificationsService, timelineService } = build(booking);
    expect(await service.updateArrivalTime("user-1", "b-1", "10:30")).toEqual({ bookingId: "b-1", arrivalTime: "10:30" });
    expect(prisma.booking.update).toHaveBeenCalledWith({ where: { id: "b-1" }, data: { arrivalTime: "10:30" } });
    expect(notificationsService.notify).toHaveBeenCalledWith("client-1", "BOOKING_ARRIVAL_TIME", expect.objectContaining({ arrivalWindow: "tra le 10:30 e le 11:30" }));
    expect(timelineService.log).toHaveBeenCalled();
  });

  it("fuori dalla fascia: rifiutata", async () => {
    const { service, prisma } = build(booking);
    await expect(service.updateArrivalTime("user-1", "b-1", "19:30")).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.booking.update).not.toHaveBeenCalled();
  });

  it("lavoro di un altro: vietato", async () => {
    const { service } = build({ ...booking, professionalProfileId: "pro-2" });
    await expect(service.updateArrivalTime("user-1", "b-1", "10:00")).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("stessa ora già salvata: nessun nuovo avviso", async () => {
    const { service, notificationsService } = build({ ...booking, arrivalTime: "10:00" });
    await service.updateArrivalTime("user-1", "b-1", "10:00");
    expect(notificationsService.notify).not.toHaveBeenCalled();
  });
});
