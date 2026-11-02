import type { Metadata } from "next";
import { cookies } from "next/headers";
import type { ProfessionalCategorySlug, ProfessionalSearchResult } from "@professionisti/shared";
import { apiClient } from "../lib/apiClient";
import { LAST_SEARCH_CITY_COOKIE } from "../lib/lastSearchCity";
import HomeContent from "./HomeContent";

// Server-rendered ad ogni richiesta: stesso motivo di /cerca/[categoria],
// niente finestra di cache in cui un professionista eliminato resterebbe
// visibile nella vetrina "Professionisti su Professionisti".
export const dynamic = "force-dynamic";

export const metadata: Metadata = { alternates: { canonical: "/" } };

export default async function HomePage() {
  let professionals: ProfessionalSearchResult[];
  try {
    // excludeDemo: la home dichiara esplicitamente di mostrare conteggi e
    // professionisti reali (redesign "Scheda Intervento" §4.3/§4.6) — i
    // profili del seed (PLACEHOLDER_PROFESSIONALS) non devono contribuire
    // né ai conteggi per categoria né alla vetrina in evidenza.
    professionals = await apiClient.searchProfessionals({ excludeDemo: true });
  } catch {
    professionals = [];
  }

  // Numeri reali per la striscia "social proof" (richiesta esplicita
  // dell'utente) — se l'API non risponde, la striscia semplicemente non
  // compare invece di mostrare uno zero fuorviante (vedi PlatformStats).
  let platformStats: { totalUsers: number; totalProfessionals: number; reviewCount?: number; averageRating?: number | null } | null;
  try {
    platformStats = await apiClient.platformStats();
  } catch {
    platformStats = null;
  }

  // Ordine delle categorie (docs/changelog/2026-11-02-categorie-telefono.md):
  // prima quelle con più professionisti vicino all'ultima città cercata su
  // questo browser, se c'è, altrimenti in tutta Italia. Letto qui dal server,
  // così le schede arrivano già in ordine. Se l'API non risponde, l'ordine
  // fisso del catalogo.
  let categoryCounts: Partial<Record<ProfessionalCategorySlug, number>> = {};
  try {
    const raw = (await cookies()).get(LAST_SEARCH_CITY_COOKIE)?.value;
    let city: string | undefined;
    try {
      city = raw ? decodeURIComponent(raw).trim().slice(0, 80) || undefined : undefined;
    } catch {
      city = undefined;
    }
    const { counts } = await apiClient.getCategoryProfessionalCounts(city);
    categoryCounts = Object.fromEntries(counts.map((item) => [item.slug, item.count]));
  } catch {
    // Resta vuoto: l'ordine fisso del catalogo.
  }

  return <HomeContent professionals={professionals} platformStats={platformStats} categoryCounts={categoryCounts} />;
}
