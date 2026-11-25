import { PassThrough } from "node:stream";
import { v2 as cloudinary } from "cloudinary";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CloudinaryService, uploadFailureMessage } from "./cloudinary.service";

// Documenti della chat: estensione nell'indirizzo dal contenuto vero
// (docs/changelog/2026-11-25-parti-lasciate-fuori-sicurezza.md).
function fakeFile(content: string, originalname: string, mimetype: string): Express.Multer.File {
  return { buffer: Buffer.from(content, "latin1"), originalname, mimetype, size: content.length } as Express.Multer.File;
}

describe("uploadMedia, documenti", () => {
  let options: Record<string, unknown> | undefined;

  beforeEach(() => {
    vi.stubEnv("CLOUDINARY_CLOUD_NAME", "demo");
    vi.stubEnv("CLOUDINARY_API_KEY", "chiave");
    vi.stubEnv("CLOUDINARY_API_SECRET", "segreto");
    options = undefined;
    vi.spyOn(cloudinary.uploader, "upload_stream").mockImplementation(((opts: Record<string, unknown>, callback: (error: unknown, result: unknown) => void) => {
      options = opts;
      const stream = new PassThrough();
      stream.on("finish", () => callback(undefined, { secure_url: `https://res.cloudinary.com/demo/raw/upload/v1/${String(opts.folder)}/${String(opts.public_id)}` }));
      stream.resume();
      return stream;
    }) as unknown as typeof cloudinary.uploader.upload_stream);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("un PDF vero chiamato .html esce con .pdf nell'indirizzo", async () => {
    const url = await new CloudinaryService().uploadMedia(fakeFile("%PDF-1.4\n%%EOF", "fattura.html", "application/pdf"), "timeline-updates");
    expect(options?.resource_type).toBe("raw");
    expect(options?.public_id).toMatch(/^[0-9a-f]{12}-fattura\.pdf$/);
    expect(options).not.toHaveProperty("format");
    expect(url.endsWith(".pdf")).toBe(true);
  });

  it("un Word nuovo prende .docx", async () => {
    const url = await new CloudinaryService().uploadMedia(
      fakeFile("PK\u0003\u0004resto", "preventivo.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
      "timeline-updates",
    );
    expect(url).toMatch(/-preventivo\.docx$/);
  });
});

describe("uploadFailureMessage", () => {
  it("un rifiuto di Cloudinary dice cosa caricare", () => {
    expect(uploadFailureMessage({ message: "Invalid image file", http_code: 400 }, "image")).toBe("Il file caricato non è una foto (JPEG, PNG, WebP o HEIC).");
    expect(uploadFailureMessage({ message: "x", http_code: 400 }, "raw")).toBe("Il file non è un PDF, un documento Word o un foglio Excel.");
  });

  it("un altro errore non mostra il testo di Cloudinary", () => {
    expect(uploadFailureMessage(new Error("timeout"), "image")).toBe("Caricamento non riuscito, riprova tra poco.");
  });
});
