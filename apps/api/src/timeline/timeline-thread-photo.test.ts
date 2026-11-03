import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@professionisti/database";
import { TimelineService } from "./timeline.service";
import { requestThumbnailUrl } from "./request-thumbnail";
import { chatMessageEmail } from "../email/templates/notification-emails";

/** Foto della richiesta nella lista delle chat (docs/changelog/2026-11-03-foto-richiesta-nei-messaggi.md). */
describe("requestThumbnailUrl", () => {
  it("prende la prima foto, saltando i video", () => {
    expect(requestThumbnailUrl(["https://x/v.mp4", "https://x/a.jpg", "https://x/b.jpg"])).toBe("https://x/a.jpg");
  });
  it("con solo video su Cloudinary usa il primo fotogramma", () => {
    expect(requestThumbnailUrl(["https://res.cloudinary.com/demo/video/upload/v1/r/clip.MOV"])).toBe(
      "https://res.cloudinary.com/demo/video/upload/so_0,c_fill,w_112,h_112/v1/r/clip.jpg",
    );
  });
  it("senza foto né video di Cloudinary non c'è miniatura", () => {
    expect(requestThumbnailUrl([])).toBeNull();
    expect(requestThumbnailUrl(["https://altro.it/clip.mp4"])).toBeNull();
  });
});

function thread({ clientDeleted = false, withdrawn = false } = {}) {
  const event = {
    guidedRequestId: "r",
    professionalProfileId: "p",
    actor: "CLIENT",
    automatic: false,
    hiddenAt: null,
    message: "Ciao",
    mediaUrls: [],
    createdAt: new Date("2026-11-03T10:00:00Z"),
    guidedRequest: {
      clientId: "cliente",
      description: "Perdita sotto il lavello",
      photoUrls: ["https://x/lavello.jpg"],
      deletedByClientAt: withdrawn ? new Date() : null,
      client: { firstName: "Anna", lastName: "Rossi", imageUrl: null, deletedAt: clientDeleted ? new Date() : null },
      category: { label: "Idraulico" },
      quotes: [],
    },
    professionalProfile: { businessName: "Idraulica Bianchi", imageUrl: "https://x/pro.jpg", userId: "professionista" },
  };
  const prisma = { conversationEvent: { findMany: vi.fn().mockResolvedValue([event]) } };
  return new TimelineService(prisma as unknown as PrismaClient, {} as never, {} as never);
}

describe("listThreadsForUser, foto della richiesta", () => {
  it("la vedono il cliente e il professionista", async () => {
    expect((await thread().listThreadsForUser("cliente"))[0]?.requestPhotoUrl).toBe("https://x/lavello.jpg");
    expect((await thread().listThreadsForUser("professionista"))[0]?.requestPhotoUrl).toBe("https://x/lavello.jpg");
  });
  it("sparisce con la richiesta ritirata o l'account del cliente eliminato", async () => {
    expect((await thread({ withdrawn: true }).listThreadsForUser("professionista"))[0]?.requestPhotoUrl).toBeNull();
    expect((await thread({ clientDeleted: true }).listThreadsForUser("professionista"))[0]?.requestPhotoUrl).toBeNull();
  });
});

describe("email del nuovo messaggio", () => {
  const ctx = { name: "Anna", category: "Idraulico", city: "Latina", businessName: "Idraulica Bianchi", when: null, proposedWhen: null };
  it("mostra la prima foto della richiesta, piccola", () => {
    const email = chatMessageEmail("TIMELINE_MESSAGE_FROM_PROFESSIONAL", 1, ctx, "https://sito/chat", [
      "https://res.cloudinary.com/demo/image/upload/v1/r/lavello.jpg",
      "https://res.cloudinary.com/demo/image/upload/v1/r/altra.jpg",
    ]);
    expect(email.detailImages?.images).toHaveLength(1);
    expect(email.detailImages?.images[0]?.href).toBe("https://res.cloudinary.com/demo/image/upload/v1/r/lavello.jpg");
  });
  it("senza foto nessun riquadro di foto", () => {
    expect(chatMessageEmail("TIMELINE_MESSAGE_FROM_CLIENT", 2, ctx, "https://sito/chat").detailImages).toBeUndefined();
  });
});
