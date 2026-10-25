import { COMUNI_DATA, REGION_BY_PROVINCE } from "./comuniCompatti";

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
// Letti da una stringa compatta e non da un JSON di ~8000 oggetti: l'elenco
// finisce nel JavaScript di ogni pagina del sito e su un telefono lento il
// suo peso bloccava la pagina (docs/CHANGELOG.md §320). Gli oggetti si
// creano solo al primo uso, non all'apertura di ogni pagina: l'agenda e le
// altre pagine che non cercano comuni non pagano più quel lavoro (§343).
let comuni: Comune[] | null = null;
let comuniByName: Map<string, Comune> | null = null;
let cityNames: string[] | null = null;

/** Elenco completo dei comuni, creato al primo uso. */
export function italianComuni(): Comune[] {
  if (!comuni) {
    comuni = COMUNI_DATA.split("\n").map((line) => {
      const [name = "", province = "", lat = "0", lon = "0", capoluogo] = line.split("|");
      return { name, province, region: REGION_BY_PROVINCE[province] ?? "", lat: Number(lat), lon: Number(lon), capoluogo: capoluogo === "1" };
    });
  }
  return comuni;
}

export function findComuneByName(name: string): Comune | undefined {
  comuniByName ??= new Map(italianComuni().map((c) => [c.name.toLowerCase(), c]));
  return comuniByName.get(name.trim().toLowerCase());
}

/** Nomi di tutti i comuni, per popolare autocomplete testuali semplici. */
export function allItalianCityNames(): string[] {
  cityNames ??= italianComuni().map((c) => c.name);
  return cityNames;
}

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
    for (const comune of italianComuni()) {
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
