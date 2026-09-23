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
    };
    const realtime = { publish: vi.fn() };
    return { service: new NotificationsService(prisma as never, realtime as never), prisma, realtime };
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
