import { afterEach, describe, expect, it, vi } from "vitest";
import { ReviewPhotoCheckService } from "./review-photo-check";

/** Foto del cliente in home solo dopo il controllo (docs/changelog/2026-11-19-foto-recensioni-in-home.md). */
const A = "https://res.cloudinary.com/x/image/upload/v1/a.jpg";
const B = "https://res.cloudinary.com/x/image/upload/v1/b.jpg";
const VIDEO = "https://res.cloudinary.com/x/video/upload/v1/c.mp4";

function build(photoUrls: string[] = []) {
  const prisma = { review: { updateMany: vi.fn().mockResolvedValue({ count: 1 }), findUnique: vi.fn().mockResolvedValue({ photoUrls }) } };
  const service = new ReviewPhotoCheckService(prisma as never);
  service.download = vi.fn().mockResolvedValue(Buffer.from("x"));
  return { service, prisma };
}

afterEach(() => vi.unstubAllEnvs());

describe("ReviewPhotoCheckService", () => {
  it("salva solo le foto buone, mai i video, se le foto sono ancora quelle", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "k");
    const { service, prisma } = build([A, B, VIDEO]);
    service.ask = vi.fn().mockResolvedValueOnce("ok").mockResolvedValueOnce("contatti");
    await expect(service.check("r-1")).resolves.toEqual([A]);
    expect(service.ask).toHaveBeenCalledTimes(2);
    expect(prisma.review.updateMany).toHaveBeenCalledWith({
      where: { id: "r-1", photoUrls: { equals: [A, B, VIDEO] } },
      data: { homePhotoUrls: [A], homePhotosCheckedAt: expect.any(Date) },
    });
  });

  it("se una foto non si può controllare non salva niente", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "k");
    const { service, prisma } = build([A, B]);
    service.ask = vi.fn().mockResolvedValueOnce("ok").mockResolvedValueOnce("non-controllata");
    await expect(service.check("r-1")).resolves.toBeNull();
    expect(prisma.review.updateMany).not.toHaveBeenCalled();
  });

  it("una foto che non si scarica non passa", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "k");
    const { service, prisma } = build([A]);
    service.download = vi.fn().mockResolvedValue(null);
    service.ask = vi.fn();
    await expect(service.check("r-1")).resolves.toBeNull();
    expect(service.ask).not.toHaveBeenCalled();
    expect(prisma.review.updateMany).not.toHaveBeenCalled();
  });

  it("in produzione senza chiave nessuna foto va in home", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("NODE_ENV", "production");
    const { service, prisma } = build([A]);
    await expect(service.check("r-1")).resolves.toBeNull();
    expect(prisma.review.updateMany).not.toHaveBeenCalled();
  });

  it("dopo un errore non riprova subito la stessa recensione", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "k");
    const { service } = build();
    const check = vi.spyOn(service, "check").mockResolvedValue(null);
    service.checkInBackground([{ id: "r-1", hasPhotos: true }]);
    await vi.waitFor(() => expect(check).toHaveBeenCalledTimes(1));
    // check() segna da solo l'errore; qui lo simuliamo.
    (service as unknown as { lastFailure: Map<string, number> }).lastFailure.set("r-1", Date.now());
    await new Promise((r) => setTimeout(r, 0));
    service.checkInBackground([{ id: "r-1", hasPhotos: true }, { id: "r-2", hasPhotos: false }]);
    expect(check).toHaveBeenCalledTimes(1);
  });
});
