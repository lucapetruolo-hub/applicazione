import type { MetadataRoute } from "next";
import { PROFESSIONAL_CATEGORIES, comuneSlug } from "@professionisti/shared";
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
    { url: `${SITE_URL}/faq`, changeFrequency: "monthly", priority: 0.4 },
    { url: `${SITE_URL}/contatti`, changeFrequency: "monthly", priority: 0.4 },
    ...PROFESSIONAL_CATEGORIES.map((category) => ({
      url: `${SITE_URL}/cerca/${category.slug}`,
      changeFrequency: "daily" as const,
      priority: 0.8,
    })),
  ];

  try {
    const professionals = await apiClient.searchProfessionals({ excludeDemo: true });
    const professionalEntries: MetadataRoute.Sitemap = professionals.map((pro) => ({
      url: `${SITE_URL}/professionista/${pro.id}`,
      changeFrequency: "weekly",
      priority: 0.6,
    }));
    // Pagine categoria+città (docs/CHANGELOG.md §132) solo dove esiste
    // almeno un professionista reale: niente pagine vuote proposte a Google.
    const cityPaths = new Set<string>();
    for (const pro of professionals) {
      const citySlug = comuneSlug(pro.city);
      if (citySlug) cityPaths.add(`/cerca/${pro.categorySlug}/${citySlug}`);
    }
    const cityEntries: MetadataRoute.Sitemap = [...cityPaths].map((path) => ({
      url: `${SITE_URL}${path}`,
      changeFrequency: "daily",
      priority: 0.7,
    }));
    return [...staticEntries, ...cityEntries, ...professionalEntries];
  } catch {
    return staticEntries;
  }
}
