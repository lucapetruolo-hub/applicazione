import Link from "next/link";
import { PROFESSIONAL_CATEGORIES, comuneSlug, type ProfessionalCategorySlug } from "@professionisti/shared";
import { CATEGORY_ACCENT, CategoryIcon } from "@/components/icons/CategoryIcons";

/** Quanti servizi mostrare: abbastanza per collegare le pagine vicine, non un elenco infinito. */
const MAX_LINKS = 8;

/**
 * "Servizi più richiesti a [città]" in fondo ai risultati di una categoria
 * (docs/CHANGELOG.md §282, SEO locale — CLAUDE.md §7.6): link alle pagine
 * indicizzabili categoria+città della stessa zona, nell'HTML già dal server.
 * `order` arriva da `GET /categories/popular`; senza dati (o se l'API non
 * risponde in tempo) resta l'ordine del catalogo. Si esclude la categoria
 * della pagina e, con una città, quelle senza professionisti lì (`available`):
 * niente link a pagine vuote, come nella sitemap.
 */
export function PopularServicesLinks({
  currentSlug,
  city,
  order,
  available,
}: {
  currentSlug: ProfessionalCategorySlug;
  /** Nome del comune già verificato; senza città i link vanno alle pagine nazionali. */
  city?: string;
  order: string[];
  /** Con una città: categorie con almeno un professionista lì; `null` se non si sa (nessun link). */
  available?: string[] | null;
}) {
  if (city && !available) return null;
  const rank = new Map(order.map((slug, index) => [slug, index]));
  const categories = PROFESSIONAL_CATEGORIES.filter((category) => category.slug !== currentSlug && (!city || available?.includes(category.slug)))
    .map((category, catalogIndex) => ({ category, catalogIndex }))
    .sort((a, b) => (rank.get(a.category.slug) ?? order.length + a.catalogIndex) - (rank.get(b.category.slug) ?? order.length + b.catalogIndex))
    .slice(0, MAX_LINKS)
    .map(({ category }) => category);
  const citySlug = city ? comuneSlug(city) : null;
  if (categories.length === 0) return null;

  return (
    <nav className="popular-services" aria-labelledby="popular-services-title">
      <h2 id="popular-services-title" className="popular-services-title">
        {city ? `Servizi più richiesti a ${city}` : "Servizi più richiesti"}
      </h2>
      <ul className="popular-services-list">
        {categories.map((category) => {
          const accent = CATEGORY_ACCENT[category.slug];
          return (
            <li key={category.slug}>
              <Link href={citySlug ? `/cerca/${category.slug}/${citySlug}` : `/cerca/${category.slug}`} className="popular-services-link">
                <span className="popular-services-icon" style={{ background: accent.bg, color: accent.fg }} aria-hidden="true">
                  <CategoryIcon slug={category.slug} size={18} />
                </span>
                {city ? `${category.label} a ${city}` : category.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
