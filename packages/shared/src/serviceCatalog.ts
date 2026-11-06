import { POPULAR_SERVICES, PROFESSIONAL_CATEGORIES, type ProfessionalCategorySlug } from "./categories";
import { serviceNameKey } from "./serviceNames";

/**
 * Catalogo dei servizi del sito per l'intelligenza artificiale della ricerca
 * per problema (docs/changelog/2026-11-06-ia-conosce-i-servizi.md, richiesta
 * di Luca): per ogni mestiere le prestazioni suggerite, quelle messe tra le
 * standard in Admin e quelle scritte a mano dai professionisti visibili nella
 * ricerca. Si costruisce dagli stessi elenchi di iscrizione, profilo e
 * "Quanto costa", così un mestiere o una prestazione nuova entra da sola.
 */

export type ServiceCatalogEntry = {
  slug: ProfessionalCategorySlug;
  label: string;
  services: string[];
};

/** Prestazioni scritte a mano mandate all'IA per ogni mestiere, le più usate: oltre la risposta rallenta. */
export const CATALOG_HAND_WRITTEN_MAX = 40;

/**
 * `standard` e `handWritten` sono per slug; `handWritten` già in ordine,
 * dalla più usata. I doppioni (stesso nome scritto in un altro modo) restano
 * una volta sola, con il nome che arriva per primo: suggerite, standard, a mano.
 */
export function buildServiceCatalog({
  standard = {},
  handWritten = {},
}: {
  standard?: Partial<Record<string, readonly string[]>>;
  handWritten?: Partial<Record<string, readonly string[]>>;
}): ServiceCatalogEntry[] {
  return PROFESSIONAL_CATEGORIES.map((category) => {
    const seen = new Set<string>();
    const services: string[] = [];
    const add = (name: string): boolean => {
      const key = serviceNameKey(name);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      services.push(name.trim().replace(/\s+/g, " "));
      return true;
    };
    POPULAR_SERVICES[category.slug].forEach(add);
    (standard[category.slug] ?? []).forEach(add);
    // Il tetto conta solo i nomi nuovi: una suggerita riscritta a mano non toglie posto.
    let added = 0;
    for (const name of handWritten[category.slug] ?? []) {
      if (added >= CATALOG_HAND_WRITTEN_MAX) break;
      if (add(name)) added += 1;
    }
    return { slug: category.slug, label: category.label, services };
  });
}

/** Il catalogo come testo da leggere per l'IA: una riga per mestiere. */
export function serviceCatalogText(catalog: readonly ServiceCatalogEntry[]): string {
  return catalog.map((entry) => `- ${entry.slug} (${entry.label}): ${entry.services.join("; ")}`).join("\n");
}

/**
 * La prestazione scelta dall'IA, solo se è davvero nel catalogo di uno dei
 * mestieri proposti, con il nome scritto come nel catalogo; altrimenti null.
 */
export function catalogServiceFor(
  catalog: readonly ServiceCatalogEntry[],
  categories: readonly string[],
  name: string | null | undefined,
): string | null {
  const key = name ? serviceNameKey(name) : "";
  if (!key) return null;
  for (const slug of categories) {
    const found = catalog.find((entry) => entry.slug === slug)?.services.find((service) => serviceNameKey(service) === key);
    if (found) return found;
  }
  return null;
}
