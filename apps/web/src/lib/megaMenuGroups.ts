import { PROFESSIONAL_CATEGORIES, type ProfessionalCategorySlug } from "@professionisti/shared";

export type MegaMenuGroup = {
  title: string;
  slugs: ProfessionalCategorySlug[];
};

// Raggruppamento dei 13 mestieri in 3 colonne tematiche per il mega-menu
// "Servizi" dell'header (brief redesign §4.1) — unica fonte di verità,
// letta anche dal drawer mobile così i due non divergono.
export const MEGA_MENU_GROUPS: MegaMenuGroup[] = [
  { title: "Casa e impianti", slugs: ["idraulico", "elettricista", "climatizzazione", "fabbro"] },
  {
    title: "Manutenzione e spazi",
    slugs: ["imbianchino", "pulizie", "giardiniere", "muratore", "falegname", "traslochi", "tuttofare"],
  },
  { title: "Persona e servizi", slugs: ["oss", "badanti"] },
];

export const MEGA_MENU_MICRO_DESCRIPTION: Record<ProfessionalCategorySlug, string> = {
  idraulico: "Perdite, caldaie, impianti sanitari",
  elettricista: "Impianti civili e domotica",
  imbianchino: "Tinteggiature interni ed esterni",
  pulizie: "Casa, ufficio, fine cantiere",
  giardiniere: "Manutenzione e progettazione giardini",
  traslochi: "Locali e lunga distanza",
  fabbro: "Serrature, cancelli, aperture porte",
  climatizzazione: "Installazione e manutenzione caldaie",
  muratore: "Ristrutturazioni e opere murarie",
  falegname: "Mobili su misura, infissi",
  tuttofare: "Piccole riparazioni e montaggi",
  oss: "Assistenza domiciliare e ospedaliera",
  badanti: "Compagnia e assistenza anziani",
};

export function categoryBySlug(slug: ProfessionalCategorySlug) {
  return PROFESSIONAL_CATEGORIES.find((c) => c.slug === slug)!;
}
