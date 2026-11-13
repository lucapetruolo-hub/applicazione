/**
 * Copertine pronte per il profilo pubblico (docs/changelog/2026-11-13-copertina-profilo.md),
 * per chi non ha una foto sua: una foto per mestiere (fatta con l'IA di Figma,
 * senza persone né scritte) e sei nei colori del sito. I file stanno in
 * `apps/web/public/copertine/<id>.webp` (1536×768) con la copia piccola
 * `<id>-480.webp` per la scelta e `anteprima/<id>.jpg` per WhatsApp e social. Nel database si salva solo l'id
 * (`ProfessionalProfile.coverPreset`).
 */

import { PROFESSIONAL_CATEGORIES } from "./categories";

/** "light": copertina chiara, sopra il percorso resta scuro; "dark": diventa bianco. */
export type CoverTone = "light" | "dark";
/** `og`: 1200×630 in JPG per l'anteprima su WhatsApp e social (next/og non legge WebP). */
export type CoverPreset = { id: string; label: string; categorySlug: string | null; tone: CoverTone; src: string; thumb: string; og: string };

const COLOR_COVERS: readonly { id: string; label: string; tone: CoverTone }[] = [
  { id: "colore-verde", label: "Verde", tone: "dark" },
  { id: "colore-notte", label: "Notte", tone: "dark" },
  { id: "colore-salvia", label: "Salvia", tone: "light" },
  { id: "colore-crema", label: "Crema", tone: "light" },
  { id: "colore-terracotta", label: "Terracotta", tone: "dark" },
  { id: "colore-cielo", label: "Cielo", tone: "light" },
];

function preset(id: string, label: string, categorySlug: string | null, tone: CoverTone): CoverPreset {
  return { id, label, categorySlug, tone, src: `/copertine/${id}.webp`, thumb: `/copertine/${id}-480.webp`, og: `/copertine/anteprima/${id}.jpg` };
}

export const COVER_PRESETS: readonly CoverPreset[] = [
  ...PROFESSIONAL_CATEGORIES.map((category) => preset(category.slug, category.label, category.slug, "dark")),
  ...COLOR_COVERS.map((color) => preset(color.id, color.label, null, color.tone)),
];

/**
 * Misure della copertina salvata (2:1). Da computer se ne vede una fascia larga
 * (circa 4:1), da telefono un riquadro quasi quadrato: 2:1 è il compromesso
 * che tiene il centro sempre visibile su tutti e due.
 */
export const COVER_WIDTH = 1600;
/** Da telefono: quanta copertina c'è sopra il percorso, nascosta all'apertura (si vede scorrendo in su). */
export const COVER_PHONE_SPACE = 180;
export const COVER_HEIGHT = 800;

export const COVER_PRESET_IDS: readonly string[] = COVER_PRESETS.map((preset) => preset.id);

export function isCoverPreset(id: string | null | undefined): id is string {
  return typeof id === "string" && COVER_PRESET_IDS.includes(id);
}

export function coverPresetById(id: string | null | undefined): CoverPreset | null {
  return COVER_PRESETS.find((preset) => preset.id === id) ?? null;
}

/** Prima le foto dei mestieri del professionista, poi i colori, poi le foto degli altri mestieri. */
export function coverPresetsFor(categorySlugs: readonly string[]): CoverPreset[] {
  const own = categorySlugs.flatMap((slug) => COVER_PRESETS.filter((preset) => preset.categorySlug === slug));
  const colors = COVER_PRESETS.filter((preset) => preset.categorySlug === null);
  return [...own, ...colors, ...COVER_PRESETS.filter((preset) => preset.categorySlug !== null && !own.includes(preset))];
}

/**
 * La copertina da mostrare: la foto caricata vince sulla copertina pronta.
 * Una foto caricata conta come scura (sopra ci va il velo scuro del percorso).
 */
export function profileCover(profile: { coverImageUrl?: string | null; coverPreset?: string | null }): { src: string; tone: CoverTone } | null {
  if (profile.coverImageUrl) return { src: profile.coverImageUrl, tone: "dark" };
  const chosen = coverPresetById(profile.coverPreset);
  return chosen ? { src: chosen.src, tone: chosen.tone } : null;
}
