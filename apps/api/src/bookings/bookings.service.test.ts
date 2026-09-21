import { describe, expect, it, vi } from "vitest";
import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { BookingsService } from "./bookings.service";

/**
 * Flusso critico: creazione della Booking dall'accettazione di un
 * preventivo (CEO, tattico — "test automatici sui flussi critici prima di
 * attivare pagamenti reali": booking è il primo dei tre citati esplicitamente,
 * insieme a calcolo commissione (platform-fee-rules.service.test.ts) e gate
 * contatti cliente (professionals.service.test.ts)). Un bug qui significa
 * doppie prenotazioni sullo stesso preventivo o un preventivo non più valido
 * (rifiutato/ritirato) che diventa comunque un impegno reale.
 */
function buildService(prismaOverrides: Record<string, unknown> = {}) {
  const prisma = {
    quote: { findUnique: vi.fn(), update: vi.fn() },
    booking: { create: vi.fn(), update: vi.fn(), findUnique: vi.fn() },
    guidedRequest: { update: vi.fn() },
    ...prismaOverrides,
  };
  const notificationsService = { notify: vi.fn() };
  const professionalMetricsService = { recordJobAccepted: vi.fn() };
  const timelineService = { log: vi.fn() };
  const jobPaymentsService = {};

  const service = new BookingsService(
    prisma as never,
    notificationsService as never,
    professionalMetricsService as never,
    timelineService as never,
    jobPaymentsService as never,
  );
  return { service, prisma, notificationsService, professionalMetricsService, timelineService };
}

function baseQuote(overrides: Record<string, unknown> = {}) {
  return {
    id: "quote-1",
    professionalProfileId: "pro-1",
    guidedRequestId: "gr-1",
    status: "SENT",
    estimatedStartDate: new Date("2026-10-01T10:00:00Z"),
    estimatedEndDate: new Date("2026-10-01T11:00:00Z"),
    booking: null,
    guidedRequest: {
      clientId: "client-1",
      serviceMode: "HOME",
      recipientName: "Mario",
      recipientSurname: "Rossi",
      recipientPhone: "3331234567",
      address: "Via Roma 1",
      houseNumber: "1",
      addressExtra: null,
      postalCode: "04100",
      city: "Latina",
      province: "LT",
    },
    professionalProfile: { userId: "pro-user-1" },
    ...overrides,
  };
}

describe("BookingsService.createFromQuote", () => {
  it("rifiuta se il preventivo non esiste", async () => {
    const { service, prisma } = buildService();
    (prisma.quote.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(service.createFromQuote("client-1", "quote-1")).rejects.toThrow(NotFoundException);
  });

  it("rifiuta se il preventivo non appartiene a una richiesta del cliente", async () => {
    const { service, prisma } = buildService();
    (prisma.quote.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(baseQuote({ guidedRequest: { ...baseQuote().guidedRequest, clientId: "altro-cliente" } }));

    await expect(service.createFromQuote("client-1", "quote-1")).rejects.toThrow(ForbiddenException);
  });

  it("rifiuta se il preventivo è già stato accettato (Booking già esistente)", async () => {
    const { service, prisma } = buildService();
    (prisma.quote.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(baseQuote({ booking: { id: "existing-booking" } }));

    await expect(service.createFromQuote("client-1", "quote-1")).rejects.toThrow(ForbiddenException);
    expect(prisma.booking.create).not.toHaveBeenCalled();
  });

  it.each(["REJECTED", "WITHDRAWN"])("rifiuta un preventivo con stato %s", async (status) => {
    const { service, prisma } = buildService();
    (prisma.quote.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(baseQuote({ status }));

    await expect(service.createFromQuote("client-1", "quote-1")).rejects.toThrow(ForbiddenException);
    expect(prisma.booking.create).not.toHaveBeenCalled();
  });

  it("crea la Booking come CONFIRMED e chiude la richiesta guidata quando il preventivo è valido", async () => {
    const { service, prisma, notificationsService, professionalMetricsService, timelineService } = buildService();
    const quote = baseQuote();
    (prisma.quote.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(quote);
    (prisma.booking.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "new-booking-1" });

    const result = await service.createFromQuote("client-1", "quote-1");

    expect(result).toEqual({ bookingId: "new-booking-1" });
    expect(prisma.booking.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          quoteId: "quote-1",
          clientId: "client-1",
          professionalProfileId: "pro-1",
          status: "CONFIRMED",
        }),
      }),
    );
    expect(prisma.quote.update).toHaveBeenCalledWith({ where: { id: "quote-1" }, data: { status: "ACCEPTED" } });
    expect(prisma.guidedRequest.update).toHaveBeenCalledWith({
      where: { id: "gr-1" },
      data: { status: "CLOSED", closedReason: "COMPLETED" },
    });
    expect(notificationsService.notify).toHaveBeenCalledWith("pro-user-1", "QUOTE_ACCEPTED", expect.any(Object));
    expect(professionalMetricsService.recordJobAccepted).toHaveBeenCalledWith("pro-1");
    expect(timelineService.log).toHaveBeenCalled();
  });
});
