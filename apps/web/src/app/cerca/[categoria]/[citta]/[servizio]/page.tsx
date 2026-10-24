import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { categorySubTags, findComuneBySlug, isProfessionalCategorySlug } from "@professionisti/shared";
import { CategoryResults, categoryMetadata, findCategory, type CategorySearchParams } from "../../CategoryResults";

type PageParams = { categoria: string; citta: string; servizio: string };

export const dynamic = "force-dynamic";

/**
 * Pagina per servizio, es. /cerca/idraulico/latina/caldaie (docs/CHANGELOG.md
 * §296, strategia SEO Latina): i professionisti della città con quella
 * specializzazione. In Google solo da `MIN_PROFESSIONALS_TO_INDEX_CITY`
 * professionisti veri, come le pagine città; una specializzazione che non è
 * della categoria è un 404.
 */
function resolve(params: PageParams) {
  const comune = findComuneBySlug(params.citta);
  if (!isProfessionalCategorySlug(params.categoria) || !comune) return null;
  if (!categorySubTags(params.categoria).includes(params.servizio)) return null;
  return { category: findCategory(params.categoria), comune, subTag: params.servizio };
}

export async function generateMetadata({ params }: { params: PageParams }): Promise<Metadata> {
  const page = resolve(params);
  if (!page) return {};
  return categoryMetadata(page.category, page.comune.name, page.subTag);
}

export default function CategoryCityServicePage({ params, searchParams }: { params: PageParams; searchParams: CategorySearchParams }) {
  const page = resolve(params);
  if (!page) notFound();
  return <CategoryResults category={page.category} city={page.comune.name} subTag={page.subTag} searchParams={searchParams} />;
}
