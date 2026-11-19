import { describe, expect, it } from "vitest";
import { cloudinaryPublicId } from "./cloudinary.service";

/** Foto degli scontrini da cancellare (docs/changelog/2026-11-19-entrate-e-uscite.md). */
describe("cloudinaryPublicId", () => {
  it("toglie versione ed estensione", () => {
    expect(cloudinaryPublicId("https://res.cloudinary.com/demo/image/upload/v1731000000/receipts/abc123.jpg")).toBe("receipts/abc123");
    expect(cloudinaryPublicId("https://res.cloudinary.com/demo/image/upload/receipts/abc123.webp")).toBe("receipts/abc123");
  });

  it("ignora indirizzi non di Cloudinary o non validi", () => {
    expect(cloudinaryPublicId("https://example.com/demo/image/upload/v1/receipts/a.jpg")).toBeNull();
    expect(cloudinaryPublicId("https://res.cloudinary.com/demo/video/upload/v1/a.mp4")).toBeNull();
    expect(cloudinaryPublicId("non un indirizzo")).toBeNull();
    expect(cloudinaryPublicId(null)).toBeNull();
  });
});
