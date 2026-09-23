import comuniRaw from "./comuni.json";

export type Comune = {
  name: string;
  province: string;
  region: string;
  lat: number;
  lon: number;
  capoluogo: boolean;
};

/**
 * Elenco completo dei comuni italiani (ISTAT, ~7900 voci) con coordinate
 * reali, non solo i capoluoghi di provincia — usato per l'autocomplete del
 * campo "Città" in ricerca e per geolocalizzare il comune scelto dal
 * professionista in fase di registrazione profilo.
 */
export const ITALIAN_COMUNI: Comune[] = comuniRaw as Comune[];

const comuniByName = new Map(ITALIAN_COMUNI.map((c) => [c.name.toLowerCase(), c]));

export function findComuneByName(name: string): Comune | undefined {
  return comuniByName.get(name.trim().toLowerCase());
}

/** Nomi di tutti i comuni, per popolare autocomplete testuali semplici. */
export const ALL_ITALIAN_CITY_NAMES: string[] = ITALIAN_COMUNI.map((c) => c.name);

/**
 * Slug URL di un comune ("Reggio nell'Emilia" → "reggio-nell-emilia"), per le
 * pagine indicizzabili categoria+città `/cerca/[categoria]/[citta]`
 * (docs/CHANGELOG.md §132, SEO locale — CLAUDE.md §7.6). Unico per comune:
 * l'unico caso ISTAT di slug uguale (Paterno PZ / Paternò CT) riceve la
 * sigla di provincia in coda ("paterno-ct").
 */
function baseSlug(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

let slugIndex: { bySlug: Map<string, Comune>; byName: Map<string, string> } | null = null;

function getSlugIndex() {
  if (!slugIndex) {
    const bySlug = new Map<string, Comune>();
    const byName = new Map<string, string>();
    for (const comune of ITALIAN_COMUNI) {
      let slug = baseSlug(comune.name);
      if (bySlug.has(slug)) slug = `${slug}-${comune.province.toLowerCase()}`;
      bySlug.set(slug, comune);
      byName.set(comune.name.toLowerCase(), slug);
    }
    slugIndex = { bySlug, byName };
  }
  return slugIndex;
}

/** Slug del comune, o `undefined` se il nome non è un comune italiano. */
export function comuneSlug(name: string): string | undefined {
  return getSlugIndex().byName.get(name.trim().toLowerCase());
}

export function findComuneBySlug(slug: string): Comune | undefined {
  return getSlugIndex().bySlug.get(slug);
}
