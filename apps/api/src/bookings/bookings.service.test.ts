import { describe, expect, it, vi } from "vitest";
import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
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
  const jobPaymentsService = { createAtAcceptance: vi.fn() };

  const service = new BookingsService(
    prisma as never,
    notificationsService as never,
    professionalMetricsService as never,
    timelineService as never,
    jobPaymentsService as never,
    { afterJobAccepted: vi.fn() } as never,
    {} as never,
  );
  return { service, prisma, notificationsService, professionalMetricsService, timelineService, jobPaymentsService };
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
    items: [{ priceMinEurCents: 20000, priceMaxEurCents: 30000 }],
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

    expect(result).toEqual({ bookingId: "new-booking-1", paymentMethod: "DIRECT" });
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

describe("BookingsService.createFromQuote — metodo di pagamento (§168)", () => {
  it("con il pagamento online crea il pagamento con acconto sull'importo massimo del preventivo", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test";
    const { service, prisma, jobPaymentsService } = buildService();
    (prisma.quote.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(baseQuote());
    (prisma.booking.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "new-booking-2" });

    const result = await service.createFromQuote("client-1", "quote-1", "ONLINE");

    expect(result).toEqual({ bookingId: "new-booking-2", paymentMethod: "ONLINE" });
    expect(jobPaymentsService.createAtAcceptance).toHaveBeenCalledWith({
      bookingId: "new-booking-2",
      choice: "ONLINE",
      quoteMaxEurCents: 30000,
      clientUserId: "client-1",
    });
    delete process.env.STRIPE_SECRET_KEY;
  });

  it("senza Stripe attivo rifiuta il pagamento online prima di creare la prenotazione (§170)", async () => {
    delete process.env.STRIPE_SECRET_KEY;
    const { service, prisma } = buildService();
    (prisma.quote.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(baseQuote());

    await expect(service.createFromQuote("client-1", "quote-1", "ONLINE")).rejects.toThrow(BadRequestException);
    expect(prisma.booking.create).not.toHaveBeenCalled();
  });
});

describe("BookingsService.reopenBooking", () => {
  function canceledBooking(canceledBy: "CLIENT" | "PROFESSIONAL" | null) {
    return {
      id: "booking-1",
      clientId: "client-1",
      status: "CANCELED",
      canceledBy,
      scheduledAt: new Date("2026-10-20T10:00:00Z"),
      serviceMode: "HOME",
      professionalProfileId: "pro-1",
      professionalProfile: { userId: "pro-user-1" },
      quote: null,
    };
  }

  it("il cliente non può riaprire un intervento annullato dal professionista", async () => {
    const { service, prisma } = buildService();
    (prisma.booking.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(canceledBooking("PROFESSIONAL"));

    await expect(service.reopenBooking("client-1", "booking-1")).rejects.toThrow(ForbiddenException);
    expect(prisma.booking.update).not.toHaveBeenCalled();
  });

  it("il cliente non può riaprire un annullamento senza autore (righe vecchie)", async () => {
    const { service, prisma } = buildService();
    (prisma.booking.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(canceledBooking(null));

    await expect(service.reopenBooking("client-1", "booking-1")).rejects.toThrow(ForbiddenException);
  });
});

describe("BookingsService.reportProblemByProfessional", () => {
  function proBooking(overrides: Record<string, unknown> = {}) {
    return {
      status: "CONFIRMED",
      clientId: "client-1",
      professionalProfileId: "pro-1",
      professionalProfile: { userId: "pro-user-1" },
      quote: { guidedRequestId: "gr-1" },
      ...overrides,
    };
  }
  function build() {
    const built = buildService({
      contentReport: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({ id: "report-1" }) },
    });
    (built.notificationsService as Record<string, unknown>).emailAdminsNewReport = vi.fn();
    return built;
  }
  const input = { reason: "CLIENT_ABSENT" as const, description: "Ho suonato più volte, nessuno ha aperto." };

  it("rifiuta se il lavoro non è del professionista", async () => {
    const { service, prisma } = build();
    (prisma.booking.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(proBooking({ professionalProfile: { userId: "altro" } }));

    await expect(service.reportProblemByProfessional("pro-user-1", "booking-1", input)).rejects.toThrow(ForbiddenException);
  });

  it("crea la segnalazione per il nostro team e scrive in chat al cliente", async () => {
    const { service, prisma, timelineService, notificationsService } = build();
    (prisma.booking.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(proBooking());

    await service.reportProblemByProfessional("pro-user-1", "booking-1", input);

    const contentReport = (prisma as unknown as { contentReport: { create: ReturnType<typeof vi.fn> } }).contentReport;
    expect(contentReport.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ targetType: "GUIDED_REQUEST", targetId: "gr-1", reason: "Problema sull'intervento: Il cliente non era presente" }) }),
    );
    expect(timelineService.log).toHaveBeenCalledWith("gr-1", "pro-1", "PROFESSIONAL", expect.stringContaining("non era presente"));
    expect(notificationsService.notify).toHaveBeenCalledWith("client-1", "TIMELINE_MESSAGE_FROM_PROFESSIONAL", expect.anything());
  });
});
