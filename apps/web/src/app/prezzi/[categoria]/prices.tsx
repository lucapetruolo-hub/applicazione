import type { Metadata } from "next";
import Link from "next/link";
import {
  CATEGORY_SEO_NOUN,
  italianComuni,
  PROFESSIONAL_CATEGORIES,
  comuneSlug,
  SERVICE_PRICE_UNIT_LABEL,
  formatServicePrice,
  formatServicePriceRange,
  hasCategoryPrices,
  isProfessionalCategorySlug,
  type CategoryPriceStats,
  type Comune,
  type ProfessionalCategorySlug,
} from "@professionisti/shared";
import { apiClient } from "@/lib/apiClient";
import { breadcrumbJsonLd } from "@/lib/jsonLd";
import { JsonLd } from "@/components/JsonLd";
import { PriceToolLink } from "./PriceToolLink";

/**
 * "Quanto costa un [lavoro]" (docs/CHANGELOG.md §296, strategia SEO Latina):
 * le ricerche sui prezzi sono tantissime e nazionali, e Google premia numeri
 * chiari e verificabili. Qui solo prezzi veri del sito: preventivi accettati
 * (da 10) e prezzi dichiarati dai professionisti (da 5 professionisti). Sotto
 * le soglie la pagina non esiste (404) e non è nella sitemap. Anche per
 * città (`/prezzi/[categoria]/[citta]`), con i prezzi della sua provincia.
 * Usato dalle due pagine.
 */
export type PricesData = {
  category: (typeof PROFESSIONAL_CATEGORIES)[number];
  stats: CategoryPriceStats;
  /** Pagina di una città: i prezzi sono della sua provincia (§296). */
  comune?: Comune;
};

/** Prezzi della categoria (in tutta Italia o nella provincia della città); null sotto le soglie o se l'API non risponde. */
export async function loadPrices(slug: string, comune?: Comune): Promise<PricesData | null> {
  if (!isProfessionalCategorySlug(slug)) return null;
  const category = PROFESSIONAL_CATEGORIES.find((c) => c.slug === slug);
  if (!category) return null;
  try {
    const stats = await apiClient.getCategoryPrices(slug, comune?.name);
    return hasCategoryPrices(stats) ? { category, stats, comune } : null;
  } catch {
    return null;
  }
}

/** Nome della provincia dal capoluogo ("LT" → "Latina"). */
function provinceName(comune: Comune): string {
  return italianComuni().find((c) => c.province === comune.province && c.capoluogo)?.name ?? comune.province;
}

/** Percorso della pagina: nazionale o della città. */
export function pricesPath(data: Pick<PricesData, "category" | "comune">): string {
  return data.comune ? `/prezzi/${data.category.slug}/${comuneSlug(data.comune.name)}` : `/prezzi/${data.category.slug}`;
}

/** Elenco di chi offre il lavoro (§383), nella città della pagina se c'è. */
function serviceListHref(name: string, comune?: Comune): string {
  const params = new URLSearchParams({ servizio: name });
  if (comune) params.set("citta", comune.name);
  return `/cerca?${params.toString()}`;
}

/** Euro tondi: in una fascia di prezzo i centesimi sono rumore. */
const euros = (cents: number) => Math.round(cents / 100) * 100;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Rome" });
}

export function pricesMetadata(data: PricesData | null): Metadata {
  if (!data) return { robots: { index: false, follow: false } };
  const noun = CATEGORY_SEO_NOUN[data.category.slug as ProfessionalCategorySlug];
  const { quotes } = data.stats;
  const where = data.comune ? ` a ${data.comune.name}` : "";
  return {
    title: `${noun.costQuestion}${where}? Prezzi veri`,
    description: quotes
      ? `${noun.costQuestion}${where}: metà dei lavori tra ${formatServicePriceRange(euros(quotes.lowEurCents), euros(quotes.highEurCents))}, su ${quotes.count} preventivi accettati. Chiedi il tuo preventivo gratis.`
      : `${noun.costQuestion}${where}: i prezzi dichiarati dai professionisti per i lavori più comuni. Chiedi il tuo preventivo gratis.`,
    alternates: { canonical: pricesPath(data) },
  };
}

export function PricesView({ data }: { data: PricesData }) {
  const { category, stats, comune } = data;
  const where = comune ? ` a ${comune.name}` : "";
  const area = comune ? ` in provincia di ${provinceName(comune)}` : "";
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

  const citySlug = comune ? comuneSlug(comune.name) : undefined;
  const breadcrumbs = breadcrumbJsonLd([
    { label: "Home", href: "/" },
    { label: category.label, href: `/cerca/${slug}` },
    ...(comune && citySlug ? [{ label: comune.name, href: `/cerca/${slug}/${citySlug}` }] : []),
    { label: "Prezzi" },
  ]);
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({ "@type": "Question", name: faq.question, acceptedAnswer: { "@type": "Answer", text: faq.answer } })),
  };

  return (
    <div className="price-page">
      <JsonLd data={breadcrumbs} />
      <JsonLd data={faqJsonLd} />
      <h1 className="price-page-title">
        {noun.costQuestion}
        {where}?
      </h1>

      {quotes ? (
        <>
          <p className="price-page-lead">
            Metà dei lavori{area} costa tra <strong>{formatServicePriceRange(euros(quotes.lowEurCents), euros(quotes.highEurCents))}</strong>. Il prezzo che
            sta nel mezzo è {formatServicePriceRange(euros(quotes.medianEurCents), null)}.
          </p>
          <ul className="city-facts-list">
            <li className="city-facts-item">
              <span className="city-facts-value">{formatServicePriceRange(euros(quotes.medianEurCents), null)}</span>
              <span className="city-facts-label">prezzo a metà</span>
            </li>
            <li className="city-facts-item">
              <span className="city-facts-value">{quotes.count}</span>
              <span className="city-facts-label">preventivi accettati{area}</span>
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
              {/* Ogni lavoro apre chi lo offre, come le voci del "Quanto costa in
                  media" della home (richiesta di Luca, docs/CHANGELOG.md §383);
                  nella pagina di una città, già in quella città. */}
              {declared.services.map((service) => (
                <tr key={service.name}>
                  <th scope="row">
                    <PriceToolLink href={serviceListHref(service.name, comune)} label={`${service.name}, ${formatServicePrice(service.minEurCents, service.maxEurCents, service.unit)}: vedi chi lo fa`}>
                      {service.name}
                    </PriceToolLink>
                  </th>
                  <td>
                    {/* Unità prima del prezzo: le cifre restano allineate a destra (§389). */}
                    <span className="price-table-unit">{SERVICE_PRICE_UNIT_LABEL[service.unit]}</span>
                    {formatServicePriceRange(service.minEurCents, service.maxEurCents)}
                    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" className="price-table-chevron">
                      <path d="M6 3.5 10.5 8 6 12.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="price-page-note">
            Prezzi indicati da {declared.professionalCount} professionisti{area} nel loro profilo.
          </p>
        </section>
      ) : null}

      <div className="price-page-actions">
        <Link className="price-page-cta" href={`/preventivo?categoria=${slug}${comune ? `&citta=${encodeURIComponent(comune.name)}` : ""}`}>
          Chiedi un preventivo gratis
        </Link>
        <Link className="price-page-link" href={comune && citySlug ? `/cerca/${slug}/${citySlug}` : `/cerca/${slug}`}>
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
