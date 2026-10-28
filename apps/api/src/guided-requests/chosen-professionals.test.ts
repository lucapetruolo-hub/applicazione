import { describe, expect, it, vi } from "vitest";
import type { GuidedRequestInput } from "@professionisti/shared";
import { GuidedRequestsService } from "./guided-requests.service";

/**
 * Da 2 a 5 professionisti scelti dai risultati (docs/CHANGELOG.md §390):
 * una sola richiesta che arriva solo a loro, anche dove le richieste
 * generali sono chiuse.
 */
type Pro = { id: string; businessName: string; categoryId: string; pausedAt?: Date | null; deletedAt?: Date | null };

function buildService(pros: Pro[]) {
  const rows = pros.map((pro) => ({
    userId: `user-${pro.id}`,
    deletedAt: null,
    suspendedAt: null,
    invitePendingAt: null,
    pausedAt: null,
    demotedUntil: null,
    requestsBlockedUntil: null,
    extraCategories: [],
    isDemo: true,
    fiscalProfile: null,
    ...pro,
  }));
  const prisma = {
    category: { findUnique: vi.fn().mockResolvedValue({ id: "cat-1", slug: "idraulico", label: "Idraulico" }) },
    professionalProfile: {
      findMany: vi.fn(({ where }: { where: { id: { in: string[] } } }) =>
        Promise.resolve(rows.filter((row) => where.id.in.includes(row.id))),
      ),
    },
    guidedRequest: {
      create: vi.fn(({ data }: { data: Record<string, unknown> }) => Promise.resolve({ id: "gr-1", ...data })),
      update: vi.fn().mockResolvedValue({}),
    },
    lead: { createMany: vi.fn().mockResolvedValue({ count: pros.length }) },
    $transaction: vi.fn((fn: (tx: unknown) => unknown) => fn(prisma)),
  };
  const notifications = { notify: vi.fn(), emailRequestSent: vi.fn() };
  const metrics = { recordRequestReceived: vi.fn() };
  const timeline = { log: vi.fn() };
  const generalRequests = { availability: vi.fn().mockResolvedValue({ open: false, closedScope: "GLOBAL" }) };
  const service = new GuidedRequestsService(
    prisma as never,
    notifications as never,
    metrics as never,
    timeline as never,
    generalRequests as never,
  );
  return { service, prisma, notifications, timeline, generalRequests };
}

const ids = ["0b6f7c1e-5d2a-4c3b-9a8e-1f2d3c4b5a61", "0b6f7c1e-5d2a-4c3b-9a8e-1f2d3c4b5a62", "0b6f7c1e-5d2a-4c3b-9a8e-1f2d3c4b5a63"];
const input = {
  categorySlug: "idraulico",
  description: "Perde il rubinetto della cucina",
  photoUrls: [],
  city: "Latina",
  serviceMode: "ONLINE",
  isUrgent: false,
  forwardIfNoReply: false,
  professionalProfileIds: ids.slice(0, 2),
} as unknown as Omit<GuidedRequestInput, "extraCategorySlugs">;

describe("GuidedRequestsService.create con i professionisti scelti", () => {
  it("arriva solo ai scelti, anche con le richieste generali chiuse", async () => {
    const { service, prisma, notifications, timeline, generalRequests } = buildService([
      { id: ids[0]!, businessName: "Idraulica Rossi", categoryId: "cat-1" },
      { id: ids[1]!, businessName: "Bianchi Impianti", categoryId: "cat-1" },
      { id: ids[2]!, businessName: "Non scelto", categoryId: "cat-1" },
    ]);
    const result = await service.create("client-1", input);
    expect(result.matchedProfessionals).toBe(2);
    expect(generalRequests.availability).not.toHaveBeenCalled();
    expect(prisma.guidedRequest.create.mock.calls[0]![0].data).toMatchObject({
      chosenProfileIds: ids.slice(0, 2),
      professionalProfileId: undefined,
    });
    const leads = prisma.lead.createMany.mock.calls[0]![0].data as { professionalProfileId: string }[];
    expect(leads.map((lead) => lead.professionalProfileId).sort()).toEqual(ids.slice(0, 2).sort());
    expect(notifications.notify).toHaveBeenCalledTimes(2);
    expect(timeline.log).toHaveBeenCalledWith(
      "gr-1",
      ids[0],
      "CLIENT",
      "Il cliente ha scelto te e un altro professionista per questa richiesta di preventivo.",
    );
    expect(notifications.emailRequestSent).toHaveBeenCalledWith(
      "client-1",
      expect.objectContaining({
        chosen: 2,
        direct: false,
        summary: expect.objectContaining({ businessName: "Idraulica Rossi e Bianchi Impianti" }),
      }),
    );
  });

  it("un professionista in pausa blocca l'invio con il suo nome", async () => {
    const { service, prisma } = buildService([
      { id: ids[0]!, businessName: "Idraulica Rossi", categoryId: "cat-1" },
      { id: ids[1]!, businessName: "Bianchi Impianti", categoryId: "cat-1", pausedAt: new Date() },
    ]);
    await expect(service.create("client-1", input)).rejects.toThrow("Bianchi Impianti al momento non accetta nuove richieste");
    expect(prisma.guidedRequest.create).not.toHaveBeenCalled();
  });

  it("un professionista di un altro mestiere viene rifiutato", async () => {
    const { service } = buildService([
      { id: ids[0]!, businessName: "Idraulica Rossi", categoryId: "cat-1" },
      { id: ids[1]!, businessName: "Verdi Giardini", categoryId: "cat-2" },
    ]);
    await expect(service.create("client-1", input)).rejects.toThrow("Verdi Giardini non fa questo lavoro");
  });

  it("un professionista che non è più sul sito viene rifiutato", async () => {
    const { service } = buildService([{ id: ids[0]!, businessName: "Idraulica Rossi", categoryId: "cat-1" }]);
    await expect(service.create("client-1", input)).rejects.toThrow("non è più sul sito");
  });
});
