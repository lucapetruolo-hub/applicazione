import type { MetadataRoute } from "next";
import { PROFESSIONAL_CATEGORIES } from "@professionisti/shared";
import { apiClient } from "@/lib/apiClient";
import { SITE_URL } from "@/lib/siteUrl";

/**
 * Fase 6 (SEO): pagine statiche (home, ricerca, categorie, per-professionisti)
 * più una voce per ogni professionista reale (`excludeDemo: true`, stessa
 * regola già applicata altrove per non pubblicizzare dati del seed come
 * reali — vedi `isDemo`/Fase 4). Se l'API non risponde, il sitemap resta
 * comunque valido con le sole pagine statiche invece di far fallire l'intera
 * route: un sitemap parziale è meglio di nessun sitemap.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticEntries: MetadataRoute.Sitemap = [
    { url: SITE_URL, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/cerca`, changeFrequency: "daily", priority: 0.8 },
    { url: `${SITE_URL}/per-professionisti`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/faq`, changeFrequency: "monthly", priority: 0.4 },
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
    return [...staticEntries, ...professionalEntries];
  } catch {
    return staticEntries;
  }
}
