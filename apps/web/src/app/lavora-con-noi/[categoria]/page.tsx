import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CATEGORY_SEO_NOUN, PROFESSIONAL_CATEGORIES, isProfessionalCategorySlug } from "@professionisti/shared";
import { breadcrumbJsonLd, jsonForScript } from "@/lib/jsonLd";

/**
 * "Lavora con noi" per ogni lavoro (docs/CHANGELOG.md §295, strategia SEO
 * Latina): chi cerca "lavoro pulizie latina" è un professionista da
 * trovare. Pagina breve che porta all'iscrizione con la categoria già
 * scelta; prezzi e condizioni restano su /per-professionisti.
 */
type PageParams = { categoria: string };

export function generateStaticParams(): PageParams[] {
  return PROFESSIONAL_CATEGORIES.map((category) => ({ categoria: category.slug }));
}

export const dynamicParams = false;

function findCategory(slug: string) {
  return isProfessionalCategorySlug(slug) ? PROFESSIONAL_CATEGORIES.find((c) => c.slug === slug) : undefined;
}

export function generateMetadata({ params }: { params: PageParams }): Metadata {
  const category = findCategory(params.categoria);
  if (!category) return {};
  const noun = CATEGORY_SEO_NOUN[category.slug];
  return {
    title: `${noun.workTitle}: clienti nella tua zona`,
    description: `${noun.workTitle}: ricevi le richieste dei clienti vicino a te e rispondi con un preventivo dal telefono. Iscriviti e crea il profilo.`,
    alternates: { canonical: `/lavora-con-noi/${category.slug}` },
  };
}

const STEPS = [
  { title: "Crea il profilo", text: "Lavori, zona in cui ti sposti, foto e prezzi. Bastano pochi minuti." },
  { title: "Ricevi le richieste", text: "Ti arrivano quelle dei clienti nella tua zona, con descrizione e foto del lavoro." },
  { title: "Manda il preventivo", text: "Voce per voce, dal telefono. Se il cliente accetta, il lavoro va in agenda." },
];

export default function WorkWithUsPage({ params }: { params: PageParams }) {
  const category = findCategory(params.categoria);
  if (!category) notFound();
  const noun = CATEGORY_SEO_NOUN[category.slug];
  const breadcrumbs = breadcrumbJsonLd([
    { label: "Home", href: "/" },
    { label: "Per i professionisti", href: "/per-professionisti" },
    { label: noun.workTitle },
  ]);

  return (
    <div className="price-page">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonForScript(breadcrumbs) }} />
      <h1 className="price-page-title">{noun.workTitle}: trova clienti nella tua zona</h1>
      <p className="price-page-lead">Le persone ci chiedono {noun.findQuestion}. Tu ricevi le richieste vicino a te e scegli a quali rispondere.</p>
      <ol className="work-steps">
        {STEPS.map((step) => (
          <li key={step.title} className="city-facts-item">
            <span className="work-step-title">{step.title}</span>
            <span className="city-facts-label">{step.text}</span>
          </li>
        ))}
      </ol>
      <p className="price-page-note">Nessuna commissione sui lavori che il cliente ti paga direttamente.</p>
      <div className="price-page-actions">
        <Link className="price-page-cta" href={`/registrati?ruolo=professionista&categoria=${category.slug}`}>
          Iscriviti come professionista
        </Link>
        <Link className="price-page-link" href="/per-professionisti">
          Prezzi e condizioni
        </Link>
      </div>
    </div>
  );
}
