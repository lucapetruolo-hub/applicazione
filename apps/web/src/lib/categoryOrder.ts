import { PROFESSIONAL_CATEGORIES, type ProfessionalCategorySlug } from "@professionisti/shared";
import { apiClient } from "@/lib/apiClient";

/*
 * Ordine dei più cercati per le tessere delle categorie (docs/CHANGELOG.md
 * §324), in un modulo a parte e leggero: `SiteHeader` lo chiede in anticipo
 * senza portarsi dietro le icone di `CategoryTiles` in ogni pagina.
 */

export type PopularOrder = ProfessionalCategorySlug[] | null;

/**
 * Su cosa si basa l'ordine: "searches" i lavori più cercati (richiesta di
 * preventivo, §280), "professionals" quelli con più professionisti iscritti
 * e visibili (scelta dei lavori del professionista, richiesta di Luca,
 * docs/changelog/2026-11-02-categorie-telefono.md).
 */
export type CategoryOrderBy = "searches" | "professionals";

/**
 * Ordine dei più cercati, chiesto una volta sola per città durante la visita:
 * riaprendo il modulo le tessere compaiono subito, già in ordine.
 */
const popularOrderCache = new Map<string, { promise: Promise<PopularOrder>; value?: PopularOrder }>();

function cacheKey(city: string | undefined, orderBy: CategoryOrderBy): string {
  // L'ordine per iscritti non dipende dalla città.
  return orderBy === "professionals" ? "#professionals" : (city?.trim().toLowerCase() ?? "");
}

function sortByCounts(counts: { slug: string; count: number }[]): PopularOrder {
  if (counts.length === 0) return null;
  const bySlug = new Map(counts.map((item) => [item.slug, item.count]));
  // sort è stabile: a parità resta l'ordine del catalogo.
  return [...PROFESSIONAL_CATEGORIES].sort((a, b) => (bySlug.get(b.slug) ?? 0) - (bySlug.get(a.slug) ?? 0)).map((category) => category.slug);
}

export function loadPopularOrder(city?: string, orderBy: CategoryOrderBy = "searches") {
  const key = cacheKey(city, orderBy);
  let entry = popularOrderCache.get(key);
  if (!entry) {
    const created: { promise: Promise<PopularOrder>; value?: PopularOrder } = {
      promise: (orderBy === "professionals"
        ? apiClient.getCategoryProfessionalCounts()
        : apiClient.getCategoryPopularity(city?.trim() || undefined).then(({ counts }) => counts)
      )
        .then(sortByCounts)
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
export function prefetchCategoryOrder(city?: string, orderBy: CategoryOrderBy = "searches"): void {
  void loadPopularOrder(city, orderBy);
}

/** Ordine già arrivato per questa città, o `undefined` se non ancora. */
export function cachedPopularOrder(city?: string, orderBy: CategoryOrderBy = "searches"): PopularOrder | undefined {
  return popularOrderCache.get(cacheKey(city, orderBy))?.value;
}
