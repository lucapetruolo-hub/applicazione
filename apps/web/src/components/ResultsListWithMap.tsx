"use client";

import { useMemo, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { findComuneByName, type ProfessionalSearchResult } from "@professionisti/shared";
import { ProfessionalCard, YStack } from "@professionisti/ui";
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
  // Da mobile la mappa parte chiusa: si apre solo toccando il bottone nella
  // barra in alto, invece di occupare subito spazio verticale sotto la
  // ricerca. Da desktop ($gtMd) resta sempre visibile a fianco della lista,
  // indipendentemente da questo stato (vedi regola CSS dedicata sotto).
  const [mobileMapOpen, setMobileMapOpen] = useState(false);

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
    // Layout con classi CSS grezze (styled-jsx, incluso in Next.js) invece dei
    // props responsive di Tamagui: qui serve sia riordinare le due colonne
    // (mappa sopra la lista su mobile, mappa a destra su desktop) sia rendere
    // la mappa sticky e sempre aperta SOLO da desktop in su — cose che i props
    // Tamagui non esprimono direttamente (niente `order`, `position:"sticky"`
    // non tipizzato). 1021px = soglia esatta di `$gtMd` in
    // packages/ui/src/config.ts, per restare coerenti con gli altri breakpoint
    // già usati nella pagina.
    <div className="results-layout">
      {showMap ? (
        <button type="button" className="mobile-map-toggle" onClick={() => setMobileMapOpen((v) => !v)}>
          {mobileMapOpen ? "✕ Nascondi mappa" : "🗺️ Mostra mappa"}
        </button>
      ) : null}

      {showMap ? (
        <div className={`results-map-col${mobileMapOpen ? " mobile-open" : ""}`}>
          <div className="results-map-sticky">
            <YStack width="100%" height="100%" borderRadius="$6" overflow="hidden" borderWidth={1} borderColor="$borderColor">
              <ResultsMap
                professionals={pool}
                initialProfessionals={professionals}
                fallbackCenter={fallbackCenter}
                onBoundsChange={handleBoundsChange}
              />
            </YStack>
          </div>
        </div>
      ) : null}

      <div className="results-list-col">
        <YStack gap="$3">
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
      </div>

      <style jsx>{`
        .results-layout {
          display: flex;
          flex-direction: column;
          gap: 16px;
          width: 100%;
        }
        .mobile-map-toggle {
          width: 100%;
          padding: 12px 16px;
          border-radius: 999px;
          border: 1px solid #d0d5dd;
          background: white;
          font-size: 15px;
          font-weight: 600;
          cursor: pointer;
        }
        .results-map-col {
          display: none;
          width: 100%;
          flex-shrink: 0;
        }
        .results-map-col.mobile-open {
          display: flex;
        }
        .results-map-sticky {
          width: 100%;
          height: 320px;
        }
        .results-list-col {
          width: 100%;
          min-width: 0;
        }
        @media (min-width: 1021px) {
          .results-layout {
            flex-direction: row;
            align-items: flex-start;
            gap: 20px;
          }
          .mobile-map-toggle {
            display: none;
          }
          .results-map-col,
          .results-map-col.mobile-open {
            display: flex;
            width: 480px;
            order: 2;
          }
          .results-map-sticky {
            position: sticky;
            top: 24px;
            height: calc(100vh - 140px);
            min-height: 480px;
          }
          .results-list-col {
            flex: 1;
            min-width: 280px;
            order: 1;
          }
        }
      `}</style>
    </div>
  );
}
