import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  CATEGORY_SEO_NOUN,
  PROFESSIONAL_CATEGORIES,
  formatServicePriceRange,
  hasCategoryPrices,
  isProfessionalCategorySlug,
  type CategoryPriceStats,
  type ProfessionalCategorySlug,
} from "@professionisti/shared";
import { apiClient } from "@/lib/apiClient";
import { breadcrumbJsonLd, jsonForScript } from "@/lib/jsonLd";

/**
 * "Quanto costa un [lavoro]" (docs/CHANGELOG.md §295, strategia SEO Latina):
 * le ricerche sui prezzi sono tantissime e nazionali, e Google premia numeri
 * chiari e verificabili. Qui solo prezzi veri del sito: preventivi accettati
 * (da 10) e prezzi dichiarati dai professionisti (da 5 professionisti). Sotto
 * le soglie la pagina non esiste (404) e non è nella sitemap.
 */
export const dynamic = "force-dynamic";

type PageParams = { categoria: string };

async function loadPrices(slug: string): Promise<{ category: (typeof PROFESSIONAL_CATEGORIES)[number]; stats: CategoryPriceStats } | null> {
  if (!isProfessionalCategorySlug(slug)) return null;
  const category = PROFESSIONAL_CATEGORIES.find((c) => c.slug === slug);
  if (!category) return null;
  try {
    const stats = await apiClient.getCategoryPrices(slug);
    return hasCategoryPrices(stats) ? { category, stats } : null;
  } catch {
    return null;
  }
}

/** Euro tondi: in una fascia di prezzo i centesimi sono rumore. */
const euros = (cents: number) => Math.round(cents / 100) * 100;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Rome" });
}

export async function generateMetadata({ params }: { params: PageParams }): Promise<Metadata> {
  const data = await loadPrices(params.categoria);
  if (!data) return { robots: { index: false, follow: false } };
  const noun = CATEGORY_SEO_NOUN[data.category.slug as ProfessionalCategorySlug];
  const { quotes } = data.stats;
  return {
    title: `${noun.costQuestion}? Prezzi veri`,
    description: quotes
      ? `${noun.costQuestion}: metà dei lavori tra ${formatServicePriceRange(euros(quotes.lowEurCents), euros(quotes.highEurCents))}, su ${quotes.count} preventivi accettati. Chiedi il tuo preventivo gratis.`
      : `${noun.costQuestion}: i prezzi dichiarati dai professionisti per i lavori più comuni. Chiedi il tuo preventivo gratis.`,
    alternates: { canonical: `/prezzi/${data.category.slug}` },
  };
}

export default async function CategoryPricesPage({ params }: { params: PageParams }) {
  const data = await loadPrices(params.categoria);
  if (!data) notFound();
  const { category, stats } = data;
  const slug = category.slug as ProfessionalCategorySlug;
  const noun = CATEGORY_SEO_NOUN[slug];
  const { quotes, declared } = stats;

  const faqs = [
    {
      question: "Da cosa dipende il prezzo?",
      answer: "Dal lavoro da fare, dai materiali, dall'urgenza e dalla distanza. Per questo il prezzo giusto è quello del preventivo, voce per voce.",
    },
    { question: "Chiedere un preventivo costa qualcosa?", answer: "No: la richiesta è gratuita e non ti impegna ad accettare." },
    {
      question: "Da dove vengono questi prezzi?",
      answer: quotes
        ? "Dai preventivi che i clienti hanno accettato su questo sito e dai prezzi che i professionisti indicano nel loro profilo. Nessuna stima inventata."
        : "Dai prezzi che i professionisti indicano nel loro profilo per i lavori più comuni. Nessuna stima inventata.",
    },
  ];

  const breadcrumbs = breadcrumbJsonLd([
    { label: "Home", href: "/" },
    { label: category.label, href: `/cerca/${slug}` },
    { label: "Prezzi" },
  ]);
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({ "@type": "Question", name: faq.question, acceptedAnswer: { "@type": "Answer", text: faq.answer } })),
  };

  return (
    <div className="price-page">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonForScript(breadcrumbs) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonForScript(faqJsonLd) }} />
      <h1 className="price-page-title">{noun.costQuestion}?</h1>

      {quotes ? (
        <>
          <p className="price-page-lead">
            Metà dei lavori costa tra <strong>{formatServicePriceRange(euros(quotes.lowEurCents), euros(quotes.highEurCents))}</strong>. Il prezzo che
            sta nel mezzo è {formatServicePriceRange(euros(quotes.medianEurCents), null)}.
          </p>
          <ul className="city-facts-list">
            <li className="city-facts-item">
              <span className="city-facts-value">{formatServicePriceRange(euros(quotes.medianEurCents), null)}</span>
              <span className="city-facts-label">prezzo a metà</span>
            </li>
            <li className="city-facts-item">
              <span className="city-facts-value">{quotes.count}</span>
              <span className="city-facts-label">preventivi accettati</span>
            </li>
            <li className="city-facts-item">
              <span className="city-facts-value">{formatDate(quotes.updatedAt)}</span>
              <span className="city-facts-label">ultimo aggiornamento</span>
            </li>
          </ul>
        </>
      ) : (
        <p className="price-page-lead">I prezzi che i professionisti indicano nel loro profilo per i lavori più comuni.</p>
      )}

      {declared && declared.services.length > 0 ? (
        <section aria-labelledby="price-services-title">
          <h2 id="price-services-title" className="city-facts-subtitle">
            Prezzi dei lavori più comuni
          </h2>
          <table className="price-table">
            <thead>
              <tr>
                <th scope="col">Lavoro</th>
                <th scope="col">Prezzo</th>
              </tr>
            </thead>
            <tbody>
              {declared.services.map((service) => (
                <tr key={service.name}>
                  <th scope="row">{service.name}</th>
                  <td>{formatServicePriceRange(service.minEurCents, service.maxEurCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="price-page-note">Prezzi indicati da {declared.professionalCount} professionisti nel loro profilo.</p>
        </section>
      ) : null}

      <div className="price-page-actions">
        <Link className="price-page-cta" href={`/preventivo?categoria=${slug}`}>
          Chiedi un preventivo gratis
        </Link>
        <Link className="price-page-link" href={`/cerca/${slug}`}>
          Vedi i professionisti
        </Link>
      </div>

      <h2 className="city-facts-subtitle">Domande frequenti</h2>
      <div className="city-facts-faq">
        {faqs.map((faq) => (
          <details key={faq.question} className="city-facts-question">
            <summary>{faq.question}</summary>
            <p>{faq.answer}</p>
          </details>
        ))}
      </div>
    </div>
  );
}
