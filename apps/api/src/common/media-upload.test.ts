import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MEDIA_UPLOAD_DIR, temporaryUploadPath } from "./media-upload";

/** Solo i file scritti da Multer si leggono e si cancellano (docs/changelog/2026-11-16-traffico-elevato.md). */
describe("temporaryUploadPath", () => {
  const name = "0123456789abcdef0123456789abcdef";

  it("accetta il file di Multer nella cartella temporanea", () => {
    expect(temporaryUploadPath(join(MEDIA_UPLOAD_DIR, name))).toBe(join(MEDIA_UPLOAD_DIR, name));
  });

  it("ignora qualunque altro percorso", () => {
    expect(temporaryUploadPath(undefined)).toBeNull();
    expect(temporaryUploadPath("/etc/passwd")).toBeNull();
    expect(temporaryUploadPath(join(MEDIA_UPLOAD_DIR, "..", name))).toBeNull();
    expect(temporaryUploadPath(join(MEDIA_UPLOAD_DIR, "sub", name))).toBeNull();
    expect(temporaryUploadPath(join(MEDIA_UPLOAD_DIR, "foto.jpg"))).toBeNull();
  });
});
