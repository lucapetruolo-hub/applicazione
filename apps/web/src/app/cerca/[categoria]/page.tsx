import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PROFESSIONAL_CATEGORIES, isProfessionalCategorySlug, type ProfessionalSearchResult } from "@professionisti/shared";
import { apiClient } from "../../../lib/apiClient";
import { SearchHeader } from "@/components/SearchHeader";
import { CategoryContent } from "./CategoryContent";

type PageParams = { categoria: string };
type PageSearchParams = { citta?: string; online?: string };

// SSG: pre-genera una pagina per categoria a build time — pagina SEO-critica,
// non va convertita in client-side rendering (CLAUDE.md §5.4).
export function generateStaticParams() {
  return PROFESSIONAL_CATEGORIES.map((category) => ({ categoria: category.slug }));
}

// ISR: la lista risultati va rigenerata periodicamente (nuovi professionisti,
// boost/rating aggiornati) senza rinunciare al vantaggio SEO di SSG.
export const revalidate = 300;

export function generateMetadata({ params }: { params: PageParams }): Metadata {
  if (!isProfessionalCategorySlug(params.categoria)) {
    return {};
  }
  const category = PROFESSIONAL_CATEGORIES.find((c) => c.slug === params.categoria)!;
  return {
    title: `${category.label} vicino a te`,
    description: `Trova e contatta ${category.label.toLowerCase()} verificati nella tua zona.`,
  };
}

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: PageParams;
  searchParams: PageSearchParams;
}) {
  if (!isProfessionalCategorySlug(params.categoria)) {
    notFound();
  }
  const category = PROFESSIONAL_CATEGORIES.find((c) => c.slug === params.categoria)!;
  const isOnline = searchParams.online === "1";
  const city = isOnline ? undefined : searchParams.citta;

  // Fetch server-side: contenuto SEO-critico deve essere presente nell'HTML
  // già al primo render, non caricato via client-side fetch (CLAUDE.md §5.4).
  let professionals: ProfessionalSearchResult[] = [];
  try {
    professionals = await apiClient.searchProfessionals({ category: category.slug, city, remote: isOnline });
  } catch {
    professionals = [];
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%" }}>
      <SearchHeader initialQuery={category.label} initialCity={city ?? ""} initialMode={isOnline ? "online" : "domicilio"} />
      <CategoryContent category={category} city={city} online={isOnline} professionals={professionals} />
    </div>
  );
}
