"use client";
"use no memo";

import Link from "next/link";
import { X } from "lucide-react";
import type { ProfessionalSearchResult } from "@professionisti/shared";
import { Text, XStack, YStack, brand } from "@professionisti/ui";
import { EmptySearchResults } from "@/components/EmptySearchResults";
import { ResultsListWithMap } from "@/components/ResultsListWithMap";
import { LoadErrorNotice } from "@/components/LoadErrorNotice";

export function CercaContent({
  city,
  online,
  q,
  service,
  professionals,
  allProfessionals,
  loadFailed,
  initialUrgentOnly,
}: {
  city?: string;
  online?: boolean;
  q?: string;
  /** Prestazione scelta in "Quanto costa in media" (docs/CHANGELOG.md §383). */
  service?: string;
  professionals: ProfessionalSearchResult[];
  /** Tutti i professionisti (nessun filtro città), per i puntini sulla mappa. */
  allProfessionals?: ProfessionalSearchResult[];
  /** La ricerca non è arrivata dall'API: "Riprova" invece di "nessun risultato". */
  loadFailed?: boolean;
  /** Preimpostato dall'URL (?urgente=1) quando si arriva dal toggle "Intervento urgente?" della homepage. */
  initialUrgentOnly?: boolean;
}) {
  const title = service
    ? city
      ? `Chi offre "${service}" a ${city}`
      : `Chi offre "${service}"`
    : online
    ? city
      ? `Consulenze online a ${city}`
      : "Consulenze online disponibili"
    : city
      ? `Professionisti a ${city}`
      : q
        ? `Risultati per "${q}"`
        : "Tutti i professionisti";

  // Richiesta esplicita dell'utente: niente scheda "Ricerca / N
  // professionisti verificati trovati" in cima ai risultati — la lista parla
  // da sola. Il riquadro resta SOLO quando non c'e' nessun risultato.
  const notice = loadFailed ? <LoadErrorNotice title="Non riusciamo a caricare i professionisti" /> : professionals.length > 0 ? null : <EmptySearchResults title={title} online={Boolean(online)} city={city} />;

  // Arrivando da una voce di "Quanto costa in media" si dice quale
  // prestazione filtra l'elenco e come tornare a vedere tutti (§383).
  const allHref = (() => {
    const params = new URLSearchParams();
    if (city) params.set("citta", city);
    if (online) params.set("online", "1");
    if (q) params.set("q", q);
    const query = params.toString();
    return query ? `/cerca?${query}` : "/cerca";
  })();
  // Il filtro si toglie dalla ✕ sulla pastiglia, come nei filtri dei grandi
  // siti: un link "Mostra tutti" si capiva come "tutti quelli del servizio"
  // (Luca, §383).
  const serviceBar = service ? (
    <XStack alignItems="center" flexWrap="wrap" gap="$2">
      <Text fontSize={15} color={brand.grafite70}>
        Servizio
      </Text>
      <Link href={allHref} className="service-chip" aria-label={`Togli il filtro ${service}`}>
        <span className="service-chip-label">{service}</span>
        <span className="service-chip-x" aria-hidden="true">
          <X size={14} strokeWidth={2.4} />
        </span>
      </Link>
      <style jsx>{`
        :global(.service-chip) {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          min-height: 40px;
          max-width: 100%;
          padding: 6px 6px 6px 14px;
          border-radius: 999px;
          border: 1px solid ${brand.cianografia};
          background-color: ${brand.cianografiaVelo};
          color: ${brand.cianografiaScuro};
          font-weight: 700;
          font-size: 15px;
          text-decoration: none;
          transition: background-color 0.15s ease;
        }
        :global(.service-chip:hover) {
          background-color: #c9ecd9;
        }
        :global(.service-chip:focus-visible) {
          outline: 2px solid ${brand.cianografiaScuro};
          outline-offset: 2px;
        }
        .service-chip-label {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .service-chip-x {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          width: 28px;
          height: 28px;
          border-radius: 999px;
          background-color: ${brand.cianografiaPieno};
          color: #fff;
        }
        @media (prefers-reduced-motion: reduce) {
          :global(.service-chip) {
            transition: none;
          }
        }
      `}</style>
    </XStack>
  ) : null;
  const header =
    serviceBar && notice ? (
      <YStack gap="$3">
        {serviceBar}
        {notice}
      </YStack>
    ) : (serviceBar ?? notice);

  return (
    <YStack width="100%" alignItems="center" backgroundColor="transparent">
      {/* Titolo principale (h1), non mostrato (docs/CHANGELOG.md §271). */}
      <h1 className="sr-only">{title}</h1>
      <YStack width="100%" maxWidth={1200} paddingHorizontal="$4" paddingVertical="$6">
        <ResultsListWithMap
          professionals={professionals}
          allProfessionals={allProfessionals}
          showMap
          city={city}
          header={header}
          defaultMode={online ? "ONLINE" : "HOME"}
          initialUrgentOnly={initialUrgentOnly}
        />
      </YStack>
    </YStack>
  );
}
