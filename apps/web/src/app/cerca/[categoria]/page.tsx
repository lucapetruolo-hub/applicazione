import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PROFESSIONAL_CATEGORIES, isProfessionalCategorySlug, type ProfessionalSearchResult } from "@professionisti/shared";
import { apiClient } from "../../../lib/apiClient";
import { SearchHeader } from "@/components/SearchHeader";
import { CategoryContent } from "./CategoryContent";

type PageParams = { categoria: string };
type PageSearchParams = { citta?: string; online?: string; urgente?: string };

// Server-rendered ad ogni richiesta, non in cache: pagina SEO-critica (resta
// server-rendered, non client-side — CLAUDE.md §5.4), ma niente ISG/ISR.
// Con `revalidate` un professionista eliminato o un profilo modificato
// potevano restare visibili in ricerca fino a 5 minuti dopo la modifica —
// inaccettabile per un marketplace (un cliente potrebbe chiamare un
// professionista che non esiste più). Il volume di traffico atteso in fase
// di lancio (CLAUDE.md §7: 1 città, poche categorie) non giustifica ancora
// il rischio di dati non aggiornati pur di risparmiare query al DB.
export const dynamic = "force-dynamic";

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
  // La città resta un filtro valido anche in modalità "Online" (vedi stessa
  // nota in /cerca/page.tsx).
  const city = searchParams.citta;

  // Fetch server-side: contenuto SEO-critico deve essere presente nell'HTML
  // già al primo render, non caricato via client-side fetch (CLAUDE.md §5.4).
  let professionals: ProfessionalSearchResult[] = [];
  try {
    professionals = await apiClient.searchProfessionals({ category: category.slug, city, remote: isOnline });
  } catch {
    professionals = [];
  }

  // Tutti i professionisti della categoria (nessun filtro città, ma stesso
  // filtro online): alimenta i puntini sulla mappa così, allontanando lo
  // zoom, ne compaiono altri oltre a quelli della città cercata — la colonna
  // a sinistra si aggiorna di conseguenza in base a cosa è visibile sulla
  // mappa (ResultsListWithMap). La mappa è mostrata anche in modalità
  // "Online", quindi serve calcolarla in entrambe le modalità.
  let allProfessionals: ProfessionalSearchResult[] = professionals;
  try {
    allProfessionals = await apiClient.searchProfessionals({ category: category.slug, remote: isOnline });
  } catch {
    allProfessionals = professionals;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%" }}>
      <SearchHeader initialQuery={category.label} initialCity={city ?? ""} initialMode={isOnline ? "online" : "domicilio"} />
      {/* Key che cambia con i search params: forza il remount completo del
          contenuto quando si cambia modalita'/citta', cosi' la lista si
          aggiorna sempre anche navigando verso lo stesso percorso. */}
      <CategoryContent
        key={`${category.slug}-${isOnline}-${city ?? ""}`}
        category={category}
        city={city}
        online={isOnline}
        professionals={professionals}
        allProfessionals={allProfessionals}
        initialUrgentOnly={searchParams.urgente === "1"}
      />
    </div>
  );
}
