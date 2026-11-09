import type { Metadata } from "next";
import { cookies } from "next/headers";
import { BRAND, type ProfessionalCategorySlug, type ProfessionalSearchResult } from "@professionisti/shared";
import { apiClient } from "../lib/apiClient";
import { LAST_SEARCH_CITY_COOKIE } from "../lib/lastSearchCity";
import { SITE_URL } from "@/lib/siteUrl";
import { JsonLd } from "@/components/JsonLd";
import { newestProfiles } from "@/lib/newProfiles";
import HomeContent from "./HomeContent";
import { openGraphFor } from "@/lib/openGraph";

// Server-rendered ad ogni richiesta: stesso motivo di /cerca/[categoria],
// niente finestra di cache in cui un professionista eliminato resterebbe
// visibile nella vetrina "Professionisti su Professionisti".
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
  openGraph: openGraphFor("/"),
  // Con il nome del sito, come le altre pagine (collaudo N-11).
  title: { absolute: `${BRAND.tagline} | ${BRAND.name}` },
};

// Nome e logo del sito per Google, che li mostra nei risultati (collaudo
// N-10, docs/changelog/2026-10-30-velocita-telefono.md).
const siteJsonLd = [
  { "@context": "https://schema.org", "@type": "WebSite", name: BRAND.name, url: SITE_URL, inLanguage: "it-IT" },
  { "@context": "https://schema.org", "@type": "Organization", name: BRAND.name, url: SITE_URL, logo: `${SITE_URL}/icon-512.png` },
];

/**
 * Ordine delle categorie (docs/changelog/2026-11-02-categorie-telefono.md):
 * prima quelle con più professionisti vicino all'ultima città cercata su
 * questo browser, se c'è, altrimenti in tutta Italia. Letto qui dal server,
 * così le schede arrivano già in ordine. Se l'API non risponde, l'ordine
 * fisso del catalogo.
 */
async function loadCategoryCounts(): Promise<Partial<Record<ProfessionalCategorySlug, number>>> {
  const raw = (await cookies()).get(LAST_SEARCH_CITY_COOKIE)?.value;
  let city: string | undefined;
  try {
    city = raw ? decodeURIComponent(raw).trim().slice(0, 80) || undefined : undefined;
  } catch {
    city = undefined;
  }
  try {
    const { counts } = await apiClient.getCategoryProfessionalCounts(city);
    return Object.fromEntries(counts.map((item) => [item.slug, item.count]));
  } catch {
    return {};
  }
}

export default async function HomePage() {
  // Le richieste insieme, non una dopo l'altra (collaudo N-01/N-02).
  const [professionals, platformStats, priceIndex, categoryCounts, problemExamples, popularJobs] = await Promise.all([
    // excludeDemo: la home dichiara esplicitamente di mostrare conteggi e
    // professionisti reali (redesign "Scheda Intervento" §4.3/§4.6) — i
    // profili del seed (PLACEHOLDER_PROFESSIONALS) non devono contribuire
    // né ai conteggi per categoria né alla vetrina in evidenza.
    apiClient.searchProfessionals({ excludeDemo: true }).catch((): ProfessionalSearchResult[] => []),
    // Numeri reali per la striscia "social proof" (richiesta esplicita
    // dell'utente) — se l'API non risponde, la striscia semplicemente non
    // compare invece di mostrare uno zero fuorviante (vedi PlatformStats).
    apiClient.platformStats().catch(() => null),
    // Prezzi del "Quanto costa in media" già nella pagina (collaudo N-06).
    apiClient.getServicePriceIndex().catch(() => null),
    loadCategoryCounts(),
    // Frasi d'esempio sotto la ricerca, già in ordine (docs/changelog/2026-11-03-luci-che-accelerano.md).
    apiClient.getProblemExamples().catch(() => null),
    // "Lavori più cercati" sotto le categorie (docs/changelog/2026-11-07-lavori-piu-cercati-home.md).
    apiClient.getPopularJobs().catch(() => null),
  ]);

  return (
    <>
      {siteJsonLd.map((data) => (
        <JsonLd key={data["@type"]} data={data} />
      ))}
      <HomeContent professionals={newestProfiles(professionals)} platformStats={platformStats} priceIndex={priceIndex} categoryCounts={categoryCounts} problemExamples={problemExamples} popularJobs={popularJobs} />
    </>
  );
}
