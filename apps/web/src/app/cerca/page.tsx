import type { Metadata } from "next";
import type { ProfessionalSearchResult } from "@professionisti/shared";
import { apiClient } from "../../lib/apiClient";
import { SearchHeader } from "@/components/SearchHeader";
import { CercaContent } from "./CercaContent";

type PageSearchParams = { citta?: string; online?: string; q?: string };

// Pagina "tutti i professionisti": raggiunta quando la ricerca non riconosce
// una categoria specifica (solo città, solo modalità online, o nome libero).
// Dinamica (non SSG) perché le combinazioni città/online/q sono troppe per
// pre-generarle, ma resta server-rendered per lo stesso motivo SEO delle
// pagine categoria (CLAUDE.md §5.4).
export const dynamic = "force-dynamic";

export function generateMetadata({ searchParams }: { searchParams: PageSearchParams }): Metadata {
  if (searchParams.online === "1") {
    return { title: "Consulenze online — Professionisti", description: "Professionisti disponibili per consulenza online." };
  }
  if (searchParams.citta) {
    return {
      title: `Professionisti a ${searchParams.citta}`,
      description: `Trova professionisti verificati a ${searchParams.citta}.`,
    };
  }
  return { title: "Tutti i professionisti", description: "Trova professionisti verificati vicino a te." };
}

export default async function CercaPage({ searchParams }: { searchParams: PageSearchParams }) {
  const isOnline = searchParams.online === "1";
  const city = isOnline ? undefined : searchParams.citta;

  let professionals: ProfessionalSearchResult[] = [];
  try {
    professionals = await apiClient.searchProfessionals({ city, q: searchParams.q, remote: isOnline });
  } catch {
    professionals = [];
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%" }}>
      <SearchHeader initialQuery={searchParams.q ?? ""} initialCity={city ?? ""} initialMode={isOnline ? "online" : "domicilio"} />
      <CercaContent city={city} online={isOnline} q={searchParams.q} professionals={professionals} />
    </div>
  );
}
