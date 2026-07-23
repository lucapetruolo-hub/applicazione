"use client";

import { useMemo, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { findComuneByName, type ProfessionalSearchResult } from "@professionisti/shared";
import { ProfessionalCard, XStack, YStack } from "@professionisti/ui";
import { ProfessionalAvatar } from "@/components/ProfessionalAvatar";
import type { MapBounds } from "./ResultsMap";

// Leaflet legge `window` al modulo: mai importato lato server (CLAUDE.md
// §5.4 vale per l'SEO delle pagine, non per un widget lato client come
// questo — niente da indicizzare in una mappa interattiva).
const ResultsMap = dynamic(() => import("./ResultsMap").then((mod) => mod.ResultsMap), { ssr: false });

export function ResultsListWithMap({
  professionals,
  allProfessionals,
  showMap,
  city,
  header,
}: {
  /** Risultati della ricerca corrente (es. filtrati per città): usati per il primo render e come base della mappa. */
  professionals: ProfessionalSearchResult[];
  /**
   * Tutti i professionisti disponibili per il puntinamento sulla mappa (es. stessa categoria, nessun filtro città).
   * Muovendo/zoomando la mappa la colonna a sinistra si aggiorna mostrando chi è visibile nell'inquadratura corrente.
   * Default: `professionals` (nessun professionista aggiuntivo oltre ai risultati della ricerca).
   */
  allProfessionals?: ProfessionalSearchResult[];
  showMap: boolean;
  /** Città cercata: se non ci sono professionisti con coordinate, la mappa zooma comunque qui invece di sparire. */
  city?: string;
  /** Contenuto mostrato in cima alla colonna sinistra, allineato con l'inizio della mappa (titolo/filtri categoria). */
  header?: ReactNode;
}) {
  const router = useRouter();
  const fallbackCenter = useMemo<[number, number] | undefined>(() => {
    const comune = city ? findComuneByName(city) : undefined;
    return comune ? [comune.lat, comune.lon] : undefined;
  }, [city]);
  const pool = allProfessionals ?? professionals;

  const [visible, setVisible] = useState(professionals);

  function handleBoundsChange(bounds: MapBounds) {
    const within = pool.filter(
      (pro) =>
        (pro.latitude !== 0 || pro.longitude !== 0) &&
        pro.latitude <= bounds.north &&
        pro.latitude >= bounds.south &&
        pro.longitude <= bounds.east &&
        pro.longitude >= bounds.west,
    );
    setVisible(within);
  }

  // Ranking già applicato da apiClient.searchProfessionals (boost→rating→recensioni):
  // manteniamo lo stesso ordine anche nel sottoinsieme filtrato per inquadratura mappa.
  const orderedVisible = useMemo(() => {
    const order = new Map(pool.map((pro, index) => [pro.id, index]));
    return [...visible].sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  }, [visible, pool]);

  return (
    <XStack width="100%" gap="$5" alignItems="flex-start" flexWrap="wrap">
      <YStack flex={1} minWidth={280} gap="$3">
        {header}
        {(showMap ? orderedVisible : professionals).map((pro) => (
          <ProfessionalCard
            key={pro.id}
            businessName={pro.businessName}
            categoryLabel={pro.categoryLabel}
            city={pro.city}
            rating={pro.rating ?? undefined}
            verified={pro.verified}
            remoteAvailable={pro.remoteAvailable}
            onPress={() => router.push(`/professionista/${pro.id}`)}
            icon={<ProfessionalAvatar imageUrl={pro.imageUrl} categorySlug={pro.categorySlug} size={44} />}
          />
        ))}
      </YStack>

      {showMap ? (
        <YStack width={480} flexShrink={0} display="none" $gtMd={{ display: "flex" }}>
          {/* position:sticky non è tipizzato dai props Tamagui (vedi nota storica
              in ResultsMap): applicato via style CSS grezzo su un div nudo. */}
          <div style={{ position: "sticky", top: 24, width: "100%" }}>
            <YStack
              width="100%"
              height="calc(100vh - 140px)"
              minHeight={480}
              borderRadius="$6"
              overflow="hidden"
              borderWidth={1}
              borderColor="$borderColor"
            >
              <ResultsMap
                professionals={pool}
                initialProfessionals={professionals}
                fallbackCenter={fallbackCenter}
                onBoundsChange={handleBoundsChange}
              />
            </YStack>
          </div>
        </YStack>
      ) : null}
    </XStack>
  );
}
