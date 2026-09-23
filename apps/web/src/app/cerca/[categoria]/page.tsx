import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { isProfessionalCategorySlug } from "@professionisti/shared";
import { CategoryResults, categoryMetadata, findCategory, type CategorySearchParams } from "./CategoryResults";

type PageParams = { categoria: string };

// Server-rendered ad ogni richiesta, non in cache: pagina SEO-critica (resta
// server-rendered, non client-side — CLAUDE.md §5.4), ma niente ISG/ISR.
// Con `revalidate` un professionista eliminato o un profilo modificato
// potevano restare visibili in ricerca fino a 5 minuti dopo la modifica —
// inaccettabile per un marketplace (un cliente potrebbe chiamare un
// professionista che non esiste più). Il volume di traffico atteso in fase
// di lancio (CLAUDE.md §7: 1 città, poche categorie) non giustifica ancora
// il rischio di dati non aggiornati pur di risparmiare query al DB.
export const dynamic = "force-dynamic";

export function generateMetadata({ params, searchParams }: { params: PageParams; searchParams: CategorySearchParams }): Metadata {
  if (!isProfessionalCategorySlug(params.categoria)) {
    return {};
  }
  // Con `?citta=` di un comune reale la versione canonica è la pagina
  // indicizzabile /cerca/[categoria]/[citta] (stesso contenuto).
  return categoryMetadata(findCategory(params.categoria), searchParams.citta);
}

export default function CategoryPage({ params, searchParams }: { params: PageParams; searchParams: CategorySearchParams }) {
  if (!isProfessionalCategorySlug(params.categoria)) {
    notFound();
  }
  return <CategoryResults category={findCategory(params.categoria)} city={searchParams.citta} searchParams={searchParams} />;
}
