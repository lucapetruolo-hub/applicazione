import { describe, expect, it, vi } from "vitest";
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

describe("NotificationsService.notify su richiesta silenziata", () => {
  function buildNotifications(muted: boolean) {
    const prisma = {
      guidedRequestUserState: { findFirst: vi.fn().mockResolvedValue(muted ? { id: "s-1" } : null) },
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
      guidedRequestUserState: { findFirst: vi.fn().mockResolvedValue(muted ? { id: "s-1" } : null) },
      notification: { create: vi.fn().mockResolvedValue({ id: "n-1", type: "NEW_LEAD", payload: {}, createdAt: new Date() }) },
      user: {
        findUnique: vi.fn().mockResolvedValue({ notificationPrefs: null }),
        findMany: vi.fn().mockResolvedValue([
          { email: "pro@example.com", name: "Pro", notificationPrefs: null },
          { email: null, name: "Senza email", notificationPrefs: null },
          { email: "muto@example.com", name: "Email spenta", notificationPrefs: { topics: { richieste: { inApp: true, email: false, sms: false } } } },
        ]),
      },
    };
    const email = { send: vi.fn().mockResolvedValue(true) };
    const service = new NotificationsService(prisma as never, { publish: vi.fn() } as never, email as never);
    return { service, email };
  }

  it("invia l'email al professionista con categoria, città e urgenza", async () => {
    const { service, email } = buildLeadNotifications(false);
    await service.notify("u-1", "NEW_LEAD", { guidedRequestId: "gr-1", category: "Idraulico", city: "Roma", isUrgent: true });
    await vi.waitFor(() => expect(email.send).toHaveBeenCalledTimes(1));
    expect(email.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: "pro@example.com", subject: "URGENTE — Nuova richiesta: Idraulico a Roma" }),
    );
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
      guidedRequestUserState: { findFirst: vi.fn().mockResolvedValue(null) },
      notification: { create: vi.fn().mockResolvedValue({ id: "n-1", type: "NEW_QUOTE", payload: {}, createdAt: new Date() }) },
      user: {
        findUnique: vi.fn().mockResolvedValue({ notificationPrefs: prefs }),
        findMany: vi.fn().mockResolvedValue([{ email: "pro@example.com", name: "Pro", notificationPrefs: prefs }]),
        update: vi.fn().mockResolvedValue({}),
      },
    };
    const realtime = { publish: vi.fn() };
    const email = { send: vi.fn().mockResolvedValue(true) };
    return { service: new NotificationsService(prisma as never, realtime as never, email as never), prisma, realtime, email };
  }

  it("argomento spento sul sito: notifica già letta, niente push", async () => {
    const { service, prisma, realtime } = build({ topics: { preventivi: { inApp: false, email: true, sms: false } } });
    await service.notify("u-1", "NEW_QUOTE", { guidedRequestId: "gr-1" });
    expect(prisma.notification.create).toHaveBeenCalledWith({ data: expect.objectContaining({ readAt: expect.any(Date) }) });
    expect(realtime.publish).not.toHaveBeenCalled();
  });

  it("sito spento ma email accesa: l'email del nuovo lead parte lo stesso", async () => {
    const { service, email, realtime } = build({ topics: { richieste: { inApp: false, email: true, sms: false } } });
    await service.notify("u-1", "NEW_LEAD", { guidedRequestId: "gr-1", category: "Idraulico", city: "Roma", isUrgent: false });
    await vi.waitFor(() => expect(email.send).toHaveBeenCalledTimes(1));
    expect(realtime.publish).not.toHaveBeenCalled();
  });

  it("account e sicurezza non si spengono: la notifica arriva comunque", async () => {
    const { service, realtime } = build({ topics: { account: { inApp: false, email: false, sms: false } } });
    await service.notify("u-1", "ACCOUNT_REACTIVATED", { note: "ok" });
    expect(realtime.publish).toHaveBeenCalled();
  });

  it("salvando, 'Account e sicurezza' resta acceso su sito ed email", async () => {
    const { service, prisma } = build(null);
    const saved = await service.updatePreferences("u-1", {
      topics: {
        richieste: { inApp: true, email: false, sms: true },
        preventivi: { inApp: true, email: true, sms: false },
        lavori: { inApp: true, email: true, sms: false },
        messaggi: { inApp: false, email: false, sms: false },
        promemoria: { inApp: true, email: true, sms: false },
        account: { inApp: false, email: false, sms: false },
      },
      popups: false,
      sound: false,
    });
    expect(saved.topics.account).toEqual({ inApp: true, email: true, sms: false });
    expect(saved.topics.richieste).toEqual({ inApp: true, email: false, sms: true });
    expect(prisma.user.update).toHaveBeenCalled();
  });
});

