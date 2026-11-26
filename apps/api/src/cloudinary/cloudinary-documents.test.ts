import { PassThrough } from "node:stream";
import { v2 as cloudinary } from "cloudinary";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CloudinaryService, ownCloudinaryMedia, uploadFailureMessage } from "./cloudinary.service";

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

describe("ownCloudinaryMedia e deleteOwnMedia", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("riconosce solo foto e video del nostro Cloudinary", () => {
    expect(ownCloudinaryMedia("https://res.cloudinary.com/demo/image/upload/v17/guided-requests/abc.jpg", "demo")).toEqual({ resourceType: "image", publicId: "guided-requests/abc" });
    expect(ownCloudinaryMedia("https://res.cloudinary.com/demo/video/upload/v17/guided-requests/clip.mp4", "demo")).toEqual({ resourceType: "video", publicId: "guided-requests/clip" });
    expect(ownCloudinaryMedia("https://res.cloudinary.com/altro/image/upload/v17/a.jpg", "demo")).toBeNull();
    expect(ownCloudinaryMedia("https://res.cloudinary.com/demo/raw/upload/v17/x-fattura.pdf", "demo")).toBeNull();
    expect(ownCloudinaryMedia("https://sito.example/copertine/idraulico-1.jpg", "demo")).toBeNull();
    expect(ownCloudinaryMedia(null, "demo")).toBeNull();
  });

  it("cancella per tipo, una volta sola per file, e non si ferma se Cloudinary sbaglia", async () => {
    vi.stubEnv("CLOUDINARY_CLOUD_NAME", "demo");
    vi.stubEnv("CLOUDINARY_API_KEY", "chiave");
    vi.stubEnv("CLOUDINARY_API_SECRET", "segreto");
    const spy = vi.spyOn(cloudinary.api, "delete_resources").mockImplementation((async (ids: string[], opts: { resource_type: string }) => {
      if (opts.resource_type === "video") throw { message: "rate limited", http_code: 420 };
      return { deleted: Object.fromEntries(ids.map((id) => [id, "deleted"])) };
    }) as unknown as typeof cloudinary.api.delete_resources);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const count = await new CloudinaryService().deleteOwnMedia([
      "https://res.cloudinary.com/demo/image/upload/v1/a.jpg",
      "https://res.cloudinary.com/demo/image/upload/v2/a.jpg",
      "https://res.cloudinary.com/demo/video/upload/v1/b.mp4",
      "https://res.cloudinary.com/altro/image/upload/v1/c.jpg",
      null,
    ]);
    expect(spy).toHaveBeenCalledWith(["a"], { resource_type: "image", type: "upload", invalidate: true });
    expect(spy).toHaveBeenCalledWith(["b"], { resource_type: "video", type: "upload", invalidate: true });
    expect(count).toBe(1);
  });
});
