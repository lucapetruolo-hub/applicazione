import { BadRequestException } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OwnMediaUrlsPipe } from "./own-media-urls.pipe";

describe("OwnMediaUrlsPipe", () => {
  afterEach(() => vi.unstubAllEnvs());
  const pipe = new OwnMediaUrlsPipe();

  it("accetta solo foto e video del nostro Cloudinary", () => {
    vi.stubEnv("CLOUDINARY_CLOUD_NAME", "nostro");
    const ok = { photoUrls: ["https://res.cloudinary.com/nostro/video/upload/v1/a.mp4"], mediaUrls: ["https://res.cloudinary.com/nostro/raw/upload/f.pdf"] };
    expect(pipe.transform(ok)).toBe(ok);
    expect(() => pipe.transform({ photoUrls: ["https://altro-sito.it/a.jpg"] })).toThrow(BadRequestException);
    expect(() => pipe.transform({ mediaUrls: ["https://res.cloudinary.com/altro/image/upload/a.jpg"] })).toThrow(BadRequestException);
  });

  it("senza Cloudinary configurato (prove in locale) non blocca", () => {
    vi.stubEnv("CLOUDINARY_CLOUD_NAME", "");
    expect(pipe.transform({ photoUrls: ["https://x/a.jpg"] })).toEqual({ photoUrls: ["https://x/a.jpg"] });
  });
});
