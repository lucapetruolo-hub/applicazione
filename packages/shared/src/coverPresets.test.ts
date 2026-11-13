import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { COVER_PRESETS, COVER_PRESET_IDS, profileCover, coverPresetsFor, isCoverPreset } from "./coverPresets";
import { setCoverPresetSchema } from "./schemas";

// Copertine pronte (docs/changelog/2026-11-13-copertina-profilo.md).

test("copertine: due per mestiere, quelle del professionista per prime", () => {
  assert.ok(COVER_PRESET_IDS.includes("idraulico"));
  assert.ok(COVER_PRESET_IDS.includes("idraulico-2"));
  assert.deepEqual(
    coverPresetsFor(["falegname", "fabbro"]).slice(0, 5).map((preset) => preset.id),
    ["falegname", "falegname-2", "fabbro", "fabbro-2", "colore-verde"],
  );
  assert.equal(coverPresetsFor(["falegname"]).length, COVER_PRESET_IDS.length);
});

test("copertine: la foto caricata vince sulla copertina pronta", () => {
  assert.deepEqual(profileCover({ coverImageUrl: "https://res.cloudinary.com/x.jpg", coverPreset: "idraulico" }), { src: "https://res.cloudinary.com/x.jpg", tone: "dark" });
  assert.deepEqual(profileCover({ coverPreset: "pulizie" }), { src: "/copertine/pulizie.webp", tone: "dark" });
  assert.equal(profileCover({ coverPreset: "colore-crema" })?.tone, "light");
  assert.equal(profileCover({ coverPreset: "inventata" }), null);
  assert.equal(profileCover({}), null);
});

test("copertine: si accettano solo copertine esistenti", () => {
  assert.equal(isCoverPreset("pulizie"), true);
  assert.equal(setCoverPresetSchema.safeParse({ preset: "../etc" }).success, false);
  assert.equal(setCoverPresetSchema.safeParse({ preset: null }).success, true);
});

test("copertine: ogni copertina ha il file grande, quello piccolo e l'anteprima nel sito", () => {
  const publicDir = join(__dirname, "..", "..", "..", "apps", "web", "public");
  const missing = COVER_PRESETS.flatMap((preset) => [preset.src, preset.thumb, preset.og]).filter((src) => !existsSync(join(publicDir, src)));
  assert.deepEqual(missing, []);
});
