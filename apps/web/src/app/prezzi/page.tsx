import type { Metadata } from "next";
import Link from "next/link";
import { CATEGORY_SEO_NOUN, PROFESSIONAL_CATEGORIES, hasCategoryPrices } from "@professionisti/shared";
import { apiClient } from "@/lib/apiClient";
import { breadcrumbJsonLd } from "@/lib/jsonLd";
import { JsonLd } from "@/components/JsonLd";
import { CATEGORY_ACCENT, CategoryIcon } from "@/components/icons/CategoryIcons";

// Si aggiorna con i prezzi: una pagina mestiere compare appena supera le
// soglie (docs/CHANGELOG.md §296).
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Quanto costa? Prezzi veri per mestiere",
  description: "Quanto costa un idraulico, un elettricista, le pulizie e gli altri lavori di casa: prezzi veri dai preventivi accettati e dai professionisti del sito.",
  alternates: { canonical: "/prezzi" },
};

/**
 * Elenco delle pagine "Quanto costa" per mestiere (collaudo N-05,
 * docs/changelog/2026-10-30-velocita-telefono.md): prima /prezzi/idraulico
 * si raggiungeva solo da una domanda nelle pagine città. Solo i mestieri con
 * prezzi veri sopra le soglie, come la sitemap; gli altri portano al
 * preventivo, mai a una pagina vuota.
 */
export default async function PricesIndexPage() {
  const withPrices = await Promise.all(
    PROFESSIONAL_CATEGORIES.map(async (category) => {
      try {
        return hasCategoryPrices(await apiClient.getCategoryPrices(category.slug)) ? category : null;
      } catch {
        return null;
      }
    }),
  );
  const available = withPrices.filter((category) => category !== null);
  const others = PROFESSIONAL_CATEGORIES.filter((category) => !available.includes(category));

  return (
    <div className="price-page">
      <JsonLd data={breadcrumbJsonLd([{ label: "Home", href: "/" }, { label: "Prezzi" }])} />
      <h1 className="price-page-title">Quanto costa?</h1>
      <p className="price-page-lead">
        Prezzi veri: preventivi accettati dai clienti e prezzi indicati dai professionisti nel loro profilo. Nessuna stima inventata.
      </p>

      {available.length > 0 ? (
        <nav className="popular-services" aria-labelledby="price-index-title">
          <h2 id="price-index-title" className="popular-services-title">
            Prezzi per mestiere
          </h2>
          <ul className="popular-services-list">
            {available.map((category) => {
              const accent = CATEGORY_ACCENT[category.slug];
              return (
                <li key={category.slug}>
                  <Link href={`/prezzi/${category.slug}`} className="popular-services-link">
                    <span className="popular-services-icon" style={{ background: accent.bg, color: accent.fg }} aria-hidden="true">
                      <CategoryIcon slug={category.slug} size={18} />
                    </span>
                    {CATEGORY_SEO_NOUN[category.slug].costQuestion}?
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      ) : null}

      {others.length > 0 ? (
        <p className="price-page-note">
          {available.length > 0 ? "Per gli altri lavori" : "I prezzi compaiono qui quando ci sono abbastanza preventivi e prezzi veri. Intanto"} il modo più preciso
          per sapere quanto costa è chiedere un preventivo: è gratis e non ti impegna.
        </p>
      ) : null}

      <div className="price-page-actions">
        <Link className="price-page-cta" href="/preventivo">
          Chiedi un preventivo gratis
        </Link>
        <Link className="price-page-link" href="/#quanto-costa">
          Cerca il prezzo di un lavoro
        </Link>
      </div>
    </div>
  );
}
