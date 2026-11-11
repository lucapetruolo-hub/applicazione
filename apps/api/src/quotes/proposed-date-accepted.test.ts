import { afterEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@professionisti/database";
import { QuotesService } from "./quotes.service";
import type { NotificationsService } from "../notifications/notifications.service";
import type { ProfessionalMetricsService } from "../professional-metrics/professional-metrics.service";
import type { TimelineService } from "../timeline/timeline.service";
import type { SubscriptionsService } from "../subscriptions/subscriptions.service";
import type { WhatsAppService } from "../whatsapp/whatsapp.service";

// "Accetta nuova data" prima dell'accettazione del preventivo (collaudo
// 08/11, E1-02): il lavoro non nasce più qui, senza pagamento; il preventivo
// torna da accettare con la data del cliente, che lo accetta come sempre.

const PROPOSED = new Date("2099-03-12T15:00:00.000Z");
const PROPOSED_END = new Date("2099-03-12T17:00:00.000Z");

function setup(options: { busy?: boolean; otherJob?: boolean; proposed?: Date; proposedEnd?: Date } = {}) {
  const quote: Record<string, unknown> = {
    id: "q1",
    status: "MODIFICATION_REQUESTED",
    guidedRequestId: "r1",
    professionalProfileId: "p1",
    estimatedStartDate: new Date("2099-03-10T10:00:00.000Z"),
    estimatedEndDate: new Date("2099-03-10T12:00:00.000Z"),
    clientProposedDate: options.proposed ?? PROPOSED,
    clientProposedEndDate: options.proposedEnd ?? PROPOSED_END,
    clientProposedNote: "Posso solo il pomeriggio",
    professionalCounterNote: null,
    clientNote: null,
    proposedDateAcceptedAt: null,
    booking: null,
    guidedRequest: { clientId: "c1", serviceMode: "HOME", closedReason: null },
    professionalProfile: { userId: "pro1" },
  };
  const prisma = {
    professionalProfile: { findUnique: vi.fn(async () => ({ id: "p1", userId: "pro1" })) },
    quote: {
      findUnique: vi.fn(async () => ({ ...quote })),
      updateMany: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(quote, data);
        return { count: 1 };
      }),
    },
    booking: {
      create: vi.fn(),
      findFirst: vi.fn(async () => (options.otherJob ? { id: "altro" } : null)),
      findMany: vi.fn(async () =>
        options.busy ? [{ professionalProfileId: "p1", scheduledAt: PROPOSED, scheduledEndAt: PROPOSED_END, serviceMode: "HOME" }] : [],
      ),
    },
    externalJob: { findMany: vi.fn(async () => []) },
    availabilitySlot: { findMany: vi.fn(async () => []) },
  };
  const notify = vi.fn(async () => undefined);
  const log = vi.fn(async () => undefined);
  const recordJobAccepted = vi.fn();
  const afterJobAccepted = vi.fn();
  const service = new QuotesService(
    prisma as unknown as PrismaClient,
    { notify } as unknown as NotificationsService,
    { recordJobAccepted, touchActivity: vi.fn() } as unknown as ProfessionalMetricsService,
    { log } as unknown as TimelineService,
    { afterJobAccepted } as unknown as SubscriptionsService,
    { forgetBookingReminders: vi.fn() } as unknown as WhatsAppService,
  );
  return { service, quote, prisma, notify, log, recordJobAccepted, afterJobAccepted };
}

describe("Il professionista accetta la data proposta dal cliente prima dell'accettazione", () => {
  it("il preventivo torna da accettare con quella data, senza creare il lavoro", async () => {
    const { service, quote, prisma, notify, recordJobAccepted, afterJobAccepted } = setup();
    await expect(service.confirmProposedDate("pro1", "q1")).resolves.toEqual({ bookingId: null });
    expect(prisma.booking.create).not.toHaveBeenCalled();
    expect(quote.status).toBe("SENT");
    expect(quote.estimatedStartDate).toBe(PROPOSED);
    expect(quote.estimatedEndDate).toBe(PROPOSED_END);
    expect(quote.clientProposedDate).toBeNull();
    expect(quote.proposedDateAcceptedAt).toBeInstanceOf(Date);
    expect(notify).toHaveBeenCalledWith("c1", "QUOTE_DATE_CONFIRMED", expect.objectContaining({ quoteId: "q1" }));
    // Il lavoro conta solo quando il cliente accetta.
    expect(recordJobAccepted).not.toHaveBeenCalled();
    expect(afterJobAccepted).not.toHaveBeenCalled();
  });

  it("la fascia intanto occupata si dice subito al professionista", async () => {
    const { service, quote } = setup({ busy: true });
    await expect(service.confirmProposedDate("pro1", "q1")).rejects.toThrow("non è più libera");
    expect(quote.status).toBe("MODIFICATION_REQUESTED");
  });

  it("niente se il cliente ha già scelto un altro professionista", async () => {
    const { service, quote } = setup({ otherJob: true });
    await expect(service.confirmProposedDate("pro1", "q1")).rejects.toThrow("altro professionista");
    expect(quote.status).toBe("MODIFICATION_REQUESTED");
  });

  // docs/changelog/2026-11-11-fascia-in-corso.md: alle 14:20 "oggi 14:00–20:00"
  // risultava "già passata" perché si guardava solo l'inizio.
  describe("fascia di oggi già cominciata (ora italiana)", () => {
    afterEach(() => vi.useRealTimers());
    const band = { proposed: new Date("2026-11-11T14:00:00.000Z"), proposedEnd: new Date("2026-11-11T20:00:00.000Z") };

    it("alle 14:20 la fascia 14:00–20:00 si accetta ancora", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2026-11-11T13:20:00.000Z"));
      const { service, quote } = setup(band);
      await expect(service.confirmProposedDate("pro1", "q1")).resolves.toEqual({ bookingId: null });
      expect(quote.status).toBe("SENT");
    });

    it("alle 18:30 (meno di due ore alla fine) è già passata", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2026-11-11T17:30:00.000Z"));
      const { service, quote } = setup(band);
      await expect(service.confirmProposedDate("pro1", "q1")).rejects.toThrow("già passata");
      expect(quote.status).toBe("MODIFICATION_REQUESTED");
    });
  });
});
