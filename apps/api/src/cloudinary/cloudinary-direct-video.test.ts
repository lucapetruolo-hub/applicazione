import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CloudinaryService } from "./cloudinary.service";

// Permesso firmato per i video caricati dal browser
// (docs/changelog/2026-11-18-video-che-carica-ancora.md).
describe("signDirectVideoUpload", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("senza Cloudinary non dà il permesso (il sito ripiega sull'API)", () => {
    vi.stubEnv("CLOUDINARY_CLOUD_NAME", "");
    vi.stubEnv("CLOUDINARY_API_KEY", "");
    vi.stubEnv("CLOUDINARY_API_SECRET", "");
    expect(new CloudinaryService().signDirectVideoUpload("guided-requests", 60)).toBeNull();
  });

  it("firma cartella, nome a caso senza sovrascrittura, ora e trasformazione 480p con il taglio a 65 secondi", () => {
    vi.stubEnv("CLOUDINARY_CLOUD_NAME", "demo");
    vi.stubEnv("CLOUDINARY_API_KEY", "chiave");
    vi.stubEnv("CLOUDINARY_API_SECRET", "segreto");
    const ticket = new CloudinaryService().signDirectVideoUpload("guided-requests", 60);
    expect(ticket?.uploadUrl).toBe("https://api.cloudinary.com/v1_1/demo/video/upload");
    const fields = ticket!.fields;
    expect(fields.folder).toBe("guided-requests");
    expect(fields.transformation).toBe("c_limit,w_854,h_854,du_65,q_auto");
    expect(fields.api_key).toBe("chiave");
    // Un permesso = un video (docs/changelog/2026-11-19-revisione-termini-e-video.md).
    expect(fields.overwrite).toBe("false");
    expect(fields.public_id).toMatch(/^[0-9a-f]{24}$/);
    expect(new CloudinaryService().signDirectVideoUpload("guided-requests", 60)!.fields.public_id).not.toBe(fields.public_id);
    // La firma di Cloudinary: parametri in ordine alfabetico, poi il segreto, SHA-1.
    const toSign = `folder=${fields.folder}&overwrite=false&public_id=${fields.public_id}&timestamp=${fields.timestamp}&transformation=${fields.transformation}segreto`;
    expect(fields.signature).toBe(createHash("sha1").update(toSign).digest("hex"));
  });
});

describe("takeVideoUpload", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("ferma l'utente al suo tetto del giorno senza toccare gli altri", async () => {
    vi.stubEnv("VIDEO_UPLOAD_USER_DAILY_LIMIT", "2");
    const service = new CloudinaryService();
    const now = new Date("2026-11-19T10:00:00Z");
    expect(await service.takeVideoUpload("u-1", now)).toBe(true);
    expect(await service.takeVideoUpload("u-1", now)).toBe(true);
    expect(await service.takeVideoUpload("u-1", now)).toBe(false);
    expect(await service.takeVideoUpload("u-2", now)).toBe(true);
    // Il giorno dopo si riparte.
    expect(await service.takeVideoUpload("u-1", new Date("2026-11-20T10:00:00Z"))).toBe(true);
  });

  it("ferma tutti al tetto del sito", async () => {
    vi.stubEnv("VIDEO_UPLOAD_DAILY_LIMIT", "1");
    const service = new CloudinaryService();
    const now = new Date("2026-11-19T10:00:00Z");
    expect(await service.takeVideoUpload("u-1", now)).toBe(true);
    expect(await service.takeVideoUpload("u-2", now)).toBe(false);
  });
});
