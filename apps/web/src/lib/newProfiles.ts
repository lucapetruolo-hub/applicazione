import type { ProfessionalSearchResult } from "@professionisti/shared";

/**
 * "Nuovi profili" della home (NewProfilesCarousel): gli ultimi 21 iscritti,
 * con i soli dati che la scheda mostra. Scelti sul server: prima la home
 * mandava al browser tutti i professionisti con le disponibilità dei
 * prossimi giorni (127 KB per 7 profili di prova, e sarebbero cresciuti con
 * ogni iscritto) solo per mostrarne nome, mestiere, città e foto
 * (docs/changelog/2026-11-09-meno-javascript-comune.md).
 */
export const NEW_PROFILES_COUNT = 21;

export type NewProfileSummary = Pick<
  ProfessionalSearchResult,
  "id" | "businessName" | "categorySlug" | "categoryLabel" | "city" | "createdAt" | "imageUrl" | "rating" | "verified"
>;

export function newestProfiles(professionals: ProfessionalSearchResult[]): NewProfileSummary[] {
  return [...professionals]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, NEW_PROFILES_COUNT)
    .map(({ id, businessName, categorySlug, categoryLabel, city, createdAt, imageUrl, rating, verified }) => ({
      id,
      businessName,
      categorySlug,
      categoryLabel,
      city,
      createdAt,
      imageUrl,
      rating,
      verified,
    }));
}
