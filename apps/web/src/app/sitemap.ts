import type { MetadataRoute } from "next";
import { MIN_PROFESSIONALS_TO_INDEX_CITY, PROFESSIONAL_CATEGORIES, categorySubTags, comuneSlug, hasCategoryPrices, professionalPath } from "@professionisti/shared";
import { apiClient } from "@/lib/apiClient";
import { SITE_URL } from "@/lib/siteUrl";
import { SITE_INDEXABLE } from "@/lib/siteIndexing";

/**
 * Fase 6 (SEO): pagine statiche (home, ricerca, categorie, per-professionisti)
 * più una voce per ogni professionista reale (`excludeDemo: true`, stessa
 * regola già applicata altrove per non pubblicizzare dati del seed come
 * reali — vedi `isDemo`/Fase 4). Se l'API non risponde, il sitemap resta
 * comunque valido con le sole pagine statiche invece di far fallire l'intera
 * route: un sitemap parziale è meglio di nessun sitemap.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Sito privato (lib/siteIndexing.ts): nessuna pagina da segnalare.
  if (!SITE_INDEXABLE) return [];

  const staticEntries: MetadataRoute.Sitemap = [
    { url: SITE_URL, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/cerca`, changeFrequency: "daily", priority: 0.8 },
    { url: `${SITE_URL}/per-professionisti`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/per-professionisti/pagamenti`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${SITE_URL}/faq`, changeFrequency: "monthly", priority: 0.4 },
    { url: `${SITE_URL}/problemi-e-rimborsi`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${SITE_URL}/sicurezza`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${SITE_URL}/contatti`, changeFrequency: "monthly", priority: 0.4 },
    // "Lavora con noi" per ogni lavoro (docs/CHANGELOG.md §296).
    ...PROFESSIONAL_CATEGORIES.map((category) => ({
      url: `${SITE_URL}/lavora-con-noi/${category.slug}`,
      changeFrequency: "monthly" as const,
      priority: 0.4,
    })),
  ];
  const categoryEntries = (slugs: string[]): MetadataRoute.Sitemap =>
    slugs.map((slug) => ({ url: `${SITE_URL}/cerca/${slug}`, changeFrequency: "daily", priority: 0.8 }));

  try {
    const professionals = await apiClient.searchProfessionals({ excludeDemo: true });
    const professionalEntries: MetadataRoute.Sitemap = professionals.map((pro) => ({
      url: `${SITE_URL}${professionalPath(pro)}`,
      changeFrequency: "weekly",
      priority: 0.6,
    }));
    // Pagine categoria+città (docs/CHANGELOG.md §132) solo da
    // MIN_PROFESSIONALS_TO_INDEX_CITY professionisti veri in su (§296): niente
    // pagine quasi vuote proposte a Google. Stessa soglia del noindex della pagina.
    const cityCounts = new Map<string, number>();
    // Categoria e città di ogni pagina città, per le pagine "Quanto costa" della città.
    const cityPages = new Map<string, { slug: string; city: string }>();
    for (const pro of professionals) {
      const citySlug = comuneSlug(pro.city);
      if (!citySlug) continue;
      for (const category of pro.categories) {
        const path = `/cerca/${category.slug}/${citySlug}`;
        cityCounts.set(path, (cityCounts.get(path) ?? 0) + 1);
        cityPages.set(path, { slug: category.slug, city: pro.city });
        // Pagine per servizio (§296), con la stessa soglia delle pagine città.
        for (const tag of pro.subTags) {
          if (!categorySubTags(category.slug).includes(tag)) continue;
          cityCounts.set(`${path}/${tag}`, (cityCounts.get(`${path}/${tag}`) ?? 0) + 1);
        }
      }
    }
    const cityPaths = [...cityCounts].filter(([, count]) => count >= MIN_PROFESSIONALS_TO_INDEX_CITY).map(([path]) => path);
    const cityEntries: MetadataRoute.Sitemap = cityPaths.map((path) => ({
      url: `${SITE_URL}${path}`,
      changeFrequency: "daily",
      priority: 0.7,
    }));
    // Categorie in tutta Italia solo con almeno un professionista vero, come il noindex della pagina (§296).
    const withProfessionals = new Set(professionals.flatMap((pro) => pro.categories.map((category) => category.slug)));
    const categories = categoryEntries(PROFESSIONAL_CATEGORIES.map((category) => category.slug).filter((slug) => withProfessionals.has(slug)));
    // Pagine "Quanto costa" solo quando hanno prezzi veri (§296): l'API dice
    // se si è sopra le soglie, altrimenti la pagina è un 404.
    // Le pagine della città solo per le pagine città già in sitemap.
    const priceCandidates = [
      ...PROFESSIONAL_CATEGORIES.map(({ slug }) => ({ slug, city: undefined as string | undefined, path: `/prezzi/${slug}` })),
      ...cityPaths.flatMap((path) => {
        const page = cityPages.get(path);
        return page ? [{ slug: page.slug, city: page.city, path: `/prezzi/${page.slug}/${comuneSlug(page.city)}` }] : [];
      }),
    ];
    const pricePaths = await Promise.all(
      priceCandidates.map(async ({ slug, city, path }) => {
        try {
          return hasCategoryPrices(await apiClient.getCategoryPrices(slug, city)) ? path : null;
        } catch {
          return null;
        }
      }),
    );
    const priceEntries: MetadataRoute.Sitemap = pricePaths
      .filter((path): path is string => path !== null)
      .map((path) => ({ url: `${SITE_URL}${path}`, changeFrequency: "weekly", priority: 0.6 }));
    return [...staticEntries, ...categories, ...cityEntries, ...priceEntries, ...professionalEntries];
  } catch {
    // API ferma: sitemap con le pagine fisse e tutte le categorie, meglio di nessuna.
    return [...staticEntries, ...categoryEntries(PROFESSIONAL_CATEGORIES.map((category) => category.slug))];
  }
}
