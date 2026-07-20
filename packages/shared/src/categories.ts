/**
 * Categorie professionisti MVP e relativi sotto-tag di specializzazione.
 * Fonte di verità: CLAUDE.md §6. Ogni nuova categoria va aggiunta qui prima,
 * poi propagata allo schema Prisma (packages/database) e ai client.
 */

export const PROFESSIONAL_CATEGORIES = [
  {
    slug: "idraulico",
    label: "Idraulico",
    icon: "🔧",
    subTags: ["riparazioni-urgenti", "caldaie", "impianti-sanitari"],
  },
  {
    slug: "elettricista",
    label: "Elettricista",
    icon: "💡",
    subTags: ["impianti-civili", "domotica", "certificazioni"],
  },
  {
    slug: "imbianchino",
    label: "Imbianchino",
    icon: "🎨",
    subTags: ["interni", "esterni", "decorazioni"],
  },
  {
    slug: "pulizie",
    label: "Pulizie",
    icon: "🧹",
    subTags: ["casa", "ufficio", "fine-cantiere"],
  },
  {
    slug: "giardiniere",
    label: "Giardiniere",
    icon: "🌿",
    subTags: ["manutenzione", "potatura", "progettazione"],
  },
  {
    slug: "traslochi",
    label: "Traslochi",
    icon: "📦",
    subTags: ["locali", "lunga-distanza", "smontaggio-mobili"],
  },
  {
    slug: "fabbro",
    label: "Fabbro",
    icon: "🔑",
    subTags: ["apertura-porte", "serrature", "cancelli"],
  },
  {
    slug: "climatizzazione",
    label: "Climatizzazione e caldaie",
    icon: "❄️",
    subTags: ["installazione", "manutenzione", "assistenza"],
  },
  {
    slug: "muratore",
    label: "Muratore e ristrutturazioni",
    icon: "🧱",
    subTags: ["ristrutturazioni", "opere-murarie", "cartongesso"],
  },
  {
    slug: "falegname",
    label: "Falegname",
    icon: "🪚",
    subTags: ["mobili-su-misura", "riparazioni", "infissi"],
  },
] as const;

export type ProfessionalCategorySlug = (typeof PROFESSIONAL_CATEGORIES)[number]["slug"];

export function isProfessionalCategorySlug(value: string): value is ProfessionalCategorySlug {
  return PROFESSIONAL_CATEGORIES.some((category) => category.slug === value);
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(new RegExp("[\\u0300-\\u036f]", "g"), "")
    .trim();
}

/** Trova la categoria più vicina a un testo libero digitato nella search bar. */
export function findCategoryByQuery(query: string) {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return undefined;

  return PROFESSIONAL_CATEGORIES.find((category) => {
    if (normalize(category.slug).includes(normalizedQuery)) return true;
    if (normalize(category.label).includes(normalizedQuery)) return true;
    return category.subTags.some((tag) => normalize(tag).includes(normalizedQuery));
  });
}
