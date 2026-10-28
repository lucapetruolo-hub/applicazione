"use client";
"use no memo";

import { useEffect, useState, type FocusEvent, type ReactNode } from "react";
import { SERVICE_PRICE_UNIT_LABEL, formatServicePriceRange, type ServicePriceIndexEntry } from "@professionisti/shared";
import { Search } from "lucide-react";
import { Section, Text, XStack, YStack, brand, radiusDoc } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { readLastSearchCity } from "@/lib/lastSearchCity";
import { countPriceToolEntry } from "@/lib/siteCounts";

type PriceEntry = ServicePriceIndexEntry;

/** Indirizzo dell'elenco di chi offre la voce, nella città dell'ultima ricerca se c'è (§398). */
function entryHref(name: string, city: string | null): string {
  const params = new URLSearchParams({ servizio: name });
  if (city) params.set("citta", city);
  return `/cerca?${params.toString()}`;
}

/**
 * Micro-tool "Quanto costa in media" (richiesta esplicita dell'utente):
 * elenco delle prestazioni realmente inserite dai professionisti, visibile
 * subito senza dover scrivere nulla, filtrabile scrivendo — mai un dato
 * finto, il range basso-alto viene da `GET /professionals/services/price-index`
 * (aggregazione reale su `ProfessionalService`, apps/api). Nessuna nuova
 * chiamata ad ogni tasto premuto: un solo fetch iniziale, filtro client-side
 * (stessa scala di lancio già documentata per ListControls/pannello filtri
 * ricerca, CLAUDE.md §23).
 */
// Solo le 10 prestazioni più inserite dai professionisti quando l'elenco è
// a riposo (richiesta esplicita dell'utente) — l'elenco completo, scorribile,
// compare solo quando si clicca nel campo per scrivere (vedi showFullList).
const IDLE_VISIBLE_COUNT = 10;

/**
 * In homepage sotto i prezzi ci sono anche le domande frequenti (`children`),
 * prima sezione a parte (docs/CHANGELOG.md §219).
 */
export function PriceEstimatorTool({ children }: { children?: ReactNode }) {
  const [entries, setEntries] = useState<PriceEntry[] | null>(null);
  const [query, setQuery] = useState("");
  // Campo attivo (a fuoco) o con del testo scritto: solo in quel caso si
  // apre l'elenco completo scorribile — richiesta esplicita dell'utente
  // ("il resto mettilo solo a comparsa... quando si clicca per scriverci
  // che può scorrere"). Resta espanso finché resta a fuoco o c'è del testo,
  // torna ai primi 10 solo quando si lascia il campo vuoto e senza fuoco.
  // Conta anche il fuoco sulle voci (sono link): passando con Tab dal campo
  // a una voce l'elenco non deve richiudersi sotto il dito.
  const [isFocused, setIsFocused] = useState(false);
  const handleBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsFocused(false);
  };
  const showFullList = isFocused || query.trim().length > 0;
  // Città dell'ultima ricerca su questo browser: il clic apre già la zona
  // giusta, senza obbligarla (si cambia dalla pagina dei risultati).
  const [lastCity, setLastCity] = useState<string | null>(null);

  useEffect(() => {
    apiClient
      .getServicePriceIndex()
      .then((loaded) => {
        setLastCity(readLastSearchCity());
        setEntries(loaded);
      })
      .catch(() => setEntries([]));
  }, []);

  // Nessun dato reale ancora (piattaforma agli inizi, §7): il tool non ha
  // senso da mostrare finché nessun professionista ha inserito un prezzo,
  // stesso principio già seguito per la vetrina professionisti/social proof
  // (mai una sezione vuota o con dati inventati). In quel caso mostriamo un
  // invito utile (richiedi un preventivo) invece di sparire lasciando un
  // vuoto nella pagina — il problema non era il null in sé ma l'effetto
  // "buco bianco" segnalato in audit.
  const isEmpty = entries !== null && entries.length === 0;

  // "Più inserite" = da più professionisti diversi (professionalCount) —
  // ordinamento usato solo per l'elenco a riposo (i primi 10), l'elenco
  // completo filtrato dalla ricerca resta nell'ordine restituito dall'API.
  // Prima le voci con i prezzi: sono quelle che rispondono alla domanda.
  const mostAdded = [...(entries ?? [])].sort((a, b) => Number(b.price !== null) - Number(a.price !== null) || b.professionalCount - a.professionalCount);

  const filtered = (entries ?? []).filter((entry) => entry.name.toLowerCase().includes(query.trim().toLowerCase()));
  const visibleEntries = showFullList ? filtered : mostAdded.slice(0, IDLE_VISIBLE_COUNT);

  return (
    <Section title="Quanto costa in media?" maxWidth={780}>
      <YStack width="100%" gap="$3">
        <Text fontSize={16} color={brand.grafite70}>
          Prezzi veri dei professionisti del sito. Tocca un lavoro per vedere chi lo fa.
        </Text>
        {/* Campo e voci in un unico riquadro bianco (Luca: "quella finestra
            non mi convince", §398): si legge come una finestra sola, il campo
            non ha più il bordo nero del fuoco ma un anello verde sul riquadro. */}
        <div className="price-panel" onFocus={() => setIsFocused(true)} onBlur={handleBlur}>
          <label className="price-search">
            <Search size={20} strokeWidth={2} aria-hidden="true" className="price-search-icon" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Es. sostituzione caldaia, tinteggiatura, trasloco..."
              aria-label="Cerca un lavoro per conoscere il prezzo medio"
              className="price-search-input"
            />
          </label>

          {isEmpty ? (
            <YStack width="100%" gap="$3" alignItems="flex-start" padding="$4">
              <Text fontSize={16} color={brand.grafite70}>
                I prezzi medi appariranno qui non appena i professionisti inseriranno le loro prestazioni. Nel frattempo
                puoi chiedere un preventivo gratuito: è il modo più preciso per sapere quanto costa il tuo lavoro.
              </Text>
              <a
                href="/preventivo"
                style={{
                  display: "inline-block",
                  backgroundColor: brand.cianografiaPieno,
                  color: "#fff",
                  fontWeight: 700,
                  fontSize: 16,
                  padding: "12px 22px",
                  borderRadius: 999,
                  textDecoration: "none",
                }}
              >
                Richiedi un preventivo gratuito
              </a>
            </YStack>
          ) : entries === null ? (
            <p className="price-message">Caricamento...</p>
          ) : visibleEntries.length === 0 ? (
            <p className="price-message">
              Nessun lavoro trovato per {'"'}
              {query}
              {'"'}.
            </p>
          ) : (
            <YStack
              width="100%"
              gap={0}
              // Elenco completo scorribile solo da aperto (a fuoco/con testo
              // scritto) — richiesta esplicita dell'utente. A riposo (soli
              // primi 10) non serve scroll, l'elenco è già corto.
              maxHeight={showFullList ? 420 : undefined}
              overflow={showFullList ? "scroll" : "visible"}
            >
              {visibleEntries.map((entry) => (
                // Ogni voce apre i professionisti che offrono quella prestazione
                // (richiesta di Luca, docs/CHANGELOG.md §398).
                <a
                  key={entry.name}
                  href={entryHref(entry.name, lastCity)}
                  className="price-row"
                  aria-label={`${entry.name}, ${entry.price ? `in media ${formatServicePriceRange(entry.price.medianEurCents, null)} ${SERVICE_PRICE_UNIT_LABEL[entry.price.unit]}, di solito ${formatServicePriceRange(entry.price.lowEurCents, entry.price.highEurCents)}` : "prezzo su preventivo"}: vedi chi lo fa`}
                  // Il clic non toglie il fuoco al campo: l'elenco aperto non si
                  // richiude (e non sposta le voci) tra la pressione e il rilascio.
                  onMouseDown={(event) => event.preventDefault()}
                  // Conteggio anonimo della voce toccata (§399), per l'Andamento del sito.
                  onClick={countPriceToolEntry}
                >
                  <YStack gap={2} flex={1} minWidth={0}>
                    <Text fontSize={16} fontWeight="600" color={brand.grafite}>
                      {entry.name}
                    </Text>
                    {/* Sotto i 3 professionisti il numero dice solo quanto è piccola
                      l'offerta: resta la forbice, che è l'informazione utile (§349). */}
                    {entry.professionalCount >= 3 ? (
                      <Text fontSize={13} color={brand.grafite70}>
                        {entry.professionalCount} professionisti
                      </Text>
                    ) : null}
                  </YStack>
                  <XStack alignItems="center" gap="$2" flexShrink={0}>
                    {/* Mediana e intervallo tipico (metà dei professionisti), mai
                        minimo e massimo; sotto i 3 prezzi nessuna cifra (§398). */}
                    {entry.price ? (
                      <YStack alignItems="flex-end" gap={2}>
                        {/* Unità prima del prezzo (Luca, §399): le cifre restano allineate a destra. */}
                        <Text fontSize={17} fontWeight="700" color={brand.cianografiaScuro}>
                          <Text fontSize={13} fontWeight="400" color={brand.grafite70}>
                            {SERVICE_PRICE_UNIT_LABEL[entry.price.unit]}
                            {"\u00A0\u00A0"}
                          </Text>
                          {formatServicePriceRange(entry.price.medianEurCents, null)}
                        </Text>
                        {entry.price.highEurCents > entry.price.lowEurCents ? (
                          <Text fontSize={13} color={brand.grafite70}>
                            di solito {formatServicePriceRange(entry.price.lowEurCents, entry.price.highEurCents)}
                          </Text>
                        ) : null}
                      </YStack>
                    ) : (
                      <Text fontSize={14} color={brand.grafite70}>
                        Su preventivo
                      </Text>
                    )}
                    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" className="price-row-chevron">
                      <path
                        d="M6 3.5 10.5 8 6 12.5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </XStack>
                </a>
              ))}
            </YStack>
          )}
        </div>
      </YStack>
      {children}
      <style jsx>{`
        .price-panel {
          display: flex;
          flex-direction: column;
          background: ${brand.calce};
          border: 1px solid ${brand.filetto};
          border-radius: ${radiusDoc}px;
          box-shadow: 0 6px 24px rgba(43, 32, 19, 0.06);
          overflow: hidden;
          transition: box-shadow 0.15s ease, border-color 0.15s ease;
        }
        .price-panel:focus-within {
          border-color: ${brand.cianografia};
          box-shadow: 0 0 0 3px ${brand.cianografiaVelo}, 0 6px 24px rgba(43, 32, 19, 0.06);
        }
        .price-search {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 0 18px;
          min-height: 56px;
          border-bottom: 1px solid ${brand.filetto};
          cursor: text;
        }
        .price-panel :global(.price-search-icon) {
          color: ${brand.grafite70};
          flex-shrink: 0;
        }
        .price-search-input {
          flex: 1;
          min-width: 0;
          border: 0;
          outline: none;
          background: transparent;
          padding: 16px 0;
          font-size: 16px;
          font-family: inherit;
          color: ${brand.grafite};
        }
        .price-search-input::placeholder {
          color: ${brand.grafite70};
        }
        .price-message {
          margin: 0;
          padding: 18px;
          font-size: 16px;
          color: ${brand.grafite70};
        }
        .price-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          padding: 14px 18px;
          text-decoration: none;
          color: inherit;
          transition: background-color 0.15s ease;
        }
        .price-row + .price-row {
          box-shadow: inset 0 1px 0 ${brand.filetto};
        }
        .price-row:hover {
          background-color: ${brand.cianografiaVelo};
        }
        .price-row:focus-visible {
          outline: 2px solid ${brand.cianografiaScuro};
          outline-offset: -2px;
        }
        .price-row-chevron {
          color: ${brand.cianografiaScuro};
          transition: transform 0.15s ease;
        }
        .price-row:hover .price-row-chevron {
          transform: translateX(2px);
        }
        @media (prefers-reduced-motion: reduce) {
          .price-panel,
          .price-row,
          .price-row-chevron {
            transition: none;
          }
        }
      `}</style>
    </Section>
  );
}
