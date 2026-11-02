import { describe, expect, it, vi } from "vitest";
import { BookingsService } from "./bookings.service";

/**
 * Riapertura su richiesta (collaudo F-08): chi ha annullato chiede, l'altro
 * accetta o rifiuta. Prima l'appuntamento tornava valido subito.
 */
function build(extra: Record<string, unknown> = {}) {
  const booking = {
    id: "bk-1",
    clientId: "client-1",
    professionalProfileId: "pro-1",
    status: "CANCELED",
    canceledBy: "CLIENT",
    reopenRequestedAt: null as Date | null,
    reopenRequestedBy: null as string | null,
    scheduledAt: new Date(Date.now() + 5 * 86_400_000),
    scheduledEndAt: null,
    serviceMode: "HOME",
    quote: { guidedRequestId: "gr-1" },
    professionalProfile: { userId: "pro-user-1" },
    ...extra,
  };
  const prisma = {
    booking: {
      findUnique: vi.fn().mockResolvedValue(booking),
      update: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findFirst: vi.fn().mockResolvedValue(null),
    },
    jobPayment: { findFirst: vi.fn().mockResolvedValue(null) },
    availabilitySlot: { findMany: vi.fn().mockResolvedValue([]) },
  };
  const notify = vi.fn();
  const log = vi.fn();
  const service = new BookingsService(
    prisma as never,
    { notify } as never,
    { touchActivity: vi.fn() } as never,
    { log } as never,
    {} as never,
    {} as never,
    {} as never,
  );
  (service as unknown as { assertNoOtherJob: unknown }).assertNoOtherJob = vi.fn();
  return { service, prisma, notify };
}

describe("riapertura di un appuntamento annullato su richiesta (collaudo F-08)", () => {
  it("chi ha annullato chiede: l'appuntamento resta annullato e l'altro riceve l'avviso", async () => {
    const { service, prisma, notify } = build();
    await expect(service.reopenBooking("client-1", "bk-1")).resolves.toMatchObject({ status: "REOPEN_REQUESTED" });
    expect(prisma.booking.update).toHaveBeenCalledWith({ where: { id: "bk-1" }, data: expect.objectContaining({ reopenRequestedBy: "CLIENT" }) });
    expect(notify).toHaveBeenCalledWith("pro-user-1", "BOOKING_REOPEN_REQUESTED", expect.objectContaining({ audience: "PROFESSIONAL" }));
  });

  it("chi ha chiesto non può accettare da solo", async () => {
    const { service } = build({ reopenRequestedAt: new Date(), reopenRequestedBy: "CLIENT" });
    await expect(service.answerReopen("client-1", "bk-1", true)).rejects.toThrow(/l'altra parte/);
  });

  it("l'altro rifiuta: resta annullato e chi aveva chiesto lo sa", async () => {
    const { service, prisma, notify } = build({ reopenRequestedAt: new Date(), reopenRequestedBy: "CLIENT" });
    await expect(service.answerReopen("pro-user-1", "bk-1", false)).resolves.toMatchObject({ status: "CANCELED" });
    expect(prisma.booking.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { reopenRequestedAt: null, reopenRequestedBy: null } }));
    expect(notify).toHaveBeenCalledWith("client-1", "BOOKING_REOPEN_DECLINED", expect.objectContaining({ audience: "CLIENT" }));
  });

  it("una seconda richiesta mentre la prima aspetta: rifiutata", async () => {
    const { service } = build({ reopenRequestedAt: new Date(), reopenRequestedBy: "CLIENT" });
    await expect(service.reopenBooking("client-1", "bk-1")).rejects.toThrow(/già chiesto/);
  });
});
