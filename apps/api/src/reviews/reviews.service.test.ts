import { describe, expect, it, vi } from "vitest";
import { ReviewsService } from "./reviews.service";

/**
 * Recensione subito dopo il proprio "Lavoro terminato" (docs/CHANGELOG.md
 * §189): il cliente può recensire prima che il professionista chiuda il
 * lavoro, e la recensione è pubblica subito (§215).
 */
const DAY = 24 * 60 * 60 * 1000;
const person = (over: Record<string, unknown> = {}) => ({
  email: "maria@example.com",
  phone: "3331112222",
  phoneVerifiedNumber: null,
  street: "Via Roma",
  houseNumber: "1",
  city: "Latina",
  createdAt: new Date(Date.now() - 60 * DAY),
  testAccountAt: null,
  ...over,
});

function buildService(booking: Record<string, unknown>, holdData: Record<string, unknown> = {}) {
  const base = {
    id: "b-1",
    clientId: "client-1",
    professionalProfileId: "pro-1",
    review: null,
    issue: null,
    professionalProfile: { userId: "pro-user-1", user: person({ email: "marco@example.com", phone: "3339998888", street: "Via Milano" }) },
    quote: { guidedRequestId: "gr-1", guidedRequest: null },
    // Dati letti dal controllo prima della pubblicazione (collaudo P-01).
    createdAt: new Date(Date.now() - 5 * DAY),
    scheduledAt: new Date(Date.now() - DAY),
    scheduledEndAt: null,
    recipientPhone: null,
    street: null,
    houseNumber: null,
    city: null,
    jobPayment: null,
    client: person(),
    ...holdData,
    ...booking,
  };
  const prisma = {
    booking: { findUnique: vi.fn().mockResolvedValue(base) },
    review: { create: vi.fn().mockResolvedValue({ id: "r-1" }), findMany: vi.fn().mockResolvedValue([]) },
  };
  const metrics = { recordReview: vi.fn() };
  const notifications = { notify: vi.fn() };
  const service = new ReviewsService(prisma as never, metrics as never, notifications as never);
  return { service, prisma, notifications, metrics };
}

const input = { bookingId: "b-1", rating: 4, comment: "Bene", photoUrls: [], showcase: false };

describe("ReviewsService.create — recensione subito dopo \"Lavoro terminato\"", () => {
  it("il cliente recensisce anche se il professionista non ha ancora chiuso il lavoro", async () => {
    const { service, prisma, notifications } = buildService({ status: "CONFIRMED", clientConfirmedCompletedAt: new Date() });
    await expect(service.create("client-1", input)).resolves.toEqual({ id: "r-1", held: false });
    expect(prisma.review.create).toHaveBeenCalled();
    expect(notifications.notify).toHaveBeenCalledWith("pro-user-1", "NEW_REVIEW", expect.objectContaining({ professionalCompleted: false }));
  });

  it("con lo stesso telefono del professionista resta in controllo, senza avviso né media (collaudo P-01)", async () => {
    const { service, prisma, notifications, metrics } = buildService({ status: "CONFIRMED", clientConfirmedCompletedAt: new Date() }, { client: person({ phone: "+39 333 999 8888" }) });
    await expect(service.create("client-1", input)).resolves.toEqual({ id: "r-1", held: true });
    expect(prisma.review.create).toHaveBeenCalledWith({ data: expect.objectContaining({ hiddenAt: expect.any(Date), heldAt: expect.any(Date), heldReasons: ["SAME_PHONE"] }) });
    expect(notifications.notify).not.toHaveBeenCalled();
    expect(metrics.recordReview).not.toHaveBeenCalled();
  });

  it("non prima di aver cliccato \"Lavoro terminato\"", async () => {
    const { service, prisma } = buildService({ status: "COMPLETED", clientConfirmedCompletedAt: null });
    await expect(service.create("client-1", input)).rejects.toThrow("Conferma prima");
    expect(prisma.review.create).not.toHaveBeenCalled();
  });
});

/**
 * "Lavori fatti" (docs/changelog/2026-11-08-lavori-fatti.md): le foto di fine
 * lavoro del professionista vanno sul suo profilo solo con l'ok del cliente,
 * che lo ritira quando vuole.
 */
describe("ReviewsService — ok a \"Lavori fatti\"", () => {
  const done = { status: "COMPLETED", clientConfirmedCompletedAt: new Date() };

  it("recensendo con l'ok e le foto del professionista segna il consenso", async () => {
    const { service, prisma } = buildService({ ...done, professionalCompletionPhotoUrls: ["https://res.cloudinary.com/x/a.jpg"] });
    await service.create("client-1", { ...input, showcase: true });
    expect(prisma.review.create).toHaveBeenCalledWith({ data: expect.objectContaining({ showcaseConsentAt: expect.any(Date) }) });
  });

  it("senza foto del professionista l'ok non vale", async () => {
    const { service, prisma } = buildService({ ...done, professionalCompletionPhotoUrls: [] });
    await service.create("client-1", { ...input, showcase: true });
    expect(prisma.review.create.mock.calls[0]?.[0].data).not.toHaveProperty("showcaseConsentAt");
  });

  function showcaseService(review: unknown) {
    const prisma = { review: { findUnique: vi.fn().mockResolvedValue(review), update: vi.fn().mockResolvedValue({}) } };
    return { service: new ReviewsService(prisma as never, {} as never, {} as never), prisma };
  }

  it("il cliente toglie le foto da \"Lavori fatti\"", async () => {
    const { service, prisma } = showcaseService({ booking: { clientId: "client-1", professionalCompletionPhotoUrls: ["https://res.cloudinary.com/x/a.jpg"] } });
    await expect(service.setShowcase("client-1", "r-1", false)).resolves.toEqual({ showcase: false });
    expect(prisma.review.update).toHaveBeenCalledWith({ where: { id: "r-1" }, data: { showcaseConsentAt: null } });
  });

  it("solo chi ha scritto la recensione", async () => {
    const { service, prisma } = showcaseService({ booking: { clientId: "altro", professionalCompletionPhotoUrls: ["https://res.cloudinary.com/x/a.jpg"] } });
    await expect(service.setShowcase("client-1", "r-1", true)).rejects.toThrow("non è tua");
    expect(prisma.review.update).not.toHaveBeenCalled();
  });

  it("non si rimette senza foto del professionista", async () => {
    const { service } = showcaseService({ booking: { clientId: "client-1", professionalCompletionPhotoUrls: [] } });
    await expect(service.setShowcase("client-1", "r-1", true)).rejects.toThrow("non ha foto");
  });
});

/**
 * Recensioni in home (docs/CHANGELOG.md §232): solo da 3 stelle in su, con
 * un testo, di professionisti attivi (non in pausa, non in attesa di
 * conferma), al massimo 6.
 */
describe("ReviewsService.getRecentPublic — filtri della home", () => {
  it("chiede solo recensioni da 3 stelle, con testo, di profili attivi", async () => {
    const { service, prisma } = buildService({});
    await service.getRecentPublic();
    const args = prisma.review.findMany.mock.calls[0]?.[0];
    expect(args.take).toBe(6);
    expect(args.where).toMatchObject({
      hiddenAt: null,
      rating: { gte: 3 },
      comment: { not: null },
      NOT: { comment: "" },
      booking: {
        professionalProfile: {
          isDemo: false,
          deletedAt: null,
          suspendedAt: null,
          pausedAt: null,
          invitePendingAt: null,
        },
      },
    });
  });
});
