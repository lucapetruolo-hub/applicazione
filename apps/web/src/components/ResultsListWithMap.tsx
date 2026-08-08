"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, Map as MapIcon, Maximize2, Minimize2, SlidersHorizontal, X } from "lucide-react";
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
  defaultMode,
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
  /** Tab di default della mini-agenda di ogni card (richiesta esplicita dell'utente): "a domicilio" se cercato a domicilio, "online" se cercato online. */
  defaultMode?: "HOME" | "ONLINE";
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

  // Pannello filtri (richiesta esplicita dell'utente, riferimento
  // miodottore.it: bottone "Filtri" sopra "Mostra mappa", apre un pannello
  // con "Consulenza online", "Date disponibili" e "Lingua parlata"). Tutto
  // calcolato client-side sui risultati già scaricati, nessun nuovo query
  // param lato server — stesso principio già seguito per ListControls
  // (filtro/ordina/mostra) nelle liste richieste/prenotazioni.
  const [showFilters, setShowFilters] = useState(false);
  const [filterOnlineOnly, setFilterOnlineOnly] = useState(false);
  const [filterAvailability, setFilterAvailability] = useState<"any" | "today" | "3days">("any");
  const [languageQuery, setLanguageQuery] = useState("");
  const [selectedLanguage, setSelectedLanguage] = useState<string | null>(null);
  // Sezioni ad accordion (richiesta esplicita dell'utente, riferimento
  // miodottore.it): un titolo per sezione, click per espandere/richiudere
  // — "Consulenza online" aperta di default (stesso comportamento del
  // riferimento), le altre due chiuse finché non si clicca il titolo.
  const [expandedSection, setExpandedSection] = useState<"online" | "availability" | "language" | null>("online");

  // Popup centrato (richiesta esplicita dell'utente), stesso pattern
  // overlay già in uso altrove nel prodotto (BookingDetailPanel,
  // ClientProfileModal, SlotEditorModal): role="dialog", chiusura con
  // Escape o click sul backdrop.
  useEffect(() => {
    if (!showFilters) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setShowFilters(false);
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [showFilters]);

  // Solo le lingue effettivamente parlate tra i professionisti nei
  // risultati correnti (richiesta esplicita dell'utente), filtrate dal
  // testo digitato.
  const availableLanguages = useMemo(() => {
    const all = new Set<string>();
    for (const pro of professionals) {
      for (const lang of pro.spokenLanguages) all.add(lang);
    }
    const list = Array.from(all).sort((a, b) => a.localeCompare(b, "it"));
    const query = languageQuery.trim().toLowerCase();
    return query ? list.filter((lang) => lang.toLowerCase().includes(query)) : list;
  }, [professionals, languageQuery]);

  function hasAvailabilityWithinDays(pro: ProfessionalSearchResult, maxDayOffset: number): boolean {
    return pro.availabilityPreview
      .slice(0, maxDayOffset + 1)
      .some((day) => day.times.some((slot) => slot.homeAvailable || slot.onlineAvailable));
  }

  function matchesFilters(pro: ProfessionalSearchResult): boolean {
    if (filterOnlineOnly && !pro.remoteAvailable) return false;
    if (filterAvailability === "today" && !hasAvailabilityWithinDays(pro, 0)) return false;
    if (filterAvailability === "3days" && !hasAvailabilityWithinDays(pro, 2)) return false;
    if (selectedLanguage && !pro.spokenLanguages.includes(selectedLanguage)) return false;
    return true;
  }

  const activeFilterCount = (filterOnlineOnly ? 1 : 0) + (filterAvailability !== "any" ? 1 : 0) + (selectedLanguage ? 1 : 0);
  // Conteggio live per il bottone "Mostra N risultati" in fondo al pop-up
  // (richiesta esplicita dell'utente, riferimento miodottore.it).
  const filteredResultsCount = (showMap ? orderedVisible : professionals).filter(matchesFilters).length;

  function toggleSection(section: "online" | "availability" | "language") {
    setExpandedSection((prev) => (prev === section ? null : section));
  }

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
      <button type="button" className="filters-toggle" onClick={() => setShowFilters((v) => !v)}>
        <SlidersHorizontal size={16} strokeWidth={1.5} />
        Filtri{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
      </button>

      {showFilters ? (
        <div className="filters-backdrop" onClick={() => setShowFilters(false)} role="dialog" aria-modal="true" aria-label="Filtri">
          <div className="filters-modal" onClick={(e) => e.stopPropagation()}>
            <div className="filters-modal-header">
              <span className="filters-modal-title">Filtri</span>
              <button type="button" className="filters-modal-close" onClick={() => setShowFilters(false)} aria-label="Chiudi">
                <X size={18} strokeWidth={1.5} />
              </button>
            </div>

            <div className="filters-modal-body">
              {/* Sezione ad accordion (richiesta esplicita dell'utente,
                  riferimento miodottore.it): titolo cliccabile con
                  chevron, il contenuto compare solo da espansa. */}
              <div className="filters-section">
                <button type="button" className="filters-section-header" onClick={() => toggleSection("online")}>
                  <span className="filters-section-title">Consulenza online</span>
                  {expandedSection === "online" ? <ChevronUp size={18} strokeWidth={1.5} /> : <ChevronDown size={18} strokeWidth={1.5} />}
                </button>
                {expandedSection === "online" ? (
                  <div className="filters-section-content">
                    <label className="filters-toggle-row">
                      <span>Mostra tutti i professionisti che offrono consulenza online</span>
                      <span
                        className={`filters-switch${filterOnlineOnly ? " on" : ""}`}
                        onClick={() => setFilterOnlineOnly((v) => !v)}
                        role="switch"
                        aria-checked={filterOnlineOnly}
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setFilterOnlineOnly((v) => !v);
                          }
                        }}
                      >
                        <span className="filters-switch-knob" />
                      </span>
                    </label>
                  </div>
                ) : null}
              </div>

              <div className="filters-section">
                <button type="button" className="filters-section-header" onClick={() => toggleSection("availability")}>
                  <span className="filters-section-title">Date disponibili</span>
                  {expandedSection === "availability" ? (
                    <ChevronUp size={18} strokeWidth={1.5} />
                  ) : (
                    <ChevronDown size={18} strokeWidth={1.5} />
                  )}
                </button>
                {expandedSection === "availability" ? (
                  <div className="filters-section-content">
                    <div className="filters-pill-row">
                      {(
                        [
                          { value: "any", label: "Qualsiasi giorno" },
                          { value: "today", label: "Oggi" },
                          { value: "3days", label: "Entro 3 giorni" },
                        ] as const
                      ).map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          className={`filters-pill${filterAvailability === opt.value ? " active" : ""}`}
                          onClick={() => setFilterAvailability(opt.value)}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="filters-section">
                <button type="button" className="filters-section-header" onClick={() => toggleSection("language")}>
                  <span className="filters-section-title">Lingua parlata</span>
                  {expandedSection === "language" ? <ChevronUp size={18} strokeWidth={1.5} /> : <ChevronDown size={18} strokeWidth={1.5} />}
                </button>
                {expandedSection === "language" ? (
                  <div className="filters-section-content">
                    <input
                      type="text"
                      className="filters-text-input"
                      value={languageQuery}
                      onChange={(e) => setLanguageQuery(e.target.value)}
                      placeholder="Cerca una lingua..."
                    />
                    <div className="filters-pill-row">
                      {selectedLanguage ? (
                        <button type="button" className="filters-pill active" onClick={() => setSelectedLanguage(null)}>
                          {selectedLanguage} ✕
                        </button>
                      ) : (
                        availableLanguages.map((lang) => (
                          <button key={lang} type="button" className="filters-pill" onClick={() => setSelectedLanguage(lang)}>
                            {lang}
                          </button>
                        ))
                      )}
                      {!selectedLanguage && availableLanguages.length === 0 ? (
                        <span className="filters-empty">Nessuna lingua trovata tra i professionisti in questi risultati.</span>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="filters-modal-footer">
              {activeFilterCount > 0 ? (
                <button
                  type="button"
                  className="filters-reset"
                  onClick={() => {
                    setFilterOnlineOnly(false);
                    setFilterAvailability("any");
                    setLanguageQuery("");
                    setSelectedLanguage(null);
                  }}
                >
                  Reimposta filtri
                </button>
              ) : null}
              <button type="button" className="filters-apply" onClick={() => setShowFilters(false)}>
                Mostra {filteredResultsCount} risultat{filteredResultsCount === 1 ? "o" : "i"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

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
          {(showMap ? orderedVisible : professionals).filter(matchesFilters).map((pro) => (
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
              nextAvailableSlotHome={pro.nextAvailableSlotHome}
              nextAvailableSlotOnline={pro.nextAvailableSlotOnline}
              defaultMode={defaultMode}
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
        .mobile-map-toggle,
        .filters-toggle {
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
        .filters-backdrop {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(20, 24, 30, 0.55);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 16px;
        }
        .filters-modal {
          width: 100%;
          max-width: 420px;
          max-height: calc(100vh - 32px);
          border-radius: 8px;
          border: 1px solid ${brand.filetto};
          background: ${brand.calce};
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .filters-modal-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 20px;
          border-bottom: 1px solid ${brand.filetto};
          flex-shrink: 0;
        }
        .filters-modal-title {
          font-size: 18px;
          font-weight: 800;
          color: ${brand.grafite};
        }
        .filters-modal-close {
          border: none;
          background: transparent;
          color: ${brand.grafite70};
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 4px;
        }
        .filters-modal-body {
          padding: 0 20px;
          display: flex;
          flex-direction: column;
          overflow-y: auto;
        }
        .filters-modal-footer {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 10px;
          padding: 16px 20px;
          border-top: 1px solid ${brand.filetto};
          flex-shrink: 0;
        }
        .filters-reset {
          border: none;
          background: transparent;
          color: ${brand.grafite70};
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          text-decoration: underline;
        }
        .filters-apply {
          width: 100%;
          padding: 14px 20px;
          border-radius: 999px;
          border: none;
          background: ${brand.cianografia};
          color: #ffffff;
          font-size: 15px;
          font-weight: 700;
          cursor: pointer;
        }
        .filters-section {
          border-bottom: 1px solid ${brand.filetto};
        }
        .filters-section:last-child {
          border-bottom: none;
        }
        .filters-section-header {
          width: 100%;
          padding: 18px 0;
          border: none;
          background: transparent;
          display: flex;
          align-items: center;
          justify-content: space-between;
          cursor: pointer;
          color: ${brand.grafite70};
        }
        .filters-section-title {
          font-size: 15px;
          font-weight: 700;
          color: ${brand.grafite};
        }
        .filters-section-content {
          display: flex;
          flex-direction: column;
          gap: 12px;
          padding-bottom: 18px;
        }
        .filters-toggle-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          font-size: 14px;
          color: ${brand.grafite};
          cursor: pointer;
        }
        .filters-switch {
          flex-shrink: 0;
          width: 44px;
          height: 26px;
          border-radius: 999px;
          background: ${brand.filetto};
          position: relative;
          cursor: pointer;
          transition: background 150ms ease;
        }
        .filters-switch.on {
          background: ${brand.cianografia};
        }
        .filters-switch-knob {
          position: absolute;
          top: 3px;
          left: 3px;
          width: 20px;
          height: 20px;
          border-radius: 999px;
          background: #ffffff;
          transition: transform 150ms ease;
        }
        .filters-switch.on .filters-switch-knob {
          transform: translateX(18px);
        }
        .filters-pill-row {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        .filters-pill {
          padding: 6px 12px;
          border-radius: 999px;
          border: 1px solid ${brand.filetto};
          background: ${brand.gesso};
          color: ${brand.grafite};
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
        }
        .filters-pill.active {
          background: ${brand.cianografia};
          border-color: ${brand.cianografia};
          color: #ffffff;
        }
        .filters-text-input {
          padding: 10px 12px;
          border-radius: 4px;
          border: 1px solid ${brand.filetto};
          background: ${brand.calce};
          color: ${brand.grafite};
          font-size: 14px;
          font-family: inherit;
        }
        .filters-empty {
          font-size: 13px;
          color: ${brand.grafite70};
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
