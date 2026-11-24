import { BadRequestException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { GuidedRequestInput } from "@professionisti/shared";
import { GuidedRequestsService } from "./guided-requests.service";

/**
 * Una richiesta online a un professionista scelto parte solo se lui lavora
 * online (docs/changelog/2026-11-24-data-richiesta-senza-orari.md): il modulo
 * spegne il tasto, il server ferma un link vecchio o una chiamata diretta.
 */
const PRO_ID = "0b6f7c1e-5d2a-4c3b-9a8e-1f2d3c4b5a61";

function buildService(remoteAvailable: boolean) {
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
    remoteAvailable,
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
      findFirst: vi.fn().mockResolvedValue(null),
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
  description: "Mi serve un consiglio sulla caldaia",
  photoUrls: [],
  city: "Latina",
  serviceMode: "ONLINE",
  isUrgent: false,
  forwardIfNoReply: false,
  professionalProfileId: PRO_ID,
} as unknown as Omit<GuidedRequestInput, "extraCategorySlugs">;

describe("richiesta online a un professionista scelto", () => {
  it("si ferma se il professionista non lavora online", async () => {
    const { service, prisma } = buildService(false);
    await expect(service.create("client-1", input)).rejects.toThrow(BadRequestException);
    await expect(service.create("client-1", input)).rejects.toThrow('Idraulica Rossi non lavora online: scegli "A domicilio".');
    expect(prisma.guidedRequest.create).not.toHaveBeenCalled();
  });

  it("parte se il professionista lavora online", async () => {
    const { service, prisma } = buildService(true);
    await service.create("client-1", input);
    expect(prisma.guidedRequest.create).toHaveBeenCalledTimes(1);
  });
});
