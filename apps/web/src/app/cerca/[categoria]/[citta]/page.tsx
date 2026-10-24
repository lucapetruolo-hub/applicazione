import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { findComuneBySlug, isProfessionalCategorySlug } from "@professionisti/shared";
import { CategoryResults, categoryMetadata, findCategory, type CategorySearchParams } from "../CategoryResults";

type PageParams = { categoria: string; citta: string };

// Stessa scelta di /cerca/[categoria]: server-rendered ad ogni richiesta.
export const dynamic = "force-dynamic";

/**
 * Pagina indicizzabile categoria+città (es. /cerca/idraulico/roma) — SEO
 * locale, "idraulico a Roma" (CLAUDE.md §7.6, docs/CHANGELOG.md §132).
 * Prima la città era solo `?citta=`, un URL che i motori di ricerca non
 * trattano come pagina a sé. Stesso contenuto di /cerca/[categoria]?citta=.
 */
export async function generateMetadata(props: { params: Promise<PageParams> }): Promise<Metadata> {
  const params = await props.params;
  const comune = findComuneBySlug(params.citta);
  if (!isProfessionalCategorySlug(params.categoria) || !comune) {
    return {};
  }
  return categoryMetadata(findCategory(params.categoria), comune.name);
}

export default async function CategoryCityPage(props: { params: Promise<PageParams>; searchParams: Promise<CategorySearchParams> }) {
  const [params, searchParams] = await Promise.all([props.params, props.searchParams]);
  const comune = findComuneBySlug(params.citta);
  if (!isProfessionalCategorySlug(params.categoria) || !comune) {
    notFound();
  }
  return <CategoryResults category={findCategory(params.categoria)} city={comune.name} searchParams={searchParams} />;
}
