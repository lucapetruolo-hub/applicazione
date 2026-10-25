import { describe, expect, it, vi } from "vitest";
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { BookingsService } from "./bookings.service";
import { wallClockNow } from "@professionisti/shared";

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
    booking: { create: vi.fn(), update: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
    externalJob: { findMany: vi.fn().mockResolvedValue([]) },
    availabilitySlot: { findMany: vi.fn().mockResolvedValue([]) },
    $executeRaw: vi.fn(),
    $transaction: vi.fn(),
    jobPayment: { findUniqueOrThrow: vi.fn().mockResolvedValue({ id: "jp-1" }) },
    professionalFiscalProfile: { findUnique: vi.fn().mockResolvedValue({ stripePayoutsEnabled: true }) },
    guidedRequest: { update: vi.fn() },
    professionalProfile: { findUnique: vi.fn().mockResolvedValue({ cancellationNoticeHours: 48 }) },
    ...prismaOverrides,
  };
  // Il blocco dell'agenda (§310) gira in una transazione: qui la transazione usa lo stesso finto database.
  prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(prisma));
  const notificationsService = { notify: vi.fn(), emailOnly: vi.fn() };
  const professionalMetricsService = { recordJobAccepted: vi.fn() };
  const timelineService = { log: vi.fn() };
  const jobPaymentsService = {
    createAtAcceptance: vi.fn(),
    createQuoteDepositCheckout: vi.fn().mockResolvedValue({ url: "https://checkout.stripe.com/c/pay" }),
    recordQuoteDeposit: vi.fn(),
    refundQuoteDeposit: vi.fn().mockResolvedValue({ pending: false }),
    refundOnCancel: vi.fn(),
  };

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

    expect(result).toEqual({ bookingId: "new-booking-1", paymentMethod: "DIRECT", checkoutUrl: null });
    expect(prisma.booking.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          quoteId: "quote-1",
          clientId: "client-1",
          professionalProfileId: "pro-1",
          status: "CONFIRMED",
          // Il preavviso del professionista resta quello del giorno dell'accettazione (§345).
          cancellationNoticeHours: 48,
        }),
      }),
    );
    expect(prisma.quote.update).toHaveBeenCalledWith({ where: { id: "quote-1" }, data: { status: "ACCEPTED" } });
    expect(prisma.guidedRequest.update).toHaveBeenCalledWith({
      where: { id: "gr-1" },
      data: { status: "CLOSED", closedReason: "COMPLETED" },
    });
    expect(notificationsService.notify).toHaveBeenCalledWith("pro-user-1", "QUOTE_ACCEPTED", expect.any(Object));
    // Il cliente riceve la conferma con il calendario, solo per email (§344).
    expect(notificationsService.emailOnly).toHaveBeenCalledWith("client-1", "BOOKING_CONFIRMED", { bookingId: expect.any(String), guidedRequestId: "gr-1" });
    expect(professionalMetricsService.recordJobAccepted).toHaveBeenCalledWith("pro-1");
    expect(timelineService.log).toHaveBeenCalled();
  });
});

describe("BookingsService.createFromQuote — un solo lavoro per richiesta (§344)", () => {
  it("rifiuta un altro preventivo della stessa richiesta se ce n'è già uno accettato, anche col pagamento diretto", async () => {
    const { service, prisma } = buildService();
    (prisma.quote.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(baseQuote({ id: "quote-2" }));
    (prisma.booking.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "lavoro-1" });

    await expect(service.createFromQuote("client-1", "quote-2")).rejects.toThrow(ConflictException);
    expect(prisma.booking.create).not.toHaveBeenCalled();
    expect(prisma.booking.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ quote: { guidedRequestId: "gr-1" }, status: { not: "CANCELED" } }) }),
    );
  });

  it("non apre il pagamento dell'acconto se c'è già un lavoro per la richiesta", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test";
    const { service, prisma, jobPaymentsService } = buildService();
    (prisma.quote.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(baseQuote({ paymentOptions: ["ONLINE"], depositPercent: 20 }));
    (prisma.booking.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "lavoro-1" });

    await expect(service.createFromQuote("client-1", "quote-1", "ONLINE")).rejects.toThrow(ConflictException);
    expect(jobPaymentsService.createQuoteDepositCheckout).not.toHaveBeenCalled();
    delete process.env.STRIPE_SECRET_KEY;
  });
});

describe("BookingsService.createFromQuote — metodo di pagamento (§168)", () => {
  it("con l'acconto online apre il pagamento e non crea ancora la prenotazione (§240)", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test";
    const { service, prisma, jobPaymentsService, notificationsService } = buildService();
    (prisma.quote.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(baseQuote());

    const result = await service.createFromQuote("client-1", "quote-1", "ONLINE");

    expect(result).toEqual({ bookingId: null, paymentMethod: "ONLINE", checkoutUrl: "https://checkout.stripe.com/c/pay" });
    expect(jobPaymentsService.createQuoteDepositCheckout).toHaveBeenCalledWith(
      expect.objectContaining({ quoteId: "quote-1", clientUserId: "client-1", paymentMethod: "ONLINE", amountEurCents: 6000 }),
    );
    expect(prisma.booking.create).not.toHaveBeenCalled();
    expect(notificationsService.notify).not.toHaveBeenCalled();
    delete process.env.STRIPE_SECRET_KEY;
  });

  it("usa la percentuale di acconto scelta dal professionista (§237)", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test";
    const { service, prisma, jobPaymentsService } = buildService();
    (prisma.quote.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(baseQuote({ paymentOptions: ["MIXED", "DIRECT"], depositPercent: 35 }));

    await service.createFromQuote("client-1", "quote-1", "MIXED");

    expect(jobPaymentsService.createQuoteDepositCheckout).toHaveBeenCalledWith(expect.objectContaining({ paymentMethod: "MIXED", amountEurCents: 10500 }));
    delete process.env.STRIPE_SECRET_KEY;
  });

  it("rifiuta l'acconto online se il professionista non è verificato su Stripe (§241)", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test";
    const { service, prisma, jobPaymentsService } = buildService();
    (prisma.quote.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(baseQuote());
    (prisma.professionalFiscalProfile.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ stripePayoutsEnabled: false });

    await expect(service.createFromQuote("client-1", "quote-1", "ONLINE")).rejects.toBeInstanceOf(BadRequestException);
    expect(jobPaymentsService.createQuoteDepositCheckout).not.toHaveBeenCalled();
    delete process.env.STRIPE_SECRET_KEY;
  });

  it("rifiuta un modo di pagamento che il professionista non ha offerto (§237)", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test";
    const { service, prisma } = buildService();
    (prisma.quote.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(baseQuote({ paymentOptions: ["DIRECT"] }));

    await expect(service.createFromQuote("client-1", "quote-1", "ONLINE")).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.booking.create).not.toHaveBeenCalled();
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

  it("il cliente non riapre un appuntamento se nel frattempo ha accettato un altro preventivo della richiesta (§344)", async () => {
    const { service, prisma } = buildService();
    (prisma.booking.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ ...canceledBooking("CLIENT"), quote: { guidedRequestId: "gr-1" } });
    (prisma.booking.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "lavoro-2" });

    await expect(service.reopenBooking("client-1", "booking-1")).rejects.toThrow(ConflictException);
    expect(prisma.booking.update).not.toHaveBeenCalled();
  });

  it("il cliente non può riaprire un intervento annullato dal professionista", async () => {
    const { service, prisma } = buildService();
    (prisma.booking.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(canceledBooking("PROFESSIONAL"));

    await expect(service.reopenBooking("client-1", "booking-1")).rejects.toThrow(ForbiddenException);
    expect(prisma.booking.update).not.toHaveBeenCalled();
  });

  it("il professionista non può riaprire un intervento annullato dal cliente", async () => {
    const { service, prisma } = buildService();
    (prisma.booking.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(canceledBooking("CLIENT"));

    await expect(service.reopenBooking("pro-user-1", "booking-1")).rejects.toThrow(ForbiddenException);
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
  const input = { reason: "CLIENT_ABSENT" as const, description: "Ho suonato più volte, nessuno ha aperto.", photoUrls: ["https://res.cloudinary.com/x/porta.jpg"] };

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
    expect(contentReport.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ photoUrls: input.photoUrls }) }),
    );
    expect(timelineService.log).toHaveBeenCalledWith("gr-1", "pro-1", "PROFESSIONAL", expect.stringContaining("non era presente"), input.photoUrls);
    expect(notificationsService.notify).toHaveBeenCalledWith("client-1", "TIMELINE_MESSAGE_FROM_PROFESSIONAL", expect.anything());
  });
});

describe("BookingsService.createFromQuote — professionista già impegnato (§310)", () => {
  it("rifiuta se a quell'ora il professionista ha già un lavoro, anche iniziato prima", async () => {
    const { service, prisma } = buildService();
    (prisma.quote.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(baseQuote());
    (prisma.booking.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { professionalProfileId: "pro-1", scheduledAt: new Date("2026-10-01T09:00:00Z"), scheduledEndAt: new Date("2026-10-01T12:00:00Z"), serviceMode: "HOME" },
    ]);

    await expect(service.createFromQuote("client-1", "quote-1")).rejects.toThrow(ConflictException);
    expect(prisma.booking.create).not.toHaveBeenCalled();
  });

  it("rifiuta se a quell'ora c'è un lavoro esterno", async () => {
    const { service, prisma } = buildService();
    (prisma.quote.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(baseQuote());
    (prisma.externalJob.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { professionalProfileId: "pro-1", scheduledAt: new Date("2026-10-01T10:30:00Z"), scheduledEndAt: new Date("2026-10-01T11:30:00Z") },
    ]);

    await expect(service.createFromQuote("client-1", "quote-1")).rejects.toThrow(ConflictException);
    expect(prisma.booking.create).not.toHaveBeenCalled();
  });

  it("accetta se la fascia dell'agenda ha ancora posto per un altro lavoro", async () => {
    const { service, prisma } = buildService();
    (prisma.quote.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(baseQuote());
    (prisma.booking.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { professionalProfileId: "pro-1", scheduledAt: new Date("2026-10-01T10:00:00Z"), scheduledEndAt: null, serviceMode: "HOME" },
    ]);
    (prisma.availabilitySlot.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { dayOfWeek: 4, date: null, startTime: "08:00", endTime: "13:00", homeMaxBookings: 2, onlineMaxBookings: null },
    ]);
    (prisma.booking.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "b-2" });

    await expect(service.createFromQuote("client-1", "quote-1")).resolves.toMatchObject({ bookingId: "b-2" });
  });

  it("un secondo tocco su Accetta mentre il primo è in corso risponde 'già accettato', non un errore interno", async () => {
    const { service, prisma } = buildService();
    (prisma.quote.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(baseQuote());
    (prisma.booking.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "b-1" });

    await expect(service.createFromQuote("client-1", "quote-1")).rejects.toThrow("Questo preventivo è già stato accettato.");
    expect(prisma.booking.create).not.toHaveBeenCalled();
  });
});

describe("BookingsService.confirmQuoteDeposit — lavoro confermato solo dopo l'acconto (§240)", () => {
  it("rimborsa l'acconto se nel frattempo il professionista ha preso un altro lavoro a quell'ora (§310)", async () => {
    const { service, prisma, jobPaymentsService } = buildService();
    (prisma.booking.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (prisma.booking.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (prisma.quote.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(baseQuote());
    (prisma.booking.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { professionalProfileId: "pro-1", scheduledAt: new Date("2026-10-01T10:00:00Z"), scheduledEndAt: new Date("2026-10-01T11:00:00Z"), serviceMode: "HOME" },
    ]);

    await service.confirmQuoteDeposit({
      payment_intent: "pi_1",
      amount_total: 6000,
      metadata: { kind: "quote_deposit", quoteId: "quote-1", clientUserId: "client-1", paymentMethod: "ONLINE" },
    } as never);

    expect(prisma.booking.create).not.toHaveBeenCalled();
    expect(jobPaymentsService.refundQuoteDeposit).toHaveBeenCalledWith("pi_1", expect.stringContaining("non è più libero"), null, expect.anything());
  });

  function session(overrides: Record<string, unknown> = {}) {
    return {
      payment_intent: "pi_1",
      amount_total: 6000,
      metadata: { kind: "quote_deposit", quoteId: "quote-1", clientUserId: "client-1", paymentMethod: "ONLINE" },
      ...overrides,
    } as never;
  }

  it("crea la prenotazione, sblocca i contatti al professionista e registra l'acconto", async () => {
    const { service, prisma, jobPaymentsService, notificationsService } = buildService();
    (prisma.booking.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (prisma.booking.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (prisma.quote.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(baseQuote());
    (prisma.booking.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "new-booking-9", recipientPhone: "3331234567" });

    await service.confirmQuoteDeposit(session());

    expect(prisma.booking.create).toHaveBeenCalled();
    expect(jobPaymentsService.createAtAcceptance).toHaveBeenCalledWith(expect.objectContaining({ bookingId: "new-booking-9", choice: "ONLINE", depositPercent: 20 }));
    expect(jobPaymentsService.recordQuoteDeposit).toHaveBeenCalledWith("jp-1", expect.anything());
    expect(notificationsService.notify).toHaveBeenCalledWith("pro-user-1", "QUOTE_ACCEPTED", expect.objectContaining({ bookingId: "new-booking-9" }));
    expect(jobPaymentsService.refundQuoteDeposit).not.toHaveBeenCalled();
  });

  it("non fa nulla se lo stesso pagamento è già stato registrato", async () => {
    const { service, prisma, jobPaymentsService } = buildService();
    (prisma.booking.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "b-1", clientId: "client-1", jobPayment: { stripePaymentIntentId: "pi_1" } });

    await service.confirmQuoteDeposit(session());

    expect(prisma.booking.create).not.toHaveBeenCalled();
    expect(jobPaymentsService.recordQuoteDeposit).not.toHaveBeenCalled();
    expect(jobPaymentsService.refundQuoteDeposit).not.toHaveBeenCalled();
  });

  it("rimborsa l'acconto se il preventivo è stato ritirato durante il pagamento", async () => {
    const { service, prisma, jobPaymentsService, notificationsService } = buildService();
    (prisma.booking.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (prisma.quote.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(baseQuote({ status: "WITHDRAWN" }));

    await service.confirmQuoteDeposit(session());

    expect(prisma.booking.create).not.toHaveBeenCalled();
    expect(jobPaymentsService.refundQuoteDeposit).toHaveBeenCalledWith("pi_1", expect.any(String), null, { clientUserId: expect.any(String), guidedRequestId: expect.anything() });
    expect(notificationsService.notify).toHaveBeenCalledWith("client-1", "QUOTE_DEPOSIT_REFUNDED", expect.objectContaining({ amountEurCents: 6000 }));
  });

  it("rimborsa l'acconto se l'importo del preventivo è cambiato", async () => {
    const { service, prisma, jobPaymentsService } = buildService();
    (prisma.booking.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (prisma.booking.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (prisma.quote.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(baseQuote({ items: [{ priceMinEurCents: 20000, priceMaxEurCents: 40000 }] }));

    await service.confirmQuoteDeposit(session());

    expect(prisma.booking.create).not.toHaveBeenCalled();
    expect(jobPaymentsService.refundQuoteDeposit).toHaveBeenCalled();
  });

  it("rimborsa l'acconto se il cliente ha già accettato un altro preventivo della stessa richiesta", async () => {
    const { service, prisma, jobPaymentsService } = buildService();
    (prisma.booking.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (prisma.booking.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "altro-lavoro" });
    (prisma.quote.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(baseQuote());

    await service.confirmQuoteDeposit(session());

    expect(prisma.booking.create).not.toHaveBeenCalled();
    expect(jobPaymentsService.refundQuoteDeposit).toHaveBeenCalled();
  });
});

describe("BookingsService.cancelForClient — solo prima dell'appuntamento (§344)", () => {
  it("rifiuta l'annullamento a appuntamento cominciato: niente acconto rimborsato a lavoro fatto", async () => {
    const { service, prisma, jobPaymentsService } = buildService();
    prisma.booking.findUnique.mockResolvedValue({ id: "b-1", clientId: "client-1", status: "CONFIRMED", scheduledAt: new Date("2020-01-01T10:00:00Z"), quote: null });
    await expect(service.cancelForClient("client-1", "b-1")).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.booking.update).not.toHaveBeenCalled();
    expect(jobPaymentsService.refundOnCancel).not.toHaveBeenCalled();
  });

  it("annulla un appuntamento futuro e rimborsa l'eventuale acconto", async () => {
    const { service, prisma, jobPaymentsService } = buildService({ professionalProfile: { findUnique: vi.fn().mockResolvedValue({ userId: "pro-user-1" }) } });
    prisma.booking.findUnique.mockResolvedValue({ id: "b-1", clientId: "client-1", professionalProfileId: "pro-1", status: "CONFIRMED", scheduledAt: new Date("2099-01-01T10:00:00Z"), quote: null });
    await expect(service.cancelForClient("client-1", "b-1")).resolves.toEqual({ bookingId: "b-1", status: "CANCELED" });
    expect(jobPaymentsService.refundOnCancel).toHaveBeenCalledWith("b-1", "client-1");
    expect(prisma.booking.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ canceledLate: false }) }));
  });

  it("dentro il preavviso del professionista (§345) annulla lo stesso ma lo segna e lo dice al professionista", async () => {
    const { service, prisma, notificationsService } = buildService({ professionalProfile: { findUnique: vi.fn().mockResolvedValue({ userId: "pro-user-1" }) } });
    // Tra 30 ore, con 48 ore di preavviso chieste.
    const scheduledAt = new Date(wallClockNow().getTime() + 30 * 60 * 60_000);
    prisma.booking.findUnique.mockResolvedValue({ id: "b-1", clientId: "client-1", professionalProfileId: "pro-1", status: "CONFIRMED", scheduledAt, cancellationNoticeHours: 48, quote: null });
    await service.cancelForClient("client-1", "b-1");
    expect(prisma.booking.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ canceledLate: true }) }));
    expect(notificationsService.notify).toHaveBeenCalledWith("pro-user-1", "BOOKING_CANCELED_BY_CLIENT", expect.objectContaining({ lateNotice: "48 ore" }));
  });
});
