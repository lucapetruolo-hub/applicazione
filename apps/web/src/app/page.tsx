import type { Metadata } from "next";
import { BRAND, type ProfessionalSearchResult } from "@professionisti/shared";
import { apiClient } from "../lib/apiClient";
import { SITE_URL } from "@/lib/siteUrl";
import { JsonLd } from "@/components/JsonLd";
import HomeContent from "./HomeContent";

// Server-rendered ad ogni richiesta: stesso motivo di /cerca/[categoria],
// niente finestra di cache in cui un professionista eliminato resterebbe
// visibile nella vetrina "Professionisti su Professionisti".
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
  // Con il nome del sito, come le altre pagine (collaudo N-11).
  title: { absolute: `${BRAND.tagline} | ${BRAND.name}` },
};

// Nome e logo del sito per Google, che li mostra nei risultati (collaudo
// N-10, docs/changelog/2026-10-30-velocita-telefono.md).
const siteJsonLd = [
  { "@context": "https://schema.org", "@type": "WebSite", name: BRAND.name, url: SITE_URL, inLanguage: "it-IT" },
  { "@context": "https://schema.org", "@type": "Organization", name: BRAND.name, url: SITE_URL, logo: `${SITE_URL}/icon-512.png` },
];

export default async function HomePage() {
  // Le due richieste insieme, non una dopo l'altra (collaudo N-01/N-02).
  const [professionals, platformStats] = await Promise.all([
    // excludeDemo: la home dichiara esplicitamente di mostrare conteggi e
    // professionisti reali (redesign "Scheda Intervento" §4.3/§4.6) — i
    // profili del seed (PLACEHOLDER_PROFESSIONALS) non devono contribuire
    // né ai conteggi per categoria né alla vetrina in evidenza.
    apiClient.searchProfessionals({ excludeDemo: true }).catch((): ProfessionalSearchResult[] => []),
    // Numeri reali per la striscia "social proof" (richiesta esplicita
    // dell'utente) — se l'API non risponde, la striscia semplicemente non
    // compare invece di mostrare uno zero fuorviante (vedi PlatformStats).
    apiClient.platformStats().catch(() => null),
  ]);

  return (
    <>
      <JsonLd data={siteJsonLd} />
      <HomeContent professionals={professionals} platformStats={platformStats} />
    </>
  );
}
