import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { apiClient } from "../../../lib/apiClient";
import { SITE_URL } from "@/lib/siteUrl";
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
        professional.reviewCount > 0 ? `${professional.rating}/5 su ${professional.reviewCount} recensioni.` : "Profilo verificato su Professionisti."
      }`,
    };
  } catch {
    return {};
  }
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
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
        <ProfessionalDetailContent professional={professional} />
      </>
    );
  } catch {
    notFound();
  }
}
