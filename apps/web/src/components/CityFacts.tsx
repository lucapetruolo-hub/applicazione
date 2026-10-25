import type { CSSProperties } from "react";
import Link from "next/link";
import {
  CATEGORY_SEO_NOUN,
  MIN_PROFESSIONALS_TO_INDEX_CITY,
  categorySubTags,
  comuneSlug,
  formatRating,
  subTagLabel,
  type ProfessionalCategorySlug,
  type ProfessionalSearchResult,
} from "@professionisti/shared";

/**
 * "[Lavoro] a [città] in breve" in fondo ai risultati di una pagina
 * categoria+città (docs/CHANGELOG.md §296, strategia SEO Latina): pochi dati
 * veri presi dai risultati della pagina e le domande che le persone fanno a
 * Google ("Le persone hanno chiesto anche"), con risposte brevi. Rende la
 * pagina diversa da quella di un'altra città e risponde a chi cerca il
 * prezzo. Nessun prezzo inventato: le prestazioni dei profili non dicono a
 * quale categoria appartengono, quindi qui il prezzo rimanda al preventivo.
 */
export function CityFacts({
  categorySlug,
  categoryLabel,
  city,
  professionals,
  pricePageHref = null,
  subTag,
}: {
  categorySlug: ProfessionalCategorySlug;
  categoryLabel: string;
  city: string;
  professionals: ProfessionalSearchResult[];
  /** Pagina "Quanto costa" con prezzi veri da collegare (`/prezzi/...`, §296), se c'è. */
  pricePageHref?: string | null;
  /** Pagina per servizio: i dati sono già dei soli professionisti con questa specializzazione. */
  subTag?: string;
}) {
  if (professionals.length === 0) return null;
  const noun = CATEGORY_SEO_NOUN[categorySlug];
  const verified = professionals.filter((pro) => pro.verified).length;
  const reviewCount = professionals.reduce((sum, pro) => sum + pro.reviewCount, 0);
  const ratingSum = professionals.reduce((sum, pro) => sum + (pro.rating ?? 0) * pro.reviewCount, 0);
  const averageRating = reviewCount > 0 ? formatRating(ratingSum / reviewCount) : null;

  // Niente tessere a zero e, con un solo professionista, niente numeri
  // (docs/CHANGELOG.md §346): "0 con badge Verificato" in una pagina che deve
  // dare fiducia ottiene l'effetto opposto, e "1 professionista in zona"
  // sopra la sua unica scheda non dice nulla di nuovo.
  const facts =
    professionals.length < 2
      ? []
      : [
          { value: String(professionals.length), label: "professionisti in zona" },
          ...(verified > 0 ? [{ value: String(verified), label: "con badge Verificato" }] : []),
          averageRating
            ? { value: `${averageRating}/5`, label: `su ${reviewCount} ${reviewCount === 1 ? "recensione" : "recensioni"}` }
            : { value: "Gratis", label: "chiedere un preventivo" },
        ];

  // Pagine per servizio da collegare (docs/CHANGELOG.md §296): solo quelle
  // con abbastanza professionisti da essere in Google, mai pagine vuote.
  const citySlug = comuneSlug(city);
  const serviceLinks = subTag
    ? []
    : categorySubTags(categorySlug).filter(
        (tag) => professionals.filter((pro) => pro.subTags.includes(tag)).length >= MIN_PROFESSIONALS_TO_INDEX_CITY,
      );

  const faqs = [
    {
      question: `${noun.costQuestion} a ${city}?`,
      answer: (
        <>
          Dipende dal lavoro. Descrivilo in una richiesta: ricevi preventivi gratuiti, con il prezzo voce per voce.{" "}
          <Link href={`/preventivo?categoria=${categorySlug}&citta=${encodeURIComponent(city)}`}>Chiedi un preventivo</Link>
          {pricePageHref ? (
            <>
              {" "}o guarda i <Link href={pricePageHref}>prezzi indicativi</Link>.
            </>
          ) : null}
        </>
      ),
    },
    {
      question: "Chiedere un preventivo costa qualcosa?",
      answer: <>No: la richiesta è gratuita e non ti impegna ad accettare.</>,
    },
    {
      question: `Mi serve ${noun.findQuestion} subito: come faccio?`,
      answer: (
        <>
          Invia una <Link href="/urgente">richiesta urgente</Link>: arriva subito ai professionisti della zona, segnata come urgente.
        </>
      ),
    },
    {
      question: "Come scelgo a chi affidare il lavoro?",
      answer: <>Confronta i preventivi e guarda le recensioni: arrivano solo da lavori confermati. Il badge Verificato vuol dire identità controllata con documento e selfie.</>,
    },
  ];

  return (
    <section className="city-facts" aria-labelledby="city-facts-title">
      <h2 id="city-facts-title" className="city-facts-title">
        {categoryLabel} a {city}
        {subTag ? `: ${subTagLabel(subTag).toLowerCase()}` : ""} in breve
      </h2>
      {facts.length > 0 ? (
        <ul className="city-facts-list" style={{ "--facts-count": facts.length } as CSSProperties}>
          {facts.map((fact) => (
            <li key={fact.label} className="city-facts-item">
              <span className="city-facts-value">{fact.value}</span>
              <span className="city-facts-label">{fact.label}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {serviceLinks.length > 0 && citySlug ? (
        <>
          <h3 className="city-facts-subtitle">Specializzazioni</h3>
          <ul className="city-facts-services">
            {serviceLinks.map((tag) => (
              <li key={tag}>
                <Link href={`/cerca/${categorySlug}/${citySlug}/${tag}`}>{subTagLabel(tag)}</Link>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      <h3 className="city-facts-subtitle">Domande frequenti</h3>
      <div className="city-facts-faq">
        {faqs.map((faq) => (
          <details key={faq.question} className="city-facts-question">
            <summary>{faq.question}</summary>
            <p>{faq.answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
