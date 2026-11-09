import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { ApiError } from "@professionisti/api-client";
import { PERSONAL_LINK_PARAM, professionalPath } from "@professionisti/shared";
import { apiClient } from "@/lib/apiClient";
import { LoadErrorNotice } from "@/components/LoadErrorNotice";

/**
 * Link personale del professionista, `/p/<codice>`
 * (docs/changelog/2026-11-08-canale-del-professionista.md): porta al suo
 * profilo con `?link=1`, che il profilo ricorda nella scheda del browser.
 * Mai indicizzato: la pagina vera è il profilo.
 */
export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function PersonalLinkPage(props: { params: Promise<{ code: string }> }) {
  const { code } = await props.params;
  let pro: { id: string; businessName: string; city: string | null };
  try {
    pro = await apiClient.resolvePersonalLink(code);
  } catch (err) {
    if (err instanceof ApiError && (err.status === 404 || err.status === 400)) notFound();
    return (
      <div style={{ width: "100%", maxWidth: 720, margin: "0 auto", padding: "48px 16px" }}>
        <LoadErrorNotice title="Non riusciamo ad aprire questo link" backHref="/cerca" backLabel="Cerca un professionista" />
      </div>
    );
  }
  // Fuori dal try: il redirect di Next è un'eccezione.
  redirect(`${professionalPath(pro)}?${PERSONAL_LINK_PARAM}=1`);
}
