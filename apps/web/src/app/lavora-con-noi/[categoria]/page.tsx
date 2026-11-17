import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CATEGORY_SEO_NOUN, PROFESSIONAL_CATEGORIES, PROVINCE_NAMES, isProfessionalCategorySlug, provinceSlug, type BoardSummaryRow } from "@professionisti/shared";
import { apiClient } from "@/lib/apiClient";
import { breadcrumbJsonLd } from "@/lib/jsonLd";
import { JsonLd } from "@/components/JsonLd";
import boardStyles from "@/components/requestBoard/BoardPage.module.css";

/**
 * "Lavora con noi" per ogni lavoro (docs/CHANGELOG.md §296, strategia SEO
 * Latina): chi cerca "lavoro pulizie latina" è un professionista da
 * trovare. Pagina breve che porta all'iscrizione con la categoria già
 * scelta; prezzi e condizioni restano su /per-professionisti.
 */
type PageParams = { categoria: string };

export function generateStaticParams(): PageParams[] {
  return PROFESSIONAL_CATEGORIES.map((category) => ({ categoria: category.slug }));
}

export const dynamicParams = false;
// Le province con lavori cercati cambiano di ora in ora
// (docs/changelog/2026-11-17-bacheca-lavori-cercati.md).
export const dynamic = "force-dynamic";

async function boardProvinces(slug: string): Promise<BoardSummaryRow[]> {
  try {
    const { rows } = await apiClient.getRequestBoardSummary();
    return rows.filter((row) => row.trade === slug).sort((a, b) => b.count - a.count || (PROVINCE_NAMES[a.province] ?? "").localeCompare(PROVINCE_NAMES[b.province] ?? "", "it"));
  } catch {
    return [];
  }
}

function findCategory(slug: string) {
  return isProfessionalCategorySlug(slug) ? PROFESSIONAL_CATEGORIES.find((c) => c.slug === slug) : undefined;
}

export async function generateMetadata(props: { params: Promise<PageParams> }): Promise<Metadata> {
  const category = findCategory((await props.params).categoria);
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

export default async function WorkWithUsPage(props: { params: Promise<PageParams> }) {
  const category = findCategory((await props.params).categoria);
  if (!category) notFound();
  const noun = CATEGORY_SEO_NOUN[category.slug];
  const provinces = await boardProvinces(category.slug);
  const breadcrumbs = breadcrumbJsonLd([
    { label: "Home", href: "/" },
    { label: "Per i professionisti", href: "/per-professionisti" },
    { label: noun.workTitle },
  ]);

  return (
    <div className="price-page">
      <JsonLd data={breadcrumbs} />
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
      {provinces.length > 0 ? (
        <section aria-labelledby="lavori-cercati">
          <h2 id="lavori-cercati" className={boardStyles.boxTitle}>
            Lavori cercati adesso
          </h2>
          <p className={boardStyles.boxText}>Clienti che aspettano ancora un preventivo. Scegli la provincia per vederli.</p>
          <ul className={boardStyles.provinces}>
            {provinces.map((row) => (
              <li key={row.province}>
                <Link className={boardStyles.chip} href={`/lavora-con-noi/${category.slug}/${provinceSlug(row.province)}`}>
                  {PROVINCE_NAMES[row.province]} · {row.count}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
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
