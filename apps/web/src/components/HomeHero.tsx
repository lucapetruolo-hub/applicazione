"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eyebrow, Icon, SearchBar, Text, XStack, YStack, brand, type ProfessionalSuggestion, type SearchMode } from "@professionisti/ui";
import { buildSearchDestination } from "@/lib/searchNavigation";
import { rememberSearchCity, useSearchBarHints } from "@/lib/useSearchBarHints";
import { navigateWithTransition } from "@/lib/viewTransition";
import { GlowLights } from "./GlowLights";
import { MagneticButton } from "./MagneticButton";

/**
 * Hero della homepage: la ricerca professionisti (A domicilio/Online + città
 * + Cerca) resta la funzione primaria — non un form di richiesta guidata.
 * Stesso motore di ricerca e stesso routing (`buildSearchDestination`) già
 * usato da `SearchHeader` nelle pagine risultati, per non avere due
 * comportamenti diversi tra i punti di ingresso alla ricerca.
 *
 * Pannello verde pieno arrotondato al posto della griglia cianografica
 * (brief "Vicinato", CLAUDE.md §19): la ricerca vive dentro il pannello, non
 * su uno sfondo neutro.
 */
export function HomeHero() {
  const router = useRouter();
  const searchHints = useSearchBarHints("");

  function handleSearch(params: { query: string; city: string; professional?: ProfessionalSuggestion; mode: SearchMode }) {
    rememberSearchCity(params.city);
    navigateWithTransition(() => router.push(buildSearchDestination(params)));
  }

  return (
    <YStack width="100%" backgroundColor="transparent" paddingTop="$6" paddingBottom="$5" paddingHorizontal="$4" alignItems="center">
      <YStack
        width="100%"
        maxWidth={1160}
        backgroundColor={brand.cianografia}
        borderRadius={40}
        paddingVertical="$8"
        paddingHorizontal="$5"
        alignItems="center"
        position="relative"
      >
        {/* Luci sfumate (scelta dell'utente, docs/CHANGELOG.md §305): in un
            livello a parte con "overflow:hidden" invece che sull'intero
            pannello, che tagliava il menu a discesa di SearchBar (CLAUDE.md
            §10). */}
        <GlowLights tone="verde" radius={40} />

        <YStack width="100%" maxWidth={720} alignItems="center" gap="$4" position="relative">
          <Eyebrow tone="dark">Non chiamare a caso. Chiamalo giusto.</Eyebrow>
          {/* Titolo principale della pagina (h1) per Google e i lettori di schermo. */}
          <Text
            tag="h1"
            margin={0}
            fontFamily="$heading"
            fontWeight="600"
            fontSize={38}
            lineHeight={42}
            letterSpacing={-0.5}
            textAlign="center"
            color="white"
            $gtSm={{ fontSize: 54, lineHeight: 56 }}
          >
            Trova un professionista vicino a te
          </Text>
          <Text fontSize="$5" color="rgba(255,255,255,0.88)" textAlign="center" maxWidth={520}>
            Idraulici, elettricisti, imbianchini e altri professionisti della tua zona. Cerca per zona o scegli una
            consulenza online.
          </Text>

          <YStack width="100%" marginTop="$4">
            <SearchBar
              wrapSearchButton={(button) => <MagneticButton block>{button}</MagneticButton>}
              onSearch={handleSearch}
              {...searchHints}
            />
          </YStack>

          {/* L'interruttore "Intervento urgente? Solo disponibili nelle prossime
              24h" è stato tolto (docs/CHANGELOG.md §349): prometteva un filtro
              che il sito non fa (nessuno controlla chi è disponibile) ed era il
              secondo controllo "urgente" nello stesso schermo, col link rosso
              "Richiesta urgente" qui sotto, che resta. */}
          <Text fontSize={16} fontWeight="600" color="rgba(255,255,255,0.75)" marginTop="$2">
            Ricerca gratuita · Nessuna registrazione
          </Text>

          {/* Una sola azione principale nel primo schermo, "Cerca" (§271). Il
              campo capisce anche il problema ("perde il rubinetto"), quindi il
              link "Richiedi un preventivo" qui sotto è stato tolto: la richiesta
              è in alto a destra. Resta la richiesta urgente, una strada
              diversa, come pillola dentro il riquadro (scelta di Luca,
              docs/changelog/2026-10-28-richiedi-preventivo-in-alto.md). */}
          <YStack width="100%" maxWidth={560} alignItems="center" gap="$3" marginTop="$3">
            <XStack width="100%" alignItems="center" gap="$3">
              <YStack flex={1} height={1} backgroundColor="rgba(255,255,255,0.3)" aria-hidden />
              <Text fontSize={14} fontWeight="600" color="rgba(255,255,255,0.8)">
                Un guasto da sistemare oggi?
              </Text>
              <YStack flex={1} height={1} backgroundColor="rgba(255,255,255,0.3)" aria-hidden />
            </XStack>
            <Link href="/urgente" className="hero-urgent-link">
              <span className="hero-urgent-icon" aria-hidden>
                <Icon name="zap" size={14} color="white" fill="white" strokeWidth={2} />
              </span>
              Richiesta urgente
            </Link>
          </YStack>
        </YStack>
      </YStack>

    </YStack>
  );
}
