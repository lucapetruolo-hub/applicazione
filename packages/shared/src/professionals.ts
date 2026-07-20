import type { ProfessionalCategorySlug } from "./categories";

export type PlaceholderProfessional = {
  businessName: string;
  categorySlug: ProfessionalCategorySlug;
  categoryLabel: string;
  city: string;
  rating: number;
  verified: boolean;
};

/**
 * Profili di esempio, usati nella home e nell'autocomplete di ricerca finché
 * la piattaforma non ha professionisti reali (CLAUDE.md §9). Da sostituire
 * con una vera ricerca su `apps/api` quando esisteranno profili reali.
 */
/** Risultato reale restituito da GET /professionals/search su apps/api. */
export type ProfessionalSearchResult = {
  id: string;
  businessName: string;
  categorySlug: ProfessionalCategorySlug;
  categoryLabel: string;
  city: string;
  verified: boolean;
  rating: number | null;
  reviewCount: number;
  boosted: boolean;
};

/** Dettaglio profilo, restituito da GET /professionals/:id per la pagina pubblica. */
export type ProfessionalDetail = ProfessionalSearchResult & {
  bio: string | null;
  subTags: string[];
  reviews: { id: string; rating: number; comment: string | null; createdAt: string }[];
};

export const PLACEHOLDER_PROFESSIONALS: PlaceholderProfessional[] = [
  { businessName: "Rossi Impianti", categorySlug: "elettricista", categoryLabel: "Elettricista", city: "Latina", rating: 4.8, verified: true },
  { businessName: "Bianchi Idraulica", categorySlug: "idraulico", categoryLabel: "Idraulico", city: "Roma", rating: 4.6, verified: true },
  { businessName: "Verdi Pulizie", categorySlug: "pulizie", categoryLabel: "Pulizie", city: "Napoli", rating: 4.9, verified: false },
  { businessName: "Colombo Ristrutturazioni", categorySlug: "muratore", categoryLabel: "Muratore e ristrutturazioni", city: "Milano", rating: 4.7, verified: true },
  { businessName: "Ferrari Elettricità", categorySlug: "elettricista", categoryLabel: "Elettricista", city: "Torino", rating: 4.5, verified: true },
  { businessName: "Romano Giardini", categorySlug: "giardiniere", categoryLabel: "Giardiniere", city: "Bologna", rating: 4.7, verified: false },
  { businessName: "Ricci Traslochi", categorySlug: "traslochi", categoryLabel: "Traslochi", city: "Firenze", rating: 4.4, verified: true },
  { businessName: "Marino Serrature", categorySlug: "fabbro", categoryLabel: "Fabbro", city: "Genova", rating: 4.6, verified: true },
  { businessName: "Greco Climatizzazione", categorySlug: "climatizzazione", categoryLabel: "Climatizzazione e caldaie", city: "Bari", rating: 4.8, verified: true },
  { businessName: "Costa Falegnameria", categorySlug: "falegname", categoryLabel: "Falegname", city: "Verona", rating: 4.9, verified: false },
];
