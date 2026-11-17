import { describe, expect, it, vi } from "vitest";
import { findComuneByName } from "@professionisti/shared";
import { GuidedRequestsService, waitingRequestTimelineMessage } from "./guided-requests.service";
import { requestSentEmail } from "../email/templates/job-emails";

/**
 * Richieste in attesa di un mestiere che nessuno fa ancora vicino al cliente
 * (docs/changelog/2026-11-17-richieste-in-attesa.md): arrivano da sole a chi
 * dichiara quel mestiere appena è visibile, nel suo raggio, anche se vecchie.
 */
const milano = findComuneByName("Milano")!;
const roma = findComuneByName("Roma")!;

const visible = {
  deletedAt: null,
  suspendedAt: null,
  invitePendingAt: null,
  pausedAt: null,
  requestsBlockedUntil: null,
  awayUntil: null,
  demotedUntil: null,
  fiscalProfile: { fiscalDataCompleteAt: new Date("2026-11-01") },
  kind: "PRIVATE",
};

function buildService(options: { services?: { name: string; categorySlug: string | null }[]; at?: { lat: number; lon: number }; existingLeads?: number } = {}) {
  const at = options.at ?? milano;
  const profile = {
    id: "pro-1",
    userId: "pro-user",
    isDemo: false,
    categoryId: "cat-elettricista-principale",
    latitude: at.lat,
    longitude: at.lon,
    engagementRadiusKm: 30,
    remoteAvailable: false,
    bio: "Impianti elettrici civili.",
    certifications: null,
    services: options.services ?? [{ name: "Installazione antenna TV", categorySlug: "elettricista" }],
  };
  const request = {
    id: "gr-1",
    clientId: "client-1",
    city: "Milano",
    serviceMode: "HOME",
    timing: "WEEK",
    expiresAt: new Date("2027-01-10"),
    createdAt: new Date("2026-11-01T10:00:00Z"),
    waitingTrade: "Antennista",
    waitingTradeKey: "antennista",
  };
  const prisma = {
    professionalProfile: {
      // Prima chiamata: receivesRequests; seconda: il profilo con prestazioni.
      findUnique: vi.fn().mockResolvedValueOnce(visible).mockResolvedValueOnce(profile),
    },
    guidedRequest: { findMany: vi.fn().mockResolvedValue([request]), update: vi.fn().mockResolvedValue(request) },
    category: { findUnique: vi.fn().mockResolvedValue({ id: "cat-elettricista" }) },
    lead: {
      count: vi.fn().mockResolvedValue(options.existingLeads ?? 0),
      create: vi.fn().mockResolvedValue({ id: "lead-1" }),
    },
  };
  const notifications = { notify: vi.fn() };
  const metrics = { recordRequestReceived: vi.fn() };
  const timeline = { log: vi.fn() };
  const service = new GuidedRequestsService(prisma as never, notifications as never, metrics as never, timeline as never, {} as never);
  return { service, prisma, notifications, timeline };
}

describe("matchProfileToWaitingTrades", () => {
  it("manda la richiesta in attesa a chi dichiara il mestiere nel suo raggio e avvisa il cliente", async () => {
    const { service, prisma, notifications, timeline } = buildService();
    await service.matchProfileToWaitingTrades("pro-1");
    expect(prisma.lead.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ guidedRequestId: "gr-1", professionalProfileId: "pro-1", wasExpanded: true }),
    });
    // Al primo che la riceve prende il mestiere della prestazione con le parole del lavoro.
    expect(prisma.guidedRequest.update).toHaveBeenCalledWith({ where: { id: "gr-1" }, data: { status: "MATCHED", categoryId: "cat-elettricista" } });
    expect(notifications.notify).toHaveBeenCalledWith("pro-user", "NEW_LEAD", expect.objectContaining({ guidedRequestId: "gr-1", category: "Antennista" }));
    expect(notifications.notify).toHaveBeenCalledWith("client-1", "REQUEST_MATCHED_LATER", { guidedRequestId: "gr-1" });
    expect(timeline.log).toHaveBeenCalledWith("gr-1", "pro-1", "SYSTEM", expect.stringContaining("quando nessuno faceva questo lavoro"));
  });

  it("non la manda a chi non dichiara il mestiere", async () => {
    const { service, prisma, notifications } = buildService({ services: [{ name: "Rifacimento impianto", categorySlug: "elettricista" }] });
    await service.matchProfileToWaitingTrades("pro-1");
    expect(prisma.lead.create).not.toHaveBeenCalled();
    expect(notifications.notify).not.toHaveBeenCalled();
  });

  it("non la manda a chi è fuori dal suo raggio", async () => {
    const { service, prisma } = buildService({ at: roma });
    await service.matchProfileToWaitingTrades("pro-1");
    expect(prisma.lead.create).not.toHaveBeenCalled();
  });

  it("al secondo professionista non cambia il mestiere né riavvisa il cliente", async () => {
    const { service, prisma, notifications } = buildService({ existingLeads: 1 });
    await service.matchProfileToWaitingTrades("pro-1");
    expect(prisma.lead.create).toHaveBeenCalled();
    expect(prisma.guidedRequest.update).toHaveBeenCalledWith({ where: { id: "gr-1" }, data: { status: "MATCHED" } });
    expect(notifications.notify).not.toHaveBeenCalledWith("client-1", "REQUEST_MATCHED_LATER", expect.anything());
  });
});

describe("waitingRequestTimelineMessage", () => {
  it("dice da quanto aspetta la richiesta", () => {
    const now = new Date("2026-11-13T12:00:00Z");
    expect(waitingRequestTimelineMessage(new Date("2026-11-13T08:00:00Z"), now)).toContain("oggi");
    expect(waitingRequestTimelineMessage(new Date("2026-11-12T08:00:00Z"), now)).toContain("ieri");
    expect(waitingRequestTimelineMessage(new Date("2026-11-01T08:00:00Z"), now)).toContain("12 giorni fa");
  });
});

describe("email di conferma di una richiesta in attesa", () => {
  it("dice che la mandiamo a chi si iscrive, senza promettere quando", () => {
    const email = requestSentEmail({ name: "Anna", category: "Antennista", city: "Bari", isUrgent: false, sentTo: 0, direct: false, waiting: true });
    expect(email.subject).toBe("Richiesta inviata: Antennista a Bari");
    expect(email.text).toContain("Oggi nessuno fa ancora questo lavoro vicino a te");
    expect(email.text).toContain("Non sappiamo dirti quando");
    expect(email.text).not.toMatch(/ce ne occupiamo noi/i);
  });
});
