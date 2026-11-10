"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  DEFAULT_PROBLEM_EXAMPLES,
  FIELD_PROBLEM_EXAMPLES,
  FIELD_PROBLEM_EXAMPLES_POOL,
  VISIBLE_PROBLEM_EXAMPLES,
  findCategoryByQuery,
  orderProblemExamples,
  type ProblemExamplesResponse,
} from "@professionisti/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon, SearchBar, type ProfessionalSuggestion, type SearchMode } from "@professionisti/ui";
import { buildSearchDestination } from "@/lib/searchNavigation";
import { problemExampleSuggestions, rememberSearchCity, useSearchBarHints } from "@/lib/useSearchBarHints";
import { navigateWithTransition } from "@/lib/viewTransition";
import { GlowLights } from "./GlowLights";
import { MagneticButton } from "./MagneticButton";
import styles from "./HomeHero.module.css";

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
    <div className={`is_View ${styles.wrap}`}>
      <div className={`is_View home-hero-panel ${styles.panel}`}>
        {/* Luci sfumate (scelta dell'utente, docs/CHANGELOG.md §305): in un
            livello a parte con "overflow:hidden" invece che sull'intero
            pannello, che tagliava il menu a discesa di SearchBar (CLAUDE.md
            §10). */}
        <GlowLights tone="verde-opaco" radius={40} speed={searching ? 3 : undefined} />

        <div className={`is_View ${styles.content}`}>
          {/* Tolta la frase "Non chiamare a caso. Chiamalo giusto." sopra il
              titolo: un elemento in meno nel primo schermo, che resta titolo,
              ricerca ed esempi (spunti da miodottore,
              docs/changelog/2026-11-08-trasparenza-chiara-prezzi-in-arrivo.md). */}
          {/* Titolo principale della pagina (h1) per Google e i lettori di schermo. */}
          <h1 className={`is_Text font_heading ${styles.title}`}>Scrivi il problema. Ti diciamo chi chiamare.</h1>
          {/* La ricerca per problema in primo piano (scelta di Luca,
              docs/changelog/2026-11-03-ricerca-per-problema-home.md): prima il
              titolo diceva "Trova un professionista vicino a te" e nessuno
              capiva che si può descrivere il guasto. Le parole per Google
              (idraulici, elettricisti, vicino a te) restano qui sotto. */}
          <span className={`is_Text ${styles.lead}`}>
            Con parole tue: l&apos;intelligenza artificiale capisce chi ti serve. Idraulici, elettricisti e altri
            professionisti vicino a te.
          </span>

          <div className={`is_View ${styles.search}`}>
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
          </div>

          {/* L'interruttore "Intervento urgente? Solo disponibili nelle prossime
              24h" è stato tolto (docs/CHANGELOG.md §349): prometteva un filtro
              che il sito non fa (nessuno controlla chi è disponibile) ed era il
              secondo controllo "urgente" nello stesso schermo, col link rosso
              "Richiesta urgente" qui sotto, che resta. */}
          <span role="status" className={`is_Text ${styles.status}`}>
            {searching ? "Cerco chi ti serve…" : "Ricerca gratuita, senza registrazione · Preventivi voce per voce"}
          </span>

          {/* Una sola azione principale nel primo schermo, "Cerca" (§271). Il
              campo capisce anche il problema ("perde il rubinetto"), quindi il
              link "Richiedi un preventivo" qui sotto è stato tolto: la richiesta
              è in alto a destra. Resta la richiesta urgente, una strada
              diversa, come pillola dentro il riquadro (scelta di Luca,
              docs/changelog/2026-10-28-richiedi-preventivo-in-alto.md). */}
          <div className={`is_View ${styles.urgent}`}>
            <div className={`is_View ${styles.urgentRow}`}>
              <div aria-hidden="true" className={`is_View ${styles.rule}`} />
              <span className={`is_Text ${styles.urgentLabel}`}>Un guasto da sistemare oggi?</span>
              <div aria-hidden="true" className={`is_View ${styles.rule}`} />
            </div>
            <Link href="/urgente" className="hero-urgent-link">
              <span className="hero-urgent-icon" aria-hidden>
                <Icon name="zap" size={14} color="white" fill="white" strokeWidth={2} />
              </span>
              Richiesta urgente
            </Link>
          </div>
        </div>
      </div>
    </div>
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

/**
 * Dove porta un esempio toccato prima che la pagina sia pronta (JavaScript
 * non ancora partito): il modulo qui sotto lo apre da sé, come un link.
 * Una frase va ai risultati per problema, un mestiere alla sua pagina
 * (docs/changelog/2026-11-10-barra-di-ricerca-senza-tamagui.md).
 */
type ExampleFallback = { name: string; value: string } | { formAction: string };

const problemFallback = (item: string): ExampleFallback => ({ name: "problema", value: item });

function tradeFallback(item: string): ExampleFallback {
  const slug = findCategoryByQuery(item)?.slug;
  return slug ? { formAction: `/cerca/${slug}` } : { name: "q", value: item };
}

function HeroExamples({ problems, trades, onPick }: { problems: readonly string[]; trades: readonly string[]; onPick: (text: string) => void }) {
  // Un modulo vero: prima che la pagina sia pronta un tocco su un esempio
  // apre comunque la ricerca (prima non faceva nulla); dopo, `onPick` cerca
  // come sempre, con la città scritta e le luci dell'attesa.
  return (
    <form className="hero-examples" action="/cerca" method="get">
      <ExampleRow label="Prova:" items={problems} onPick={onPick} fallback={problemFallback} />
      <ExampleRow label="O scrivi solo chi cerchi:" items={trades} onPick={onPick} fallback={tradeFallback} />
    </form>
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
function ExampleRow({
  label,
  items,
  onPick,
  fallback,
}: {
  label: string;
  items: readonly string[];
  onPick: (text: string) => void;
  fallback: (item: string) => ExampleFallback;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: false, end: false, fits: true });
  // Quanto si può scorrere, misurato solo quando la riga cambia misura: prima
  // si rileggeva a ogni fotogramma e a ogni scorrimento, e il browser
  // doveva ricalcolare l'impaginazione di tutta la pagina ogni volta
  // (docs/changelog/2026-11-09-meno-javascript-comune.md).
  const maxScrollRef = useRef(0);
  // Fa ripartire lo scorrimento automatico quando la riga torna scorrevole.
  const resumeRef = useRef<() => void>(() => {});

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    // Le freccette cambiano solo ai capi: stesso stato, nessun nuovo disegno.
    const updateEdges = () => {
      const max = maxScrollRef.current;
      const left = track.scrollLeft;
      const next = { start: left > 1, end: left < max - 1, fits: max <= 1 };
      setEdges((prev) => (prev.start === next.start && prev.end === next.end && prev.fits === next.fits ? prev : next));
    };
    const measure = () => {
      maxScrollRef.current = track.scrollWidth - track.clientWidth;
      updateEdges();
      resumeRef.current();
    };
    measure();
    track.addEventListener("scroll", updateEdges, { passive: true });
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(measure) : null;
    observer?.observe(track);
    return () => {
      track.removeEventListener("scroll", updateEdges);
      observer?.disconnect();
    };
  }, [items]);

  // Scorrimento lentissimo da solo (scelta di Luca): avanti e indietro, con
  // una pausa a ogni capo. Si ferma per sempre al primo tocco, clic,
  // freccetta o tasto nella riga (da lì decide la persona, WCAG 2.2.2) e
  // finché il cursore ci sta sopra; fermo fuori dallo schermo e con "riduci
  // movimento". Gira un fotogramma alla volta solo mentre scorre davvero:
  // durante le pause e da fermo non lavora.
  useEffect(() => {
    const track = trackRef.current;
    const row = track?.parentElement;
    if (!track || !row) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let stopped = false;
    let hovering = false;
    let visible = true;
    let direction = 1;
    let position = 0;
    let last = 0;
    let frame = 0;
    let pauseTimer: number | undefined;
    const canRun = () => !stopped && !hovering && visible && pauseTimer === undefined && maxScrollRef.current > 2;
    const step = (now: number) => {
      frame = 0;
      if (!canRun()) return;
      const max = maxScrollRef.current;
      const elapsed = Math.min(now - last, 100);
      last = now;
      position = Math.min(max, Math.max(0, position + (direction * AUTO_SCROLL_SPEED * elapsed) / 1000));
      track.scrollLeft = position;
      if (position >= max || position <= 0) {
        direction = -direction;
        pauseFor(AUTO_SCROLL_PAUSE_MS);
        return;
      }
      frame = requestAnimationFrame(step);
    };
    const resume = () => {
      if (frame || !canRun()) return;
      // La persona può aver scorso a mano mentre era fermo.
      position = track.scrollLeft;
      last = performance.now();
      frame = requestAnimationFrame(step);
    };
    function pauseFor(ms: number) {
      window.clearTimeout(pauseTimer);
      pauseTimer = window.setTimeout(() => {
        pauseTimer = undefined;
        resume();
      }, ms);
    }
    resumeRef.current = resume;
    pauseFor(AUTO_SCROLL_START_MS);
    const stop = () => {
      stopped = true;
      cancelAnimationFrame(frame);
      frame = 0;
      window.clearTimeout(pauseTimer);
    };
    const enter = () => {
      hovering = true;
    };
    const leave = () => {
      hovering = false;
      resume();
    };
    const observer =
      typeof IntersectionObserver === "function"
        ? new IntersectionObserver(([entry]) => {
            visible = entry?.isIntersecting ?? true;
            resume();
          })
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
      resumeRef.current = () => {};
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
          <button
            key={item}
            type="submit"
            {...fallback(item)}
            className="hero-example"
            onClick={(event) => {
              event.preventDefault();
              onPick(item);
            }}
          >
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
