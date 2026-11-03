"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eyebrow, Icon, SearchBar, Text, XStack, YStack, brand, type ProfessionalSuggestion, type SearchMode } from "@professionisti/ui";
import { buildSearchDestination } from "@/lib/searchNavigation";
import { problemExamples, rememberSearchCity, useSearchBarHints } from "@/lib/useSearchBarHints";
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
  // Attesa della ricerca per problema: il sito chiede al dizionario e, nei
  // casi dubbi, all'intelligenza artificiale (fino a 3 secondi). Intanto nel
  // riquadro compaiono le luci, veloci, e "Cerco chi ti serve…"
  // (docs/changelog/2026-11-03-luci-che-accelerano.md).
  const [navigating, startNavigation] = useTransition();
  const [problemSearch, setProblemSearch] = useState(false);
  const searching = problemSearch && navigating;

  async function handleSearch(params: { query: string; city: string; professional?: ProfessionalSuggestion; mode: SearchMode }) {
    rememberSearchCity(params.city);
    const destination = await buildSearchDestination(params);
    setProblemSearch(destination.includes("problema="));
    navigateWithTransition(() => startNavigation(() => router.push(destination)));
  }

  return (
    <YStack width="100%" backgroundColor="transparent" paddingTop="6" paddingBottom="5" paddingHorizontal="4" alignItems="center">
      <YStack
        width="100%"
        maxWidth={1160}
        backgroundColor={brand.cianografia}
        borderRadius={40}
        paddingVertical="8"
        paddingHorizontal="5"
        alignItems="center"
        position="relative"
        className="home-hero-panel"
      >
        {/* Luci sfumate (scelta dell'utente, docs/CHANGELOG.md §305): in un
            livello a parte con "overflow:hidden" invece che sull'intero
            pannello, che tagliava il menu a discesa di SearchBar (CLAUDE.md
            §10). */}
        <GlowLights tone="verde-opaco" radius={40} speed={searching ? 3 : undefined} />

        <YStack width="100%" maxWidth={720} alignItems="center" gap="4" position="relative">
          <Eyebrow tone="dark">Non chiamare a caso. Chiamalo giusto.</Eyebrow>
          {/* Titolo principale della pagina (h1) per Google e i lettori di schermo. */}
          <Text
            render="h1"
            margin={0}
            fontFamily="heading"
            fontWeight="600"
            fontSize="38px gtSm:54px"
            lineHeight="42px gtSm:56px"
            letterSpacing={-0.5}
            textAlign="center"
            color="white"
          >
            Scrivi il problema. Ti diciamo chi chiamare.
          </Text>
          {/* La ricerca per problema in primo piano (scelta di Luca,
              docs/changelog/2026-11-03-ricerca-per-problema-home.md): prima il
              titolo diceva "Trova un professionista vicino a te" e nessuno
              capiva che si può descrivere il guasto. Le parole per Google
              (idraulici, elettricisti, vicino a te) restano qui sotto. */}
          <Text fontSize="5" color="rgba(255,255,255,0.88)" textAlign="center" maxWidth={560}>
            Con parole tue: l&apos;intelligenza artificiale capisce chi ti serve. Idraulici, elettricisti e altri
            professionisti vicino a te.
          </Text>

          <YStack width="100%" marginTop="4">
            <SearchBar
              wrapSearchButton={(button) => <MagneticButton block>{button}</MagneticButton>}
              onSearch={handleSearch}
              queryField={{
                label: "Cosa è successo?",
                badge: "Novità",
                placeholder: "Es. scarico intasato",
                className: "hero-problem-input",
                examples: FIELD_EXAMPLES,
              }}
              footer={({ mode, fillQuery }) => (mode === "domicilio" ? <HeroExamples onPick={fillQuery} /> : null)}
              {...searchHints}
            />
          </YStack>

          {/* L'interruttore "Intervento urgente? Solo disponibili nelle prossime
              24h" è stato tolto (docs/CHANGELOG.md §349): prometteva un filtro
              che il sito non fa (nessuno controlla chi è disponibile) ed era il
              secondo controllo "urgente" nello stesso schermo, col link rosso
              "Richiesta urgente" qui sotto, che resta. */}
          <Text role="status" fontSize={16} fontWeight="600" color="rgba(255,255,255,0.75)" marginTop="2" textAlign="center">
            {searching ? "Cerco chi ti serve…" : "Ricerca gratuita · Nessuna registrazione"}
          </Text>

          {/* Una sola azione principale nel primo schermo, "Cerca" (§271). Il
              campo capisce anche il problema ("perde il rubinetto"), quindi il
              link "Richiedi un preventivo" qui sotto è stato tolto: la richiesta
              è in alto a destra. Resta la richiesta urgente, una strada
              diversa, come pillola dentro il riquadro (scelta di Luca,
              docs/changelog/2026-10-28-richiedi-preventivo-in-alto.md). */}
          <YStack width="100%" maxWidth={560} alignItems="center" gap="3" marginTop="3">
            <XStack width="100%" alignItems="center" gap="3">
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

/**
 * Esempi da toccare sotto la ricerca: tre problemi tra i più cercati su Google
 * (suggerimenti in analisi/seo-dati/suggerimenti-google.json: "scarico
 * intasato", "salta la corrente", "pulizie post ristrutturazione") e tre
 * mestieri, per dire che basta anche solo il nome (richiesta di Luca). Tutti
 * riconosciuti con sicurezza dal dizionario, quindi il tocco mostra subito
 * "Ti serve: …".
 */
const PROBLEM_EXAMPLES = ["Scarico intasato", "Salta la corrente", "Pulizie dopo i lavori"] as const;
/**
 * Altre frasi, diverse da quelle sotto il riquadro, in cima all'elenco del
 * campo vuoto (richiesta di Luca, docs/changelog/2026-11-03-luci-che-accelerano.md):
 * tutte riconosciute con sicurezza dal dizionario, mestieri diversi.
 */
const FIELD_EXAMPLES = problemExamples(["Il rubinetto perde", "Caldaia in blocco", "Serratura bloccata", "Prato da tagliare"]);
const TRADE_EXAMPLES = ["Idraulico", "Elettricista", "Babysitter"] as const;

function HeroExamples({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div className="hero-examples">
      <ExampleRow label="Prova:" items={PROBLEM_EXAMPLES} onPick={onPick} />
      <ExampleRow label="O scrivi solo chi cerchi:" items={TRADE_EXAMPLES} onPick={onPick} />
    </div>
  );
}

function ExampleRow({ label, items, onPick }: { label: string; items: readonly string[]; onPick: (text: string) => void }) {
  return (
    <div className="hero-examples-row" role="group" aria-label={label.replace(":", "")}>
      <span className="hero-examples-label">{label}</span>
      {items.map((item) => (
        <button key={item} type="button" className="hero-example" onClick={() => onPick(item)}>
          {item}
        </button>
      ))}
    </div>
  );
}
