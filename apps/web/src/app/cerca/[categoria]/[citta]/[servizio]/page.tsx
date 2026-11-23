import { notFound, permanentRedirect } from "next/navigation";
import type { Metadata } from "next";
import { MOVED_SUB_TAGS, categorySubTags, findComuneBySlug, isProfessionalCategorySlug } from "@professionisti/shared";
import { CategoryResults, categoryMetadata, findCategory, type CategorySearchParams } from "../../CategoryResults";

type PageParams = { categoria: string; citta: string; servizio: string };

export const dynamic = "force-dynamic";

/**
 * Pagina per servizio, es. /cerca/idraulico/latina/impianti-gas (docs/CHANGELOG.md
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

export async function generateMetadata(props: { params: Promise<PageParams>; searchParams: Promise<CategorySearchParams> }): Promise<Metadata> {
  const [params, searchParams] = await Promise.all([props.params, props.searchParams]);
  const page = resolve(params);
  if (!page) return {};
  return categoryMetadata(page.category, page.comune.name, page.subTag, searchParams);
}

export default async function CategoryCityServicePage(props: { params: Promise<PageParams>; searchParams: Promise<CategorySearchParams> }) {
  const [params, searchParams] = await Promise.all([props.params, props.searchParams]);
  const page = resolve(params);
  if (!page) {
    // Specializzazione tolta: la vecchia pagina porta al mestiere giusto (docs/changelog/2026-11-23-termoidraulico.md).
    const movedTo = isProfessionalCategorySlug(params.categoria) ? MOVED_SUB_TAGS[params.categoria]?.[params.servizio] : undefined;
    if (movedTo && findComuneBySlug(params.citta)) permanentRedirect(`/cerca/${movedTo}/${params.citta}`);
    notFound();
  }
  return <CategoryResults category={page.category} city={page.comune.name} subTag={page.subTag} searchParams={searchParams} />;
}
