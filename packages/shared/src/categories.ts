/**
 * Categorie professionisti MVP e relativi sotto-tag di specializzazione.
 * Fonte di verità: CLAUDE.md §6. Ogni nuova categoria va aggiunta qui prima,
 * poi propagata allo schema Prisma (packages/database) e ai client.
 */

export const PROFESSIONAL_CATEGORIES = [
  {
    slug: "idraulico",
    label: "Idraulico",
    subTags: ["riparazioni-urgenti", "caldaie", "impianti-sanitari"],
  },
  {
    slug: "elettricista",
    label: "Elettricista",
    subTags: ["impianti-civili", "domotica", "certificazioni"],
  },
  {
    slug: "imbianchino",
    label: "Imbianchino",
    subTags: ["interni", "esterni", "decorazioni"],
  },
  {
    slug: "pulizie",
    label: "Pulizie",
    subTags: ["casa", "ufficio", "fine-cantiere"],
  },
  {
    slug: "giardiniere",
    label: "Giardiniere",
    subTags: ["manutenzione", "potatura", "progettazione"],
  },
  {
    slug: "traslochi",
    label: "Traslochi",
    subTags: ["locali", "lunga-distanza", "smontaggio-mobili"],
  },
  {
    slug: "fabbro",
    label: "Fabbro",
    subTags: ["apertura-porte", "serrature", "cancelli"],
  },
  {
    slug: "climatizzazione",
    label: "Climatizzazione e caldaie",
    subTags: ["installazione", "manutenzione", "assistenza"],
  },
  {
    slug: "muratore",
    label: "Muratore e ristrutturazioni",
    subTags: ["ristrutturazioni", "opere-murarie", "cartongesso"],
  },
  {
    slug: "falegname",
    label: "Falegname",
    subTags: ["mobili-su-misura", "riparazioni", "infissi"],
  },
] as const;

export type ProfessionalCategorySlug = (typeof PROFESSIONAL_CATEGORIES)[number]["slug"];

export function isProfessionalCategorySlug(value: string): value is ProfessionalCategorySlug {
  return PROFESSIONAL_CATEGORIES.some((category) => category.slug === value);
}
