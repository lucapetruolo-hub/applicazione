import { notFound, permanentRedirect } from "next/navigation";
import type { Metadata } from "next";
import { apiClient } from "../../../lib/apiClient";
import { SITE_URL } from "@/lib/siteUrl";
import { type BreadcrumbItem } from "@/lib/jsonLd";
import { JsonLd } from "@/components/JsonLd";
import { ApiError } from "@professionisti/api-client";
import { BRAND, comuneSlug, formatRating, professionalIdFromSlug, professionalPath, professionalSlug, type ProfessionalDetail } from "@professionisti/shared";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { LoadErrorNotice } from "@/components/LoadErrorNotice";
import { ProfessionalDetailContent } from "./ProfessionalDetailContent";

// `id` è il segmento dell'indirizzo: "nome-citta-<id>" o, nei link vecchi, il
// solo id (docs/CHANGELOG.md §295, packages/shared/src/professionalUrl.ts).
type PageParams = { id: string };
type PageSearchParams = Record<string, string | string[] | undefined>;

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Query string da riportare nel redirect all'indirizzo leggibile (?modalita=, ?data=, ?salva=). */
function queryString(searchParams: PageSearchParams): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (Array.isArray(value)) value.forEach((item) => query.append(key, item));
    else if (value !== undefined) query.append(key, value);
  }
  const text = query.toString();
  return text ? `?${text}` : "";
}

/** Home › Categoria › Città › Nome: la città solo se ha la sua pagina (comune vero). */
function breadcrumbItems(professional: ProfessionalDetail): BreadcrumbItem[] {
  const citySlug = comuneSlug(professional.city);
  return [
    { label: "Home", href: "/" },
    { label: professional.categoryLabel, href: `/cerca/${professional.categorySlug}` },
    ...(citySlug ? [{ label: professional.city, href: `/cerca/${professional.categorySlug}/${citySlug}` }] : []),
    { label: professional.businessName },
  ];
}

/** Tipo schema.org per mestiere; gli altri restano "LocalBusiness". */
const SCHEMA_BUSINESS_TYPE: Partial<Record<string, string>> = {
  idraulico: "Plumber",
  elettricista: "Electrician",
  imbianchino: "HousePainter",
  fabbro: "Locksmith",
  climatizzazione: "HVACBusiness",
  muratore: "GeneralContractor",
  traslochi: "MovingCompany",
  falegname: "HomeAndConstructionBusiness",
  tuttofare: "HomeAndConstructionBusiness",
};

// Pagina profilo pubblico: SEO-critica (CLAUDE.md §5.4), SSR ad ogni richiesta
// (nessun generateStaticParams: gli id sono dinamici e crescono nel tempo).
export const dynamic = "force-dynamic";

export async function generateMetadata(props: { params: Promise<PageParams> }): Promise<Metadata> {
  const params = await props.params;
  try {
    const professional = await apiClient.getProfessional(professionalIdFromSlug(params.id));
    return {
      // Una sola pagina per profilo per Google, anche con ?modalita= o ?data=.
      alternates: { canonical: professionalPath(professional) },
      title: `${professional.businessName} — ${professional.categoryLabel} a ${professional.city}`,
      description: `${professional.businessName}: ${professional.categoryLabel.toLowerCase()} a ${professional.city}. ${
        professional.reviewCount > 0 ? `${formatRating(professional.rating ?? 0)}/5 su ${professional.reviewCount} ${professional.reviewCount === 1 ? "recensione" : "recensioni"}.` : professional.verified
          ? `Identità verificata su ${BRAND.name}.`
          : `Profilo su ${BRAND.name}.`
      }`,
      // Condividendo il profilo (WhatsApp, Facebook) la sua foto, non l'immagine del sito (collaudo N-11).
      ...(professional.imageUrl ? { openGraph: { images: [{ url: professional.imageUrl, alt: professional.businessName }] } } : {}),
    };
  } catch {
    // Profilo inesistente (404) o API ferma ("Riprova"): mai in Google.
    return { robots: { index: false, follow: false } };
  }
}

export default async function ProfessionalDetailPage(props: { params: Promise<PageParams>; searchParams: Promise<PageSearchParams> }) {
  const [params, searchParams] = await Promise.all([props.params, props.searchParams]);
  const professionalId = professionalIdFromSlug(params.id);
  // Agenda chiesta insieme al profilo e scritta dal server: arrivando dopo
  // spingeva giù la pagina (collaudo N-09, docs/changelog/2026-10-30-velocita-telefono.md).
  // Accessoria: se non risponde il profilo si apre lo stesso e il browser riprova.
  const agendaPromise = apiClient.getProfessionalAgenda(professionalId).then(
    (agenda) => (agenda && Array.isArray(agenda.days) ? agenda : null),
    () => null,
  );
  let professional: ProfessionalDetail;
  try {
    professional = await apiClient.getProfessional(professionalId);
  } catch (err) {
    // "Non trovata" solo se l'API dice che il profilo non c'è. Se l'API non
    // risponde: "Riprova", non un falso 404 (docs/CHANGELOG.md §284).
    if (err instanceof ApiError && (err.status === 404 || err.status === 400)) notFound();
    return (
      <div style={{ width: "100%", maxWidth: 720, margin: "0 auto", padding: "48px 16px" }}>
        <LoadErrorNotice title="Non riusciamo a caricare questo profilo" backHref="/cerca" backLabel="Torna alla ricerca" />
      </div>
    );
  }

  // Link vecchi (solo id) o nome/città cambiati: redirect permanente
  // all'indirizzo leggibile attuale, con la stessa query (il #frammento lo
  // conserva il browser). Fuori dal try: il redirect di Next è un'eccezione.
  if (params.id !== professionalSlug(professional)) {
    permanentRedirect(`${professionalPath(professional)}${queryString(searchParams)}`);
  }

  // JSON-LD (Fase 6, SEO): LocalBusiness è il tipo schema.org corretto per
  // un professionista/attività locale — abilita rich result (stelle, zona)
  // nei risultati Google. Solo città come indirizzo (`addressLocality`),
  // mai la via esatta: stessa scelta già fatta per la UI del profilo
  // (CLAUDE.md §10, Fase 5 — "nessun indirizzo esposto senza motivo").
  const jsonLd = {
    "@context": "https://schema.org",
    // Tipo preciso quando schema.org lo ha ("Plumber"…), così Google sa che
    // mestiere è (collaudo N-10, docs/changelog/2026-10-30-velocita-telefono.md).
    "@type": SCHEMA_BUSINESS_TYPE[professional.categorySlug] ?? "LocalBusiness",
    areaServed: { "@type": "City", name: professional.city },
    name: professional.businessName,
    url: `${SITE_URL}${professionalPath(professional)}`,
    ...(professional.imageUrl ? { image: professional.imageUrl } : {}),
    address: { "@type": "PostalAddress", addressLocality: professional.city, addressCountry: "IT" },
    ...(professional.reviewCount > 0 && professional.rating !== null
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: professional.rating,
            reviewCount: professional.reviewCount,
          },
        }
      : {}),
  };

  return (
    <>
      <JsonLd data={jsonLd} />
      {/* `?modalita=` (tab dell'agenda arrivando da una ricerca "Online"),
          `?data=` e `?salva=` passati dal server: senza useSearchParams non
          serve un <Suspense> e il profilo arriva nell'ordine della pagina,
          prima del piè di pagina (docs/CHANGELOG.md §400). */}
      <ProfessionalDetailContent
        professional={professional}
        initialAgenda={await agendaPromise}
        breadcrumbs={<Breadcrumbs items={breadcrumbItems(professional)} />}
        query={{ modalita: firstValue(searchParams.modalita), data: firstValue(searchParams.data), salva: firstValue(searchParams.salva), servizio: firstValue(searchParams.servizio) }}
      />
    </>
  );
}
