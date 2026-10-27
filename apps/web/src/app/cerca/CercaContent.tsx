"use client";

import Link from "next/link";
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
  const serviceBar = service ? (
    <XStack
      alignItems="center"
      justifyContent="space-between"
      flexWrap="wrap"
      gap="$2"
      backgroundColor={brand.calce}
      borderWidth={1}
      borderColor={brand.filetto}
      borderRadius={10}
      paddingVertical="$3"
      paddingHorizontal="$4"
    >
      <Text fontSize={16} color={brand.grafite} flexShrink={1}>
        Chi offre <Text fontWeight="700">{service}</Text>
      </Text>
      <Link href={allHref} style={{ color: brand.cianografiaScuro, fontWeight: 700, fontSize: 15, textDecoration: "underline", textUnderlineOffset: 3 }}>
        Mostra tutti i professionisti
      </Link>
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
