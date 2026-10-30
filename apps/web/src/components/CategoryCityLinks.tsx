import Link from "next/link";
import { comuneSlug, type ProfessionalCategorySlug, type ProfessionalSearchResult } from "@professionisti/shared";
import { CATEGORY_ACCENT, CategoryIcon } from "@/components/icons/CategoryIcons";

const MAX_LINKS = 12;

/**
 * "Idraulico nelle città" sotto i risultati di un mestiere in tutta Italia
 * (collaudo N-07, docs/changelog/2026-10-30-velocita-telefono.md): le pagine
 * città ("Idraulico a Latina"), quelle che cercano su Google, erano a tre
 * clic dalla home. Solo città dove c'è almeno un professionista, prima
 * quelle con più professionisti; stesso aspetto di "Servizi più richiesti".
 */
export function CategoryCityLinks({
  categorySlug,
  categoryLabel,
  professionals,
}: {
  categorySlug: ProfessionalCategorySlug;
  categoryLabel: string;
  professionals: ProfessionalSearchResult[];
}) {
  const counts = new Map<string, { city: string; slug: string; count: number }>();
  for (const pro of professionals) {
    const slug = comuneSlug(pro.city);
    if (!slug) continue;
    const entry = counts.get(slug) ?? { city: pro.city, slug, count: 0 };
    entry.count += 1;
    counts.set(slug, entry);
  }
  const cities = [...counts.values()].sort((a, b) => b.count - a.count || a.city.localeCompare(b.city, "it")).slice(0, MAX_LINKS);
  if (cities.length === 0) return null;
  const accent = CATEGORY_ACCENT[categorySlug];

  return (
    <nav className="popular-services" aria-labelledby="category-cities-title">
      <h2 id="category-cities-title" className="popular-services-title">
        {categoryLabel} nelle città
      </h2>
      <ul className="popular-services-list">
        {cities.map((item) => (
          <li key={item.slug}>
            <Link href={`/cerca/${categorySlug}/${item.slug}`} className="popular-services-link">
              <span className="popular-services-icon" style={{ background: accent.bg, color: accent.fg }} aria-hidden="true">
                <CategoryIcon slug={categorySlug} size={18} />
              </span>
              {categoryLabel} a {item.city}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
