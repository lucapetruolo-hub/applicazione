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

  it("firma cartella, ora e trasformazione 480p con il taglio a 65 secondi", () => {
    vi.stubEnv("CLOUDINARY_CLOUD_NAME", "demo");
    vi.stubEnv("CLOUDINARY_API_KEY", "chiave");
    vi.stubEnv("CLOUDINARY_API_SECRET", "segreto");
    const ticket = new CloudinaryService().signDirectVideoUpload("guided-requests", 60);
    expect(ticket?.uploadUrl).toBe("https://api.cloudinary.com/v1_1/demo/video/upload");
    const fields = ticket!.fields;
    expect(fields.folder).toBe("guided-requests");
    expect(fields.transformation).toBe("c_limit,w_854,h_854,du_65,q_auto");
    expect(fields.api_key).toBe("chiave");
    // La firma di Cloudinary: parametri in ordine alfabetico, poi il segreto, SHA-1.
    const toSign = `folder=${fields.folder}&timestamp=${fields.timestamp}&transformation=${fields.transformation}segreto`;
    expect(fields.signature).toBe(createHash("sha1").update(toSign).digest("hex"));
  });
});
