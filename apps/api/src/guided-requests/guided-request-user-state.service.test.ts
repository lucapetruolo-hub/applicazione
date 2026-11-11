import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GuidedRequestUserStateService } from "./guided-request-user-state.service";
import { NotificationsService } from "../notifications/notifications.service";

/**
 * Azioni personali del menu hamburger sulle schede richiesta
 * (docs/CHANGELOG.md §130): chi può agire, validazione del promemoria,
 * "segna come letta" che azzera anche le notifiche, silenziamento.
 */
function buildService(overrides: Record<string, unknown> = {}) {
  const prisma = {
    guidedRequest: { findUnique: vi.fn().mockResolvedValue({ clientId: "client-1" }) },
    lead: { findFirst: vi.fn().mockResolvedValue(null) },
    guidedRequestUserState: {
      upsert: vi.fn().mockImplementation(({ create }) => Promise.resolve({ archivedAt: null, mutedAt: null, markedUnreadAt: null, remindAt: null, ...create })),
    },
    notification: { updateMany: vi.fn().mockResolvedValue({ count: 2 }) },
    ...overrides,
  };
  const notifications = { notify: vi.fn() };
  const service = new GuidedRequestUserStateService(prisma as never, notifications as never);
  return { service, prisma, notifications };
}

// Di notte (22-7 in Italia) le email aspettano il mattino (email-hold.ts):
// l'orologio fermo alle 11 tiene i test uguali a qualunque ora girino.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-05T10:00:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
});

describe("GuidedRequestUserStateService.update", () => {
  it("rifiuta chi non è né il cliente né un professionista con un lead sulla richiesta", async () => {
    const { service } = buildService();
    await expect(service.update("stranger", "gr-1", { archived: true })).rejects.toThrow("Questa richiesta non è tua.");
  });

  it("permette al professionista che ha ricevuto la richiesta di archiviarla", async () => {
    const { service, prisma } = buildService({ lead: { findFirst: vi.fn().mockResolvedValue({ id: "lead-1" }) } });
    const state = await service.update("pro-user", "gr-1", { archived: true });
    expect(state.archivedAt).not.toBeNull();
    expect(prisma.guidedRequestUserState.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId_guidedRequestId: { userId: "pro-user", guidedRequestId: "gr-1" } } }),
    );
  });

  it("rifiuta un promemoria nel passato", async () => {
    const { service } = buildService();
    await expect(service.update("client-1", "gr-1", { remindAt: new Date(Date.now() - 60_000).toISOString() })).rejects.toThrow("futuro");
  });

  it("'segna come letta' azzera anche le notifiche non lette di quella richiesta", async () => {
    const { service, prisma } = buildService();
    await service.update("client-1", "gr-1", { markedUnread: false });
    expect(prisma.notification.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: "client-1", payload: { path: ["guidedRequestId"], equals: "gr-1" } }) }),
    );
  });
});

describe("Ricordamelo tra… a lavoro terminato (docs/changelog/2026-11-08-promemoria-manutenzione.md)", () => {
  it("il cliente con un lavoro terminato lo imposta: la data la calcola il server, alle 9 italiane", async () => {
    const booking = { findFirst: vi.fn().mockResolvedValue({ id: "b-1" }) };
    const { service, prisma } = buildService({ booking });
    const state = await service.update("client-1", "gr-1", { rebookReminder: "1y" });
    expect(state.rebookRemindAt).toBe("2027-11-05T08:00:00.000Z");
    expect(booking.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ guidedRequestId: "gr-1", clientId: "client-1", status: "COMPLETED" }) }));
    expect(prisma.guidedRequestUserState.upsert).toHaveBeenCalledWith(expect.objectContaining({ update: { rebookRemindAt: new Date("2027-11-05T08:00:00.000Z") } }));
  });

  it("senza un lavoro terminato si rifiuta, e il professionista non può impostarlo", async () => {
    const { service } = buildService({ booking: { findFirst: vi.fn().mockResolvedValue(null) } });
    await expect(service.update("client-1", "gr-1", { rebookReminder: "1m" })).rejects.toThrow("a lavoro terminato");
    const pro = buildService({ lead: { findFirst: vi.fn().mockResolvedValue({ id: "lead-1" }) } });
    await expect(pro.service.update("pro-user", "gr-1", { rebookReminder: "1m" })).rejects.toThrow("solo per il cliente");
  });

  it("si toglie con null, senza controllare il lavoro", async () => {
    const booking = { findFirst: vi.fn() };
    const { service } = buildService({ booking });
    const state = await service.update("client-1", "gr-1", { rebookReminder: null });
    expect(state.rebookRemindAt).toBeNull();
    expect(booking.findFirst).not.toHaveBeenCalled();
  });

  it("alla data parte un avviso solo, e nulla se il cliente ha eliminato l'account o il lavoro non c'è più", async () => {
    const at = new Date("2026-11-05T08:00:00Z");
    const prisma = {
      guidedRequestUserState: {
        findMany: vi.fn().mockResolvedValue([
          { id: "s-1", userId: "client-1", guidedRequestId: "gr-1", rebookRemindAt: at, user: { deletedAt: null } },
          { id: "s-2", userId: "client-2", guidedRequestId: "gr-2", rebookRemindAt: at, user: { deletedAt: new Date() } },
          { id: "s-3", userId: "client-3", guidedRequestId: "gr-3", rebookRemindAt: at, user: { deletedAt: null } },
          // Già preso da un altro giro del controllo.
          { id: "s-4", userId: "client-4", guidedRequestId: "gr-4", rebookRemindAt: at, user: { deletedAt: null } },
        ]),
        updateMany: vi.fn().mockImplementation(({ where }) => Promise.resolve({ count: where.id === "s-4" ? 0 : 1 })),
      },
      booking: { findFirst: vi.fn().mockImplementation(({ where }) => Promise.resolve(where.guidedRequestId === "gr-1" ? { id: "b-1" } : null)) },
    };
    const notifications = { notify: vi.fn() };
    const service = new GuidedRequestUserStateService(prisma as never, notifications as never);
    await service.runDueRebookReminders();
    expect(prisma.guidedRequestUserState.updateMany).toHaveBeenCalledTimes(4);
    expect(notifications.notify).toHaveBeenCalledTimes(1);
    expect(notifications.notify).toHaveBeenCalledWith("client-1", "REBOOK_REMINDER", { guidedRequestId: "gr-1", bookingId: "b-1" });
  });
});

describe("NotificationsService.notify su richiesta silenziata", () => {
  function buildNotifications(muted: boolean) {
    const prisma = {
      guidedRequestUserState: { findFirst: vi.fn().mockResolvedValue(muted ? { id: "s-1" } : null), updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
      notification: { create: vi.fn().mockResolvedValue({ id: "n-1", type: "NEW_QUOTE", payload: {}, createdAt: new Date() }) },
      user: { findUnique: vi.fn().mockResolvedValue({ notificationPrefs: null }) },
    };
    const realtime = { publish: vi.fn() };
    const email = { send: vi.fn().mockResolvedValue(true) };
    return { service: new NotificationsService(prisma as never, realtime as never, email as never), prisma, realtime, email };
  }

  it("crea la notifica già letta e non fa push", async () => {
    const { service, prisma, realtime } = buildNotifications(true);
    await service.notify("u-1", "NEW_QUOTE", { guidedRequestId: "gr-1" });
    expect(prisma.notification.create).toHaveBeenCalledWith({ data: expect.objectContaining({ readAt: expect.any(Date) }) });
    expect(realtime.publish).not.toHaveBeenCalled();
  });

  it("una novità riporta in Tutte la richiesta archiviata, ma solo se non è silenziata", async () => {
    const { service, prisma } = buildNotifications(false);
    await service.notify("u-1", "NEW_QUOTE", { guidedRequestId: "gr-1" });
    expect(prisma.guidedRequestUserState.updateMany).toHaveBeenCalledWith({
      where: { userId: "u-1", guidedRequestId: "gr-1", archivedAt: { not: null }, mutedAt: null },
      data: { archivedAt: null },
    });
  });

  it("anche un promemoria riporta in Tutte la richiesta archiviata", async () => {
    const { service, prisma } = buildNotifications(false);
    await service.notify("u-1", "REBOOK_REMINDER", { guidedRequestId: "gr-1" });
    expect(prisma.guidedRequestUserState.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ mutedAt: null }) }));
  });

  it("se togliere dall'archivio non riesce, la notifica parte lo stesso", async () => {
    const { service, prisma, realtime } = buildNotifications(false);
    prisma.guidedRequestUserState.updateMany.mockRejectedValueOnce(new Error("db giù"));
    await service.notify("u-1", "NEW_QUOTE", { guidedRequestId: "gr-1" });
    expect(realtime.publish).toHaveBeenCalled();
  });

  it("senza richiesta nel payload non tocca l'archivio", async () => {
    const { service, prisma } = buildNotifications(false);
    await service.notify("u-1", "ACCOUNT_REACTIVATED", { note: "ok" });
    expect(prisma.guidedRequestUserState.updateMany).not.toHaveBeenCalled();
  });

  it("non silenzia mai un promemoria chiesto dall'utente", async () => {
    const { service, prisma, realtime } = buildNotifications(true);
    await service.notify("u-1", "REQUEST_REMINDER", { guidedRequestId: "gr-1" });
    expect(prisma.guidedRequestUserState.findFirst).not.toHaveBeenCalled();
    expect(realtime.publish).toHaveBeenCalled();
  });
});

describe("NotificationsService — email sul nuovo lead", () => {
  function buildLeadNotifications(muted: boolean) {
    const prisma = {
      guidedRequestUserState: { findFirst: vi.fn().mockResolvedValue(muted ? { id: "s-1" } : null), updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
      notification: { create: vi.fn().mockResolvedValue({ id: "n-1", type: "NEW_LEAD", payload: {}, createdAt: new Date() }) },
      user: { findUnique: vi.fn().mockResolvedValue({ email: "pro@example.com", name: "Pro", deletedAt: null, notificationPrefs: null }) },
      guidedRequest: { findUnique: vi.fn().mockResolvedValue({ city: "Roma", category: { label: "Idraulico" } }) },
    };
    const email = { send: vi.fn().mockResolvedValue(true) };
    const service = new NotificationsService(prisma as never, { publish: vi.fn() } as never, email as never);
    return { service, email, prisma };
  }

  it("invia l'email al professionista con categoria, città e urgenza", async () => {
    const { service, email } = buildLeadNotifications(false);
    await service.notify("u-1", "NEW_LEAD", { guidedRequestId: "gr-1", category: "Idraulico", city: "Roma", isUrgent: true });
    await vi.waitFor(() => expect(email.send).toHaveBeenCalledTimes(1));
    expect(email.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: "pro@example.com", subject: "URGENTE — Nuova richiesta: Idraulico a Roma", text: expect.stringContaining("dashboard/richieste") }),
    );
  });

  it("nessuna email se il professionista l'ha spenta per le nuove richieste", async () => {
    const { service, email, prisma } = buildLeadNotifications(false);
    prisma.user.findUnique.mockResolvedValue({
      email: "muto@example.com",
      name: "Email spenta",
      deletedAt: null,
      notificationPrefs: { topics: { richieste: { inApp: true, email: false } } },
    });
    await service.notify("u-1", "NEW_LEAD", { guidedRequestId: "gr-1", category: "Idraulico", city: "Roma", isUrgent: false });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(email.send).not.toHaveBeenCalled();
  });

  it("nessuna email se la richiesta è silenziata", async () => {
    const { service, email } = buildLeadNotifications(true);
    await service.notify("u-1", "NEW_LEAD", { guidedRequestId: "gr-1", category: "Idraulico", city: "Roma", isUrgent: false });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(email.send).not.toHaveBeenCalled();
  });
});

describe("NotificationsService — preferenze di notifica (docs/CHANGELOG.md §152)", () => {
  function build(prefs: unknown) {
    const prisma = {
      guidedRequestUserState: { findFirst: vi.fn().mockResolvedValue(null), updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
      notification: { create: vi.fn().mockResolvedValue({ id: "n-1", type: "NEW_QUOTE", payload: {}, createdAt: new Date() }) },
      user: {
        findUnique: vi.fn().mockResolvedValue({ email: "pro@example.com", name: "Pro", deletedAt: null, notificationPrefs: prefs }),
        update: vi.fn().mockResolvedValue({}),
      },
      guidedRequest: { findUnique: vi.fn().mockResolvedValue({ city: "Roma", category: { label: "Idraulico" } }) },
    };
    const realtime = { publish: vi.fn() };
    const email = { send: vi.fn().mockResolvedValue(true) };
    return { service: new NotificationsService(prisma as never, realtime as never, email as never), prisma, realtime, email };
  }

  it("argomento spento sul sito: notifica già letta, niente push", async () => {
    const { service, prisma, realtime } = build({ topics: { preventivi: { inApp: false, email: true } } });
    await service.notify("u-1", "NEW_QUOTE", { guidedRequestId: "gr-1" });
    expect(prisma.notification.create).toHaveBeenCalledWith({ data: expect.objectContaining({ readAt: expect.any(Date) }) });
    expect(realtime.publish).not.toHaveBeenCalled();
  });

  it("sito spento ma email accesa: l'email del nuovo lead parte lo stesso", async () => {
    const { service, email, realtime } = build({ topics: { richieste: { inApp: false, email: true } } });
    await service.notify("u-1", "NEW_LEAD", { guidedRequestId: "gr-1", category: "Idraulico", city: "Roma", isUrgent: false });
    await vi.waitFor(() => expect(email.send).toHaveBeenCalledTimes(1));
    expect(realtime.publish).not.toHaveBeenCalled();
  });

  it("account e sicurezza non si spengono: la notifica arriva comunque", async () => {
    const { service, realtime } = build({ topics: { account: { inApp: false, email: false } } });
    await service.notify("u-1", "ACCOUNT_REACTIVATED", { note: "ok" });
    expect(realtime.publish).toHaveBeenCalled();
  });

  it("salvando, 'Account e sicurezza' resta acceso su sito ed email", async () => {
    const { service, prisma } = build(null);
    const saved = await service.updatePreferences("u-1", {
      topics: {
        richieste: { inApp: true, email: false },
        preventivi: { inApp: true, email: true },
        lavori: { inApp: true, email: true },
        messaggi: { inApp: false, email: false },
        promemoria: { inApp: true, email: true },
        account: { inApp: false, email: false },
      },
      popups: false,
      sound: false,
    });
    expect(saved.topics.account).toEqual({ inApp: true, email: true });
    expect(saved.topics.richieste).toEqual({ inApp: true, email: false });
    expect(prisma.user.update).toHaveBeenCalled();
  });
});

