import Link from "next/link";
import { CATEGORY_SEO_NOUN, type ProfessionalCategorySlug, type ProfessionalSearchResult } from "@professionisti/shared";

/**
 * "[Lavoro] a [città] in breve" in fondo ai risultati di una pagina
 * categoria+città (docs/CHANGELOG.md §291, strategia SEO Latina): pochi dati
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
}: {
  categorySlug: ProfessionalCategorySlug;
  categoryLabel: string;
  city: string;
  professionals: ProfessionalSearchResult[];
}) {
  if (professionals.length === 0) return null;
  const noun = CATEGORY_SEO_NOUN[categorySlug];
  const verified = professionals.filter((pro) => pro.verified).length;
  const reviewCount = professionals.reduce((sum, pro) => sum + pro.reviewCount, 0);
  const ratingSum = professionals.reduce((sum, pro) => sum + (pro.rating ?? 0) * pro.reviewCount, 0);
  const averageRating = reviewCount > 0 ? (ratingSum / reviewCount).toFixed(1).replace(".", ",") : null;

  const facts = [
    { value: String(professionals.length), label: professionals.length === 1 ? "professionista in zona" : "professionisti in zona" },
    { value: String(verified), label: "con badge Verificato" },
    averageRating
      ? { value: `${averageRating}/5`, label: `su ${reviewCount} ${reviewCount === 1 ? "recensione" : "recensioni"}` }
      : { value: "Gratis", label: "chiedere un preventivo" },
  ];

  const faqs = [
    {
      question: `${noun.costQuestion} a ${city}?`,
      answer: (
        <>
          Dipende dal lavoro. Descrivilo in una richiesta: ricevi preventivi gratuiti, con il prezzo voce per voce.{" "}
          <Link href={`/preventivo?categoria=${categorySlug}&citta=${encodeURIComponent(city)}`}>Chiedi un preventivo</Link>
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
      answer: <>Confronta i preventivi e guarda le recensioni: arrivano solo da lavori confermati. Il badge Verificato vuol dire documento e partita IVA controllati.</>,
    },
  ];

  return (
    <section className="city-facts" aria-labelledby="city-facts-title">
      <h2 id="city-facts-title" className="city-facts-title">
        {categoryLabel} a {city} in breve
      </h2>
      <ul className="city-facts-list">
        {facts.map((fact) => (
          <li key={fact.label} className="city-facts-item">
            <span className="city-facts-value">{fact.value}</span>
            <span className="city-facts-label">{fact.label}</span>
          </li>
        ))}
      </ul>
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
