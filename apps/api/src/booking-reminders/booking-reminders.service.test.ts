import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@professionisti/database";
import { BookingRemindersService } from "./booking-reminders.service";
import type { EmailService } from "../email/email.service";

// Mercoledì 13 gennaio 2027 alle 15 italiane (14 UTC).
const NOW = new Date("2027-01-13T14:00:00Z");

function booking(extra: Record<string, unknown> = {}) {
  return {
    id: "3f1c2b9e-1a2b-4c3d-8e9f-0a1b2c3d4e5f",
    clientId: "c1",
    status: "CONFIRMED",
    scheduledAt: new Date("2027-01-16T10:30:00Z"),
    scheduledEndAt: null,
    cancellationNoticeHours: 24,
    clientDepositReminderAt: null,
    reminderSentAt: null,
    recipientName: null,
    recipientSurname: null,
    recipientPhone: null,
    street: null,
    houseNumber: null,
    addressExtra: null,
    postalCode: null,
    city: "Latina",
    province: null,
    client: {
      email: "anna@example.it",
      name: "Anna",
      surname: null,
      phone: null,
      deletedAt: null,
      notificationPrefs: null,
      street: null,
      houseNumber: null,
      addressExtra: null,
      postalCode: null,
      city: null,
      province: null,
    },
    professionalProfile: {
      businessName: "Rossi Idraulica",
      city: "Latina",
      user: {
        email: "pro@example.it",
        name: "Luigi",
        surname: "Rossi",
        notificationPrefs: null,
      },
    },
    quote: {
      guidedRequestId: "r1",
      lateCancelKeepsDeposit: true,
      guidedRequest: null,
    },
    jobPayment: {
      paymentMethod: "MANOVIA",
      paidEurCents: 5000,
      refundedEurCents: 0,
      depositKeptAt: null,
    },
    ...extra,
  };
}

function setup(rows: ReturnType<typeof booking>[]) {
  const claimed = new Set<string>();
  const prisma = {
    booking: {
      findMany: vi.fn(async () => rows),
      updateMany: vi.fn(async ({ where }: { where: { id: string } }) => {
        if (claimed.has(where.id)) return { count: 0 };
        claimed.add(where.id);
        return { count: 1 };
      }),
      update: vi.fn(async () => ({})),
    },
  };
  const send = vi.fn(async () => true);
  const service = new BookingRemindersService(
    prisma as unknown as PrismaClient,
    { send } as unknown as EmailService,
  );
  return { service, send, prisma };
}

describe("Email del promemoria con l'acconto", () => {
  it("parte 6 ore prima del preavviso, una volta sola, con la scadenza e i pulsanti", async () => {
    // Sabato 16 alle 10:30 con 24 ore: si annulla entro venerdì 15 alle 10:30, l'email parte da giovedì 14 alle 20 (non alle 4:30 di notte).
    const { service, send } = setup([booking()]);
    expect(
      await service.sendDepositReminders(new Date("2027-01-14T19:00:00Z")),
    ).toBe(1);
    expect(
      await service.sendDepositReminders(new Date("2027-01-14T19:30:00Z")),
    ).toBe(0);
    const email = (
      send.mock.calls[0] as unknown as [
        { to: string; subject: string; text: string; html: string },
      ]
    )[0];
    expect(email.to).toBe("anna@example.it");
    expect(email.subject).toBe(
      "Promemoria: sabato 16 gennaio alle 10:30 l'appuntamento con Rossi Idraulica",
    );
    expect(email.text).toContain("entro venerdì 15 gennaio alle 10:30");
    expect(email.html).toContain(
      "/promemoria/3f1c2b9e-1a2b-4c3d-8e9f-0a1b2c3d4e5f.",
    );
  });

  it("non parte prima dell'ora né a ridosso della scadenza", async () => {
    const early = setup([booking()]);
    expect(await early.service.sendDepositReminders(NOW)).toBe(0);
    const late = setup([booking()]);
    // Venerdì 15 alle 10 italiane: mezz'ora prima della scadenza vale l'email del giorno prima.
    expect(
      await late.service.sendDepositReminders(new Date("2027-01-15T09:00:00Z")),
    ).toBe(0);
    expect(late.send).not.toHaveBeenCalled();
  });

  it("senza acconto da riavere non parte", async () => {
    const { service, send } = setup([
      booking({
        jobPayment: {
          paymentMethod: "MANOVIA",
          paidEurCents: 5000,
          refundedEurCents: 5000,
          depositKeptAt: null,
        },
      }),
    ]);
    expect(
      await service.sendDepositReminders(new Date("2027-01-14T19:00:00Z")),
    ).toBe(0);
    expect(send).not.toHaveBeenCalled();
  });

  it("il giorno prima: pulsanti nell'email, e niente doppione se quella dell'acconto è partita da poco", async () => {
    vi.useFakeTimers({ now: new Date("2027-01-15T09:30:00Z") });
    try {
      const fresh = setup([
        booking({ clientDepositReminderAt: new Date("2027-01-14T19:00:00Z") }),
      ]);
      await fresh.service.sendUpcomingReminders();
      // Solo quella al professionista.
      expect(fresh.send).toHaveBeenCalledTimes(1);
      expect(
        (fresh.send.mock.calls[0] as unknown as [{ to: string }])[0].to,
      ).toBe("pro@example.it");

      const plain = setup([
        booking({
          quote: {
            guidedRequestId: "r1",
            lateCancelKeepsDeposit: false,
            guidedRequest: null,
          },
        }),
      ]);
      await plain.service.sendUpcomingReminders();
      const email = (
        plain.send.mock.calls[0] as unknown as [
          { to: string; html: string; text: string },
        ]
      )[0];
      expect(email.to).toBe("anna@example.it");
      expect(email.html).toContain("?risposta=ci-saro");
      expect(email.html).toContain("?risposta=non-posso");
      expect(email.text).not.toContain("acconto");
    } finally {
      vi.useRealTimers();
    }
  });
});
