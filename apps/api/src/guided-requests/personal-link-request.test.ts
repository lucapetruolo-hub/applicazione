import { describe, expect, it, vi } from "vitest";
import type { GuidedRequestInput } from "@professionisti/shared";
import { GuidedRequestsService } from "./guided-requests.service";

/**
 * Richiesta dal link personale del professionista
 * (docs/changelog/2026-11-08-canale-del-professionista.md): è un cliente suo
 * solo se il sito non glielo aveva già portato.
 */
const PRO_ID = "0b6f7c1e-5d2a-4c3b-9a8e-1f2d3c4b5a61";

function buildService({ earlierSiteLead = false } = {}) {
  const category = { id: "cat-1", slug: "idraulico", label: "Idraulico" };
  const pro = {
    id: PRO_ID,
    userId: "user-pro",
    businessName: "Idraulica Rossi",
    deletedAt: null,
    suspendedAt: null,
    invitePendingAt: null,
    pausedAt: null,
    demotedUntil: null,
    requestsBlockedUntil: null,
    awayUntil: null,
    category,
    categoryId: "cat-1",
    extraCategories: [],
    isDemo: true,
    fiscalProfile: null,
  };
  const prisma = {
    category: { findUnique: vi.fn().mockResolvedValue(category) },
    professionalProfile: {
      findUnique: vi.fn().mockResolvedValue(pro),
      findMany: vi.fn().mockResolvedValue([pro]),
    },
    guidedRequest: {
      create: vi.fn(({ data }: { data: Record<string, unknown> }) => Promise.resolve({ id: "gr-1", ...data })),
      update: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue([]),
    },
    lead: {
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
      findFirst: vi.fn().mockResolvedValue(earlierSiteLead ? { id: "lead-0" } : null),
    },
    $transaction: vi.fn((fn: (tx: unknown) => unknown) => fn(prisma)),
  };
  const service = new GuidedRequestsService(
    prisma as never,
    { notify: vi.fn(), emailRequestSent: vi.fn() } as never,
    { recordRequestReceived: vi.fn() } as never,
    { log: vi.fn() } as never,
    { availability: vi.fn().mockResolvedValue({ open: true }) } as never,
  );
  return { service, prisma };
}

const input = {
  categorySlug: "idraulico",
  description: "Perde il rubinetto della cucina",
  photoUrls: [],
  city: "Latina",
  serviceMode: "ONLINE",
  isUrgent: false,
  forwardIfNoReply: false,
  professionalProfileId: PRO_ID,
} as unknown as Omit<GuidedRequestInput, "extraCategorySlugs">;

describe("richiesta dal link personale", () => {
  it("un cliente nuovo per il professionista diventa un cliente suo", async () => {
    const { service, prisma } = buildService();
    await service.create("client-1", { ...input, viaProfessionalLink: true });
    expect(prisma.guidedRequest.create.mock.calls[0]![0].data).toMatchObject({ fromProfessionalLink: true, professionalProfileId: PRO_ID });
    // Cerca solo le richieste che gli ha portato il sito (ricerca, smistamento, inoltri da altri link).
    expect(prisma.lead.findFirst.mock.calls[0]![0].where).toEqual({
      professionalProfileId: PRO_ID,
      guidedRequest: { clientId: "client-1", OR: [{ fromProfessionalLink: false }, { professionalProfileId: { not: PRO_ID } }] },
    });
  });

  it("un cliente che il sito gli aveva già portato resta un cliente del sito", async () => {
    const { service, prisma } = buildService({ earlierSiteLead: true });
    await service.create("client-1", { ...input, viaProfessionalLink: true });
    expect(prisma.guidedRequest.create.mock.calls[0]![0].data).toMatchObject({ fromProfessionalLink: false });
  });

  it("senza il link è una richiesta diretta come le altre", async () => {
    const { service, prisma } = buildService();
    await service.create("client-1", input);
    expect(prisma.guidedRequest.create.mock.calls[0]![0].data).toMatchObject({ fromProfessionalLink: false });
    expect(prisma.lead.findFirst).not.toHaveBeenCalled();
  });
});
