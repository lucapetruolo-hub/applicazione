"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  DEFAULT_PROBLEM_EXAMPLES,
  FIELD_PROBLEM_EXAMPLES,
  FIELD_PROBLEM_EXAMPLES_POOL,
  VISIBLE_PROBLEM_EXAMPLES,
  orderProblemExamples,
  type ProblemExamplesResponse,
} from "@professionisti/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eyebrow, Icon, SearchBar, Text, XStack, YStack, brand, type ProfessionalSuggestion, type SearchMode } from "@professionisti/ui";
import { buildSearchDestination } from "@/lib/searchNavigation";
import { problemExampleSuggestions, rememberSearchCity, useSearchBarHints } from "@/lib/useSearchBarHints";
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
export function HomeHero({ examples }: { examples: ProblemExamplesResponse | null }) {
  const router = useRouter();
  const searchHints = useSearchBarHints("");
  const heroExamples = useHeroExamples(examples);
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
    const problem = destination.includes("problema=");
    setProblemSearch(problem);
    // La ricerca dal problema qui ha già le luci e "Cerco chi ti serve…": niente barra in più.
    navigateWithTransition(() => startNavigation(() => router.push(destination)), problem ? undefined : destination);
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
                examples: heroExamples.field,
              }}
              // Un tocco su un esempio cerca subito (richiesta di Luca,
              // docs/changelog/2026-11-04-esempi-cercano-subito.md).
              footer={({ mode, searchFor }) => (mode === "domicilio" ? <HeroExamples problems={heroExamples.visible} trades={heroExamples.trades} onPick={searchFor} /> : null)}
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
 * Esempi da toccare sotto la ricerca e nel campo vuoto (richieste di Luca,
 * docs/changelog/2026-11-03-ricerca-per-problema-home.md e
 * docs/changelog/2026-11-03-luci-che-accelerano.md): frasi scelte in Admin →
 * Mestieri richiesti (o quelle di partenza), già ordinate dal server per
 * mestiere più cercato. Sotto il riquadro le prime 5, sempre le stesse
 * finché l'ordine non cambia; nel campo 2 a caso tra le 4 successive, così a
 * ogni visita si vede qualcosa di nuovo ma mai un doppione. Più i 3 mestieri
 * più cercati, per dire che basta anche solo il nome. Se l'API non risponde,
 * l'elenco di partenza nell'ordine dei volumi di Google.
 */
function useHeroExamples(examples: ProblemExamplesResponse | null) {
  // Una risposta senza la forma attesa (API vecchia o finta) non deve rompere la home.
  const ordered = examples && Array.isArray(examples.examples) && Array.isArray(examples.trades) ? examples : FALLBACK_EXAMPLES;
  const visible = ordered.examples.slice(0, VISIBLE_PROBLEM_EXAMPLES).map((example) => example.text);
  const pool = ordered.examples.slice(VISIBLE_PROBLEM_EXAMPLES, VISIBLE_PROBLEM_EXAMPLES + FIELD_PROBLEM_EXAMPLES_POOL);
  // Scelta una volta per visita. L'elenco del campo si vede solo dopo il tocco,
  // quindi la scelta a caso non cambia la pagina preparata dal server.
  const [seed] = useState(() => Math.random());
  const start = pool.length > 0 ? Math.floor(seed * pool.length) : 0;
  const field = Array.from({ length: Math.min(FIELD_PROBLEM_EXAMPLES, pool.length) }, (_, k) => pool[(start + k) % pool.length]!);
  return {
    visible,
    trades: ordered.trades.map((trade) => trade.name),
    field: problemExampleSuggestions(field),
  };
}

const FALLBACK_EXAMPLES = orderProblemExamples(DEFAULT_PROBLEM_EXAMPLES, []);

function HeroExamples({ problems, trades, onPick }: { problems: readonly string[]; trades: readonly string[]; onPick: (text: string) => void }) {
  return (
    <div className="hero-examples">
      <ExampleRow label="Prova:" items={problems} onPick={onPick} />
      <ExampleRow label="O scrivi solo chi cerchi:" items={trades} onPick={onPick} />
    </div>
  );
}

/** Scorrimento da solo: pixel al secondo, attesa all'apertura e a ogni capo. */
const AUTO_SCROLL_SPEED = 14;
const AUTO_SCROLL_START_MS = 2500;
const AUTO_SCROLL_PAUSE_MS = 2500;

/**
 * Una riga per elenco, da telefono e da computer, con due freccette piccole
 * ai lati e i bordi sfumati (richiesta di Luca, docs/changelog/2026-11-03-luci-che-accelerano.md):
 * prima da computer le frasi andavano su due righe. Le freccette compaiono
 * solo se c'è altro da vedere da quel lato; si scorre anche col dito. La
 * riga scorre da sola molto piano finché non la si tocca.
 */
function ExampleRow({ label, items, onPick }: { label: string; items: readonly string[]; onPick: (text: string) => void }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: false, end: false, fits: true });

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const update = () => {
      const max = track.scrollWidth - track.clientWidth;
      setEdges({ start: track.scrollLeft > 1, end: track.scrollLeft < max - 1, fits: max <= 1 });
    };
    update();
    track.addEventListener("scroll", update, { passive: true });
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(update) : null;
    observer?.observe(track);
    return () => {
      track.removeEventListener("scroll", update);
      observer?.disconnect();
    };
  }, [items]);

  // Scorrimento lentissimo da solo (scelta di Luca): avanti e indietro, con
  // una pausa a ogni capo. Si ferma per sempre al primo tocco, clic,
  // freccetta o tasto nella riga (da lì decide la persona, WCAG 2.2.2) e
  // finché il cursore ci sta sopra; fermo fuori dallo schermo e con "riduci
  // movimento".
  useEffect(() => {
    const track = trackRef.current;
    const row = track?.parentElement;
    if (!track || !row) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let stopped = false;
    let hovering = false;
    let visible = true;
    let direction = 1;
    let pauseUntil = performance.now() + AUTO_SCROLL_START_MS;
    let position = track.scrollLeft;
    let last = performance.now();
    let frame = requestAnimationFrame(function step(now) {
      const elapsed = Math.min(now - last, 100);
      last = now;
      const max = track.scrollWidth - track.clientWidth;
      if (!stopped && !hovering && visible && max > 2 && now >= pauseUntil) {
        position = Math.min(max, Math.max(0, position + (direction * AUTO_SCROLL_SPEED * elapsed) / 1000));
        track.scrollLeft = position;
        if (position >= max || position <= 0) {
          direction = -direction;
          pauseUntil = now + AUTO_SCROLL_PAUSE_MS;
        }
      } else {
        position = track.scrollLeft;
      }
      if (!stopped) frame = requestAnimationFrame(step);
    });
    const stop = () => {
      stopped = true;
      cancelAnimationFrame(frame);
    };
    const enter = () => (hovering = true);
    const leave = () => (hovering = false);
    const observer =
      typeof IntersectionObserver === "function"
        ? new IntersectionObserver(([entry]) => (visible = entry?.isIntersecting ?? true))
        : null;
    observer?.observe(row);
    row.addEventListener("pointerdown", stop);
    row.addEventListener("keydown", stop);
    row.addEventListener("wheel", stop, { passive: true });
    row.addEventListener("touchstart", stop, { passive: true });
    row.addEventListener("focusin", stop);
    row.addEventListener("mouseenter", enter);
    row.addEventListener("mouseleave", leave);
    return () => {
      stop();
      observer?.disconnect();
      row.removeEventListener("pointerdown", stop);
      row.removeEventListener("keydown", stop);
      row.removeEventListener("wheel", stop);
      row.removeEventListener("touchstart", stop);
      row.removeEventListener("focusin", stop);
      row.removeEventListener("mouseenter", enter);
      row.removeEventListener("mouseleave", leave);
    };
  }, [items]);

  const scroll = (direction: 1 | -1) => {
    const track = trackRef.current;
    if (!track) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    track.scrollBy({ left: direction * Math.max(160, track.clientWidth * 0.7), behavior: reduced ? "auto" : "smooth" });
  };

  return (
    <div
      className="hero-examples-row"
      role="group"
      aria-label={label.replace(":", "")}
      data-fits={edges.fits}
    >
      <span className="hero-examples-label">{label}</span>
      <button
        type="button"
        className="hero-examples-arrow"
        aria-label="Esempi precedenti"
        tabIndex={-1}
        data-hidden={!edges.start}
        onClick={() => scroll(-1)}
      >
        <Icon name="chevron-left" size={16} color="white" strokeWidth={2.25} />
      </button>
      <div ref={trackRef} className="hero-examples-track scroll-fade">
        {items.map((item) => (
          <button key={item} type="button" className="hero-example" onClick={() => onPick(item)}>
            {item}
          </button>
        ))}
      </div>
      <button
        type="button"
        className="hero-examples-arrow"
        aria-label="Altri esempi"
        tabIndex={-1}
        data-hidden={!edges.end}
        onClick={() => scroll(1)}
      >
        <Icon name="chevron-right" size={16} color="white" strokeWidth={2.25} />
      </button>
    </div>
  );
}
