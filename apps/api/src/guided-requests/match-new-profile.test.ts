import { describe, expect, it, vi } from "vitest";
import { findComuneByName } from "@professionisti/shared";
import { GuidedRequestsService } from "./guided-requests.service";

/**
 * Professionista che si iscrive dopo la richiesta (docs/CHANGELOG.md §271):
 * riceve le richieste aperte compatibili e, se è il primo a riceverne una,
 * il cliente viene avvisato con REQUEST_MATCHED_LATER.
 */
const milano = findComuneByName("Milano")!;

function buildService(existingLeadsOnRequest: number) {
  const request = {
    id: "gr-1",
    clientId: "client-1",
    city: "Milano",
    serviceMode: "HOME",
    isUrgent: false,
    expiresAt: null,
    category: { label: "Idraulico" },
  };
  const prisma = {
    guidedRequest: { findMany: vi.fn().mockResolvedValue([request]), update: vi.fn().mockResolvedValue(request) },
    lead: {
      // Prima chiamata: lead di questo professionista; seconda: tutti i lead della richiesta.
      count: vi.fn().mockResolvedValueOnce(0).mockResolvedValueOnce(existingLeadsOnRequest),
      create: vi.fn().mockResolvedValue({ id: "lead-1" }),
    },
  };
  const notifications = { notify: vi.fn() };
  const metrics = { recordRequestReceived: vi.fn() };
  const timeline = { log: vi.fn() };
  const service = new GuidedRequestsService(prisma as never, notifications as never, metrics as never, timeline as never, {} as never);
  return { service, prisma, notifications };
}

const profile = {
  id: "pro-1",
  userId: "pro-user",
  categoryIds: ["cat-1"],
  latitude: milano.lat,
  longitude: milano.lon,
  engagementRadiusKm: 20,
  urgentEngagementRadiusKm: 20,
  remoteAvailable: false,
};

describe("GuidedRequestsService.matchNewProfileToOpenRequests", () => {
  it("avvisa il cliente quando il nuovo professionista è il primo a ricevere la richiesta", async () => {
    const { service, prisma, notifications } = buildService(0);
    await service.matchNewProfileToOpenRequests(profile);
    expect(prisma.lead.create).toHaveBeenCalledTimes(1);
    expect(notifications.notify).toHaveBeenCalledWith("pro-user", "NEW_LEAD", expect.objectContaining({ guidedRequestId: "gr-1" }));
    expect(notifications.notify).toHaveBeenCalledWith("client-1", "REQUEST_MATCHED_LATER", { guidedRequestId: "gr-1" });
  });

  it("non avvisa di nuovo il cliente se la richiesta aveva già dei destinatari", async () => {
    const { service, notifications } = buildService(2);
    await service.matchNewProfileToOpenRequests(profile);
    expect(notifications.notify).toHaveBeenCalledWith("pro-user", "NEW_LEAD", expect.anything());
    expect(notifications.notify).not.toHaveBeenCalledWith("client-1", "REQUEST_MATCHED_LATER", expect.anything());
  });

  it("non avvisa nessuno se il professionista è fuori dal raggio", async () => {
    const { service, prisma, notifications } = buildService(0);
    await service.matchNewProfileToOpenRequests({ ...profile, latitude: 41.9, longitude: 12.5 });
    expect(prisma.lead.create).not.toHaveBeenCalled();
    expect(notifications.notify).not.toHaveBeenCalled();
  });
});
