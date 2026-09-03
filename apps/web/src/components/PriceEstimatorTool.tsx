"use client";

import { useEffect, useState } from "react";
import { formatServicePriceRange } from "@professionisti/shared";
import { Section, Text, XStack, YStack, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";

type PriceEntry = { name: string; professionalCount: number; minEurCents: number; maxEurCents: number };

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

export function PriceEstimatorTool() {
  const [entries, setEntries] = useState<PriceEntry[] | null>(null);
  const [query, setQuery] = useState("");
  // Campo attivo (a fuoco) o con del testo scritto: solo in quel caso si
  // apre l'elenco completo scorribile — richiesta esplicita dell'utente
  // ("il resto mettilo solo a comparsa... quando si clicca per scriverci
  // che può scorrere"). Resta espanso finché resta a fuoco o c'è del testo,
  // torna ai primi 10 solo quando si lascia il campo vuoto e senza fuoco.
  const [isFocused, setIsFocused] = useState(false);
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
    <Section eyebrow="Prezzi reali" title="Quanto costa in media?" maxWidth={780}>
      <YStack width="100%" gap="$3">
        <Text fontSize="$3" color={brand.grafite70}>
          Range di prezzo calcolato dalle prestazioni inserite davvero dai professionisti sulla piattaforma — scrivi
          per cercare.
        </Text>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder="Es. sostituzione caldaia, tinteggiatura, trasloco..."
          style={{
            padding: 14,
            borderRadius: 999,
            border: `1px solid ${brand.filetto}`,
            fontSize: 15,
            fontFamily: "inherit",
            color: brand.grafite,
            backgroundColor: brand.calce,
          }}
        />

        {isEmpty ? (
          <YStack width="100%" gap="$3" alignItems="flex-start">
            <Text fontSize="$3" color={brand.grafite70}>
              I prezzi medi appariranno qui non appena i professionisti inseriranno le loro prestazioni. Nel frattempo
              puoi chiedere un preventivo gratuito: è il modo più preciso per sapere quanto costa il tuo lavoro.
            </Text>
            <a
              href="/preventivo"
              style={{
                display: "inline-block",
                backgroundColor: brand.cianografia,
                color: "#fff",
                fontWeight: 700,
                fontSize: 15,
                padding: "12px 22px",
                borderRadius: 999,
                textDecoration: "none",
              }}
            >
              Richiedi un preventivo gratuito
            </a>
          </YStack>
        ) : entries === null ? (
          <Text fontSize="$3" color={brand.grafite70}>
            Caricamento...
          </Text>
        ) : visibleEntries.length === 0 ? (
          <Text fontSize="$3" color={brand.grafite70}>
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
              <XStack
                key={entry.name}
                width="100%"
                justifyContent="space-between"
                alignItems="center"
                paddingVertical="$3"
                borderTopWidth={index === 0 ? 0 : 1}
                borderColor={brand.filetto}
                flexWrap="wrap"
                gap="$2"
              >
                <YStack gap={2}>
                  <Text fontWeight="700" color={brand.grafite}>
                    {entry.name}
                  </Text>
                  <Text fontSize="$2" color={brand.grafite70}>
                    {entry.professionalCount === 1 ? "1 professionista" : `${entry.professionalCount} professionisti`}
                  </Text>
                </YStack>
                <Text fontWeight="700" color={brand.cianografia}>
                  {formatServicePriceRange(entry.minEurCents, entry.maxEurCents)}
                </Text>
              </XStack>
            ))}
          </YStack>
        )}
      </YStack>
    </Section>
  );
}
