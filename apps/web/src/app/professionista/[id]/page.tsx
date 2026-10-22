import { Suspense } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { apiClient } from "../../../lib/apiClient";
import { SITE_URL } from "@/lib/siteUrl";
import { ApiError } from "@professionisti/api-client";
import { BRAND } from "@professionisti/shared";
import { LoadErrorNotice } from "@/components/LoadErrorNotice";
import { ProfessionalDetailContent } from "./ProfessionalDetailContent";

type PageParams = { id: string };

// Pagina profilo pubblico: SEO-critica (CLAUDE.md §5.4), SSR ad ogni richiesta
// (nessun generateStaticParams: gli id sono dinamici e crescono nel tempo).
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: PageParams }): Promise<Metadata> {
  try {
    const professional = await apiClient.getProfessional(params.id);
    return {
      title: `${professional.businessName} — ${professional.categoryLabel} a ${professional.city}`,
      description: `${professional.businessName}: ${professional.categoryLabel.toLowerCase()} a ${professional.city}. ${
        professional.reviewCount > 0 ? `${professional.rating}/5 su ${professional.reviewCount} recensioni.` : professional.verified
          ? `Profilo verificato su ${BRAND.name}.`
          : `Profilo su ${BRAND.name}.`
      }`,
    };
  } catch {
    return {};
  }
}

/**
 * JSON dentro un `<script>`: `<` diventa `\u003c`, così un nome attività con
 * "</script>" non chiude lo script e non inserisce HTML nella pagina (XSS,
 * docs/CHANGELOG.md §283). Il JSON resta identico per chi lo legge.
 */
function jsonForScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}

export default async function ProfessionalDetailPage({ params }: { params: PageParams }) {
  try {
    const professional = await apiClient.getProfessional(params.id);
    // JSON-LD (Fase 6, SEO): LocalBusiness è il tipo schema.org corretto per
    // un professionista/attività locale — abilita rich result (stelle, zona)
    // nei risultati Google. Solo città come indirizzo (`addressLocality`),
    // mai la via esatta: stessa scelta già fatta per la UI del profilo
    // (CLAUDE.md §10, Fase 5 — "nessun indirizzo esposto senza motivo").
    const jsonLd = {
      "@context": "https://schema.org",
      "@type": "LocalBusiness",
      name: professional.businessName,
      url: `${SITE_URL}/professionista/${professional.id}`,
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
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonForScript(jsonLd) }} />
        {/* Suspense richiesto da useSearchParams (App Router) in
            ProfessionalDetailContent — legge `?modalita=` per preselezionare
            il tab dell'agenda quando si arriva da una ricerca "Online". */}
        <Suspense fallback={null}>
          <ProfessionalDetailContent professional={professional} />
        </Suspense>
      </>
    );
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
}
