import { PROFESSIONAL_CATEGORIES, type ProfessionalCategorySlug } from "@professionisti/shared";

export type MegaMenuGroup = {
  title: string;
  slugs: ProfessionalCategorySlug[];
};

// Raggruppamento dei 13 mestieri in 3 colonne tematiche per il mega-menu
// "Servizi" dell'header (brief redesign §4.1) — unica fonte di verità,
// letta anche dal drawer mobile così i due non divergono. Colonne
// ribilanciate (5/4/4) quando Dogsitter e Babysitter hanno preso il posto
// di OSS e Badanti (docs/CHANGELOG.md §214).
export const MEGA_MENU_GROUPS: MegaMenuGroup[] = [
  { title: "Casa e impianti", slugs: ["idraulico", "elettricista", "climatizzazione", "fabbro", "falegname"] },
  { title: "Lavori e manutenzione", slugs: ["imbianchino", "muratore", "giardiniere", "tuttofare"] },
  { title: "Casa e famiglia", slugs: ["pulizie", "traslochi", "babysitter", "dogsitter"] },
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
  dogsitter: "Passeggiate e cura del tuo cane",
  babysitter: "Bambini a casa, serate e dopo scuola",
};

export function categoryBySlug(slug: ProfessionalCategorySlug) {
  return PROFESSIONAL_CATEGORIES.find((c) => c.slug === slug)!;
}
