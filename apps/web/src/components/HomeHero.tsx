"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ALL_ITALIAN_CITY_NAMES } from "@professionisti/shared";
import { Eyebrow, Icon, SearchBar, Text, XStack, YStack, brand, type ProfessionalSuggestion, type SearchMode } from "@professionisti/ui";
import { buildSearchDestination } from "@/lib/searchNavigation";
import { buildSearchSuggestions } from "@/lib/searchSuggestions";
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
  const professionalSuggestions: ProfessionalSuggestion[] = buildSearchSuggestions();
  // Toggle "Intervento urgente?" selezionabile già in homepage (richiesta
  // esplicita dell'utente): una volta cercato, la pagina risultati riceve il
  // filtro già preimpostato (`?urgente=1`, letto da ResultsListWithMap) —
  // nessun bottone equivalente serve più lì, la preselezione arriva dall'URL.
  const [urgentOnly, setUrgentOnly] = useState(false);

  function handleSearch(params: { query: string; city: string; professional?: ProfessionalSuggestion; mode: SearchMode }) {
    navigateWithTransition(() => router.push(buildSearchDestination({ ...params, urgentOnly })));
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
        {/* Luci sfumate (scelta dell'utente, docs/CHANGELOG.md §296): in un
            livello a parte con "overflow:hidden" invece che sull'intero
            pannello, che tagliava il menu a discesa di SearchBar (CLAUDE.md
            §10). */}
        <GlowLights tone="verde" radius={40} />

        <YStack width="100%" maxWidth={720} alignItems="center" gap="$4" position="relative">
          <Eyebrow tone="dark">👋 Non chiamare a caso. Chiamalo giusto.</Eyebrow>
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
              professionalSuggestions={professionalSuggestions}
              citySuggestions={ALL_ITALIAN_CITY_NAMES}
            />
          </YStack>

          {/* Toggle "Intervento urgente?" (richiesta esplicita dell'utente):
              selezionabile già qui, prima di cercare — una volta cercato, la
              pagina risultati riceve il filtro già preimpostato dall'URL
              (?urgente=1), nessun bottone equivalente serve più lì. */}
          <XStack
            alignItems="center"
            justifyContent="space-between"
            gap="$3"
            width="100%"
            maxWidth={600}
            marginTop="$3"
            backgroundColor="rgba(255,255,255,0.14)"
            borderRadius={999}
            paddingVertical="$2"
            paddingHorizontal="$4"
            cursor="pointer"
            onPress={() => setUrgentOnly((v) => !v)}
            role="switch"
            aria-checked={urgentOnly}
          >
            <XStack alignItems="center" gap="$2" flex={1} minWidth={0}>
              <Icon name="zap" size={16} color="white" />
              <Text fontSize={16} fontWeight="600" color="white">
                Intervento urgente? Solo disponibili nelle prossime 24h
              </Text>
            </XStack>
            <YStack
              width={40}
              height={24}
              borderRadius={999}
              backgroundColor={urgentOnly ? brand.urgenza : "rgba(255,255,255,0.35)"}
              padding={2}
              justifyContent="center"
              flexShrink={0}
            >
              <YStack width={18} height={18} borderRadius={999} backgroundColor="white" marginLeft={urgentOnly ? 16 : 0} />
            </YStack>
          </XStack>

          <Text fontSize={16} fontWeight="600" color="rgba(255,255,255,0.75)">
            Ricerca gratuita · Nessuna registrazione
          </Text>
        </YStack>
      </YStack>

      {/* Una sola azione principale nel primo schermo, "Cerca" (revisione
          UX di home e ricerca, docs/CHANGELOG.md §271): preventivo e richiesta
          urgente restano raggiungibili qui sotto come link, non più come due
          grossi pulsanti accanto a quello dell'intestazione. */}
      <XStack
        columnGap="$3"
        rowGap={0}
        flexWrap="wrap"
        justifyContent="center"
        alignItems="center"
        marginTop="$4"
        width="100%"
        maxWidth={1160}
      >
        {/* Da telefono la domanda va su una riga a sé e i due link sotto, affiancati. */}
        <Text fontSize={16} color={brand.grafite70} textAlign="center" $xs={{ width: "100%" }}>
          Preferisci descrivere il lavoro?
        </Text>
        <Link href="/preventivo" className="hero-secondary-link">
          Richiedi un preventivo
        </Link>
        <Link href="/urgente" className="hero-secondary-link hero-secondary-link-urgent">
          <Icon name="zap" size={15} color={brand.urgenza} />
          Richiesta urgente
        </Link>
      </XStack>
    </YStack>
  );
}
