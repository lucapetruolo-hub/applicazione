"use client";
"use no memo";

import { useEffect, useState, type FocusEvent, type ReactNode } from "react";
import { formatServicePriceRange } from "@professionisti/shared";
import { Section, Text, XStack, YStack, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";

type PriceEntry = {
  name: string;
  professionalCount: number;
  minEurCents: number;
  maxEurCents: number;
};

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

  useEffect(() => {
    apiClient
      .getServicePriceIndex()
      .then(setEntries)
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
  const mostAdded = [...(entries ?? [])].sort((a, b) => b.professionalCount - a.professionalCount);

  const filtered = (entries ?? []).filter((entry) => entry.name.toLowerCase().includes(query.trim().toLowerCase()));
  const visibleEntries = showFullList ? filtered : mostAdded.slice(0, IDLE_VISIBLE_COUNT);

  return (
    <Section title="Quanto costa in media?" maxWidth={780}>
      <YStack width="100%" gap="$3">
        <Text fontSize={16} color={brand.grafite70}>
          Range di prezzo calcolato dalle prestazioni inserite davvero dai professionisti sulla piattaforma — scrivi per
          cercare.
        </Text>
        <div
          onFocus={() => setIsFocused(true)}
          onBlur={handleBlur}
          style={{ display: "flex", flexDirection: "column", gap: 12 }}
        >
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Es. sostituzione caldaia, tinteggiatura, trasloco..."
            aria-label="Cerca un lavoro per conoscere il prezzo medio"
            style={{
              padding: 14,
              borderRadius: 999,
              border: `1px solid ${brand.bordoCampo}`,
              fontSize: 16,
              fontFamily: "inherit",
              color: brand.grafite,
              backgroundColor: brand.calce,
            }}
          />

          {isEmpty ? (
            <YStack width="100%" gap="$3" alignItems="flex-start">
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
            <Text fontSize={16} color={brand.grafite70}>
              Caricamento...
            </Text>
          ) : visibleEntries.length === 0 ? (
            <Text fontSize={16} color={brand.grafite70}>
              Nessuna prestazione trovata per {'"'}
              {query}
              {'"'}.
            </Text>
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
              {visibleEntries.map((entry, index) => (
                // Ogni voce apre i professionisti che offrono quella prestazione
                // (richiesta di Luca, docs/CHANGELOG.md §383).
                <a
                  key={entry.name}
                  href={`/cerca?servizio=${encodeURIComponent(entry.name)}`}
                  className={index === 0 ? "price-row price-row-first" : "price-row"}
                  aria-label={`${entry.name}, ${formatServicePriceRange(entry.minEurCents, entry.maxEurCents)}: vedi chi lo fa`}
                  // Il clic non toglie il fuoco al campo: l'elenco aperto non si
                  // richiude (e non sposta le voci) tra la pressione e il rilascio.
                  onMouseDown={(event) => event.preventDefault()}
                >
                  <YStack gap={2} flex={1} minWidth={0}>
                    <Text fontWeight="700" color={brand.grafite}>
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
                    <Text fontWeight="700" color={brand.cianografiaScuro}>
                      {formatServicePriceRange(entry.minEurCents, entry.maxEurCents)}
                    </Text>
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
        .price-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 12px 10px;
          border-top: 1px solid ${brand.filetto};
          border-radius: 10px;
          text-decoration: none;
          color: inherit;
          transition: background-color 0.15s ease;
        }
        .price-row-first {
          border-top-color: transparent;
        }
        .price-row:hover {
          background-color: ${brand.cianografiaVelo};
          border-top-color: transparent;
        }
        .price-row:hover + :global(.price-row) {
          border-top-color: transparent;
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
          .price-row,
          .price-row-chevron {
            transition: none;
          }
        }
      `}</style>
    </Section>
  );
}
