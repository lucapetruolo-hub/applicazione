import { describe, expect, it } from "vitest";
import { COVER_PRESET_IDS, profileCover, coverPresetsFor, isCoverPreset } from "./coverPresets";
import { setCoverPresetSchema } from "./schemas";

describe("copertine pronte (docs/changelog/2026-11-13-copertina-profilo.md)", () => {
  it("due per mestiere, quelle del professionista per prime", () => {
    expect(COVER_PRESET_IDS).toContain("idraulico");
    expect(COVER_PRESET_IDS).toContain("idraulico-2");
    expect(coverPresetsFor(["falegname", "fabbro"]).slice(0, 5).map((preset) => preset.id)).toEqual(["falegname", "falegname-2", "fabbro", "fabbro-2", "colore-verde"]);
    expect(coverPresetsFor(["falegname"])).toHaveLength(COVER_PRESET_IDS.length);
  });

  it("la foto caricata vince sulla copertina pronta", () => {
    expect(profileCover({ coverImageUrl: "https://res.cloudinary.com/x.jpg", coverPreset: "idraulico" })).toEqual({ src: "https://res.cloudinary.com/x.jpg", tone: "dark" });
    expect(profileCover({ coverPreset: "pulizie" })).toEqual({ src: "/copertine/pulizie.webp", tone: "dark" });
    expect(profileCover({ coverPreset: "colore-crema" })?.tone).toBe("light");
    expect(profileCover({ coverPreset: "inventata" })).toBeNull();
    expect(profileCover({})).toBeNull();
  });

  it("si accettano solo copertine esistenti", () => {
    expect(isCoverPreset("pulizie")).toBe(true);
    expect(setCoverPresetSchema.safeParse({ preset: "../etc" }).success).toBe(false);
    expect(setCoverPresetSchema.safeParse({ preset: null }).success).toBe(true);
  });
});

describe("file delle copertine pronte", () => {
  it("ogni copertina ha il file grande e quello piccolo nel sito", async () => {
    const { existsSync } = await import("node:fs");
    const { COVER_PRESETS } = await import("./coverPresets");
    const missing = COVER_PRESETS.flatMap((preset) => [preset.src, preset.thumb, preset.og]).filter((src) => !existsSync(new URL(`../../../apps/web/public${src}`, import.meta.url)));
    expect(missing).toEqual([]);
  });
});
