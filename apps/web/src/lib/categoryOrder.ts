import { PROFESSIONAL_CATEGORIES, type ProfessionalCategorySlug } from "@professionisti/shared";
import { apiClient } from "@/lib/apiClient";

/*
 * Ordine dei più cercati per le tessere delle categorie (docs/CHANGELOG.md
 * §319), in un modulo a parte e leggero: `SiteHeader` lo chiede in anticipo
 * senza portarsi dietro le icone di `CategoryTiles` in ogni pagina.
 */

export type PopularOrder = ProfessionalCategorySlug[] | null;

/**
 * Ordine dei più cercati, chiesto una volta sola per città durante la visita:
 * riaprendo il modulo le tessere compaiono subito, già in ordine.
 */
const popularOrderCache = new Map<string, { promise: Promise<PopularOrder>; value?: PopularOrder }>();

function cacheKey(city?: string): string {
  return city?.trim().toLowerCase() ?? "";
}

export function loadPopularOrder(city?: string) {
  const key = cacheKey(city);
  let entry = popularOrderCache.get(key);
  if (!entry) {
    const created: { promise: Promise<PopularOrder>; value?: PopularOrder } = {
      promise: apiClient
        .getCategoryPopularity(city?.trim() || undefined)
        .then(({ counts }): PopularOrder => {
          if (counts.length === 0) return null;
          const bySlug = new Map(counts.map((item) => [item.slug, item.count]));
          return [...PROFESSIONAL_CATEGORIES].sort((a, b) => (bySlug.get(b.slug) ?? 0) - (bySlug.get(a.slug) ?? 0)).map((category) => category.slug);
        })
        .catch(() => {
          // Un errore non resta in memoria: alla prossima apertura si riprova.
          popularOrderCache.delete(key);
          return null;
        })
        .then((order) => {
          created.value = order;
          return order;
        }),
    };
    entry = created;
    popularOrderCache.set(key, entry);
  }
  return entry;
}

/** Da chiamare appena si sa che le tessere stanno per comparire (es. all'apertura della pagina). */
export function prefetchCategoryOrder(city?: string): void {
  void loadPopularOrder(city);
}

/** Ordine già arrivato per questa città, o `undefined` se non ancora. */
export function cachedPopularOrder(city?: string): PopularOrder | undefined {
  return popularOrderCache.get(cacheKey(city))?.value;
}
