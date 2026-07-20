import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { apiClient } from "../../../lib/apiClient";
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
    return <ProfessionalDetailContent professional={professional} />;
  } catch {
    notFound();
  }
}
