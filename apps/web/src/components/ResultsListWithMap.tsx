"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Map as MapIcon, Maximize2, Minimize2, X } from "lucide-react";
import { findComuneByName, type ProfessionalSearchResult } from "@professionisti/shared";
import { ProfessionalCard, YStack, brand } from "@professionisti/ui";
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
  // "Espandi mappa" (riferimento miodottore.it): allarga la colonna mappa a
  // scapito della lista, solo da desktop — da mobile la mappa è già a piena
  // larghezza quando aperta, non ha senso "espanderla" ulteriormente.
  const [mapExpanded, setMapExpanded] = useState(false);
  // Leaflet inizializzato dentro un contenitore nascosto (display:none, lato
  // mobile prima del tap su "Mostra mappa") calcola un pixel-origin interno
  // corrotto che poi NON si ricalcola in modo affidabile nemmeno con
  // invalidateSize()+fitBounds successivi (verificato: marker finivano a
  // coordinate come x:-239880 e la lista restava vuota). L'unica soluzione
  // robusta è non montare affatto <ResultsMap> finché non sarà davvero
  // visibile: da mobile solo dopo il tap, da desktop solo una volta
  // rilevato via matchMedia di essere sopra la soglia dei 700px.
  const [shouldMountMap, setShouldMountMap] = useState(false);

  useEffect(() => {
    if (mobileMapOpen) setShouldMountMap(true);
  }, [mobileMapOpen]);

  useEffect(() => {
    const mql = window.matchMedia("(min-width: 700px)");
    if (mql.matches) setShouldMountMap(true);
    function handleChange(e: MediaQueryListEvent) {
      if (e.matches) setShouldMountMap(true);
    }
    mql.addEventListener("change", handleChange);
    return () => mql.removeEventListener("change", handleChange);
  }, []);

  function handleBoundsChange(bounds: MapBounds) {
    // Su mobile la mappa parte chiusa (display:none) ma resta montata: Leaflet
    // inizializzato in un contenitore di dimensione zero calcola un
    // inquadramento degenere (nord/sud e/o est/ovest coincidenti), che
    // filtrerebbe fuori tutti i professionisti dalla lista pur mostrando il
    // conteggio corretto nell'intestazione — bug reale riscontrato dall'utente
    // (14 professionisti trovati ma lista vuota). Ignoriamo un inquadramento
    // di questo tipo invece di applicarlo.
    if (!(bounds.north > bounds.south) || !(bounds.east > bounds.west)) return;
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
    // (mappa sopra la lista su schermi stretti, mappa a destra altrimenti)
    // sia rendere la mappa sticky e sempre aperta SOLO sopra la soglia — cose
    // che i props Tamagui non esprimono direttamente (niente `order`,
    // `position:"sticky"` non tipizzato). Soglia a 700px (non lo `$gtMd` di
    // Tamagui, 1021px): quella era pensata per nascondere la mappa del tutto
    // sotto una certa larghezza, ma con l'affiancamento a colonne una finestra
    // desktop "normale" (~1000px, non a schermo intero) ricadeva comunque
    // sotto i 1021px e mostrava il layout impilato da mobile — sbagliato, non
    // era uno schermo stretto. 700px isola davvero solo i telefoni.
    <div className="results-layout">
      {showMap ? (
        <button type="button" className="mobile-map-toggle" onClick={() => setMobileMapOpen((v) => !v)}>
          {mobileMapOpen ? <X size={16} strokeWidth={1.5} /> : <MapIcon size={16} strokeWidth={1.5} />}
          {mobileMapOpen ? "Nascondi mappa" : "Mostra mappa"}
        </button>
      ) : null}

      {showMap ? (
        <div className={`results-map-col${mobileMapOpen ? " mobile-open" : ""}${mapExpanded ? " expanded" : ""}`}>
          <div className="results-map-sticky">
            <button type="button" className="map-expand-toggle" onClick={() => setMapExpanded((v) => !v)}>
              {mapExpanded ? <Minimize2 size={14} strokeWidth={1.5} /> : <Maximize2 size={14} strokeWidth={1.5} />}
              {mapExpanded ? "Riduci mappa" : "Espandi mappa"}
            </button>
            <YStack width="100%" height="100%" borderRadius="$4" overflow="hidden" borderWidth={1} borderColor={brand.filetto}>
              {shouldMountMap ? (
                <ResultsMap
                  professionals={pool}
                  initialProfessionals={professionals}
                  fallbackCenter={fallbackCenter}
                  onBoundsChange={handleBoundsChange}
                />
              ) : null}
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
              subTags={pro.subTags}
              rating={pro.rating ?? undefined}
              reviewCount={pro.reviewCount}
              verified={pro.verified}
              remoteAvailable={pro.remoteAvailable}
              services={pro.services}
              availabilityPreview={pro.availabilityPreview}
              nextAvailableSlot={pro.nextAvailableSlot}
              onPress={() => router.push(`/professionista/${pro.id}`)}
              onSlotPress={() => router.push(`/professionista/${pro.id}#agenda`)}
              icon={<ProfessionalAvatar imageUrl={pro.imageUrl} categorySlug={pro.categorySlug} size={88} />}
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
          border-radius: 4px;
          border: 1px solid ${brand.filetto};
          background: ${brand.calce};
          color: ${brand.grafite};
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
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
          position: relative;
        }
        .map-expand-toggle {
          display: none;
        }
        .results-list-col {
          width: 100%;
          min-width: 0;
        }
        @media (min-width: 700px) {
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
            width: 40%;
            max-width: 480px;
            min-width: 260px;
            flex-shrink: 0;
            order: 2;
            transition: max-width 220ms cubic-bezier(0.2, 0.8, 0.2, 1);
          }
          .results-map-col.expanded {
            width: 58%;
            max-width: 760px;
          }
          .results-map-sticky {
            position: sticky;
            top: 24px;
            height: calc(100vh - 140px);
            min-height: 420px;
          }
          .map-expand-toggle {
            display: flex;
            align-items: center;
            gap: 6px;
            position: absolute;
            top: 12px;
            right: 12px;
            z-index: 500;
            padding: 8px 12px;
            border-radius: 4px;
            border: 1px solid ${brand.filetto};
            background: ${brand.calce};
            color: ${brand.grafite};
            font-size: 12px;
            font-weight: 600;
            cursor: pointer;
          }
          .results-list-col {
            flex: 1;
            min-width: 240px;
            order: 1;
          }
        }
      `}</style>
    </div>
  );
}
