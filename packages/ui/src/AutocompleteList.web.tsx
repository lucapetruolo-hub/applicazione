/// <reference lib="dom" />
"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { brand } from "./tokens";

export type AutocompleteListProps = {
  children: ReactNode;
  /** id dell'opzione evidenziata con le frecce: la lista la tiene in vista. */
  activeOptionId?: string;
};

/** Altezza massima della lista, come prima. */
const MAX_HEIGHT = 320;
/** Sotto questa altezza la lista non si accorcia: meglio uscire dalla finestra che mostrare una voce sola. */
const MIN_HEIGHT = 150;
/** Spazio lasciato tra il fondo della lista e il fondo della finestra. */
const EDGE = 12;
/** Altezza della sfumatura con "Altre N" in fondo. */
const MORE_HEIGHT = 48;

/**
 * Lista dei suggerimenti sul sito (docs/changelog/2026-11-07-liste-suggerimenti.md,
 * richiesta di Luca: chi non usa la rotellina non capiva che la lista
 * continua):
 * - alta quanto lo spazio libero nella finestra (massimo 320 px), con
 *   l'ultima voce visibile tagliata a metà: si vede che c'è altro;
 * - in fondo una sfumatura con "Altre N", che a ogni clic o tocco fa
 *   scorrere di una pagina e sparisce quando si arriva in fondo;
 * - barra di scorrimento sottile sempre visibile, anche su Mac
 *   (`.autocomplete-scroll` in apps/web/src/app/globals.css);
 * - con le frecce la voce scelta resta sempre in vista.
 */
export function AutocompleteList({ children, activeOptionId }: AutocompleteListProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [maxHeight, setMaxHeight] = useState(MAX_HEIGHT);
  const [hiddenBelow, setHiddenBelow] = useState(0);

  // Quante voci non si vedono per intero sotto il bordo della lista.
  const countHidden = useCallback(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const bottom = scroller.getBoundingClientRect().bottom;
    let hidden = 0;
    scroller.querySelectorAll<HTMLElement>('[role="option"]').forEach((option) => {
      if (option.getBoundingClientRect().bottom > bottom + 1) hidden += 1;
    });
    setHiddenBelow(hidden);
  }, []);

  const measure = useCallback(() => {
    const scroller = scrollRef.current;
    const content = contentRef.current;
    if (!scroller || !content) return;
    const viewport = window.visualViewport;
    const viewportBottom = viewport ? viewport.offsetTop + viewport.height : window.innerHeight;
    const top = scroller.getBoundingClientRect().top;
    let height = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, viewportBottom - top - EDGE));
    if (content.scrollHeight > height) {
      // L'altezza scende fino a metà dell'ultima voce che ci sta: una riga
      // tagliata giusta sul bordo faceva sembrare finita la lista.
      const contentTop = content.getBoundingClientRect().top;
      let best = 0;
      content.querySelectorAll<HTMLElement>('[role="option"]').forEach((option) => {
        const rect = option.getBoundingClientRect();
        const middle = rect.top - contentTop + rect.height / 2;
        if (middle <= height && middle > best) best = middle;
      });
      if (best >= MIN_HEIGHT / 2) height = Math.round(best);
    }
    setMaxHeight((prev) => (prev === height ? prev : height));
  }, []);

  // Misura all'apertura, quando cambiano le voci, quando la finestra cambia
  // (anche la tastiera del telefono, che restringe `visualViewport`) e
  // quando la pagina scorre (la lista si sposta con il campo).
  useLayoutEffect(() => {
    measure();
    // Ancora una volta a fine apertura: durante l'animazione `.pop-in` la
    // lista è rimpicciolita del 3% e le misure sono un po' più corte.
    const timer = window.setTimeout(measure, 240);
    return () => window.clearTimeout(timer);
  }, [measure, children]);
  useEffect(() => {
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, { passive: true });
    window.visualViewport?.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("scroll", schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule);
      window.visualViewport?.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("scroll", schedule);
    };
  }, [measure]);
  useLayoutEffect(() => {
    countHidden();
  }, [countHidden, maxHeight, children]);

  // Frecce: la voce evidenziata resta in vista, sopra la sfumatura in fondo.
  // Si sposta solo la lista, mai la pagina (niente scrollIntoView).
  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller || !activeOptionId) return;
    const option = document.getElementById(activeOptionId);
    if (!option || !scroller.contains(option)) return;
    const box = scroller.getBoundingClientRect();
    const rect = option.getBoundingClientRect();
    const options = scroller.querySelectorAll('[role="option"]');
    const isLast = option === options[options.length - 1];
    const reserve = isLast ? 0 : MORE_HEIGHT;
    if (rect.top < box.top) {
      scroller.scrollTop -= box.top - rect.top + (option.previousElementSibling?.getAttribute("role") === "presentation" ? 32 : 0);
    } else if (rect.bottom > box.bottom - reserve) {
      scroller.scrollTop += rect.bottom - (box.bottom - reserve);
    }
  }, [activeOptionId]);

  function showMore() {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // La prima voce coperta dalla sfumatura sale in cima alla lista, intera.
    const box = scroller.getBoundingClientRect();
    let delta = scroller.clientHeight - MORE_HEIGHT;
    for (const option of Array.from(scroller.querySelectorAll<HTMLElement>('[role="option"]'))) {
      const rect = option.getBoundingClientRect();
      if (rect.bottom > box.bottom - MORE_HEIGHT) {
        const heading = option.previousElementSibling?.getAttribute("role") === "presentation" ? option.previousElementSibling : null;
        delta = (heading ?? option).getBoundingClientRect().top - box.top;
        break;
      }
    }
    scroller.scrollBy({ top: Math.max(40, delta), behavior: reduce ? "auto" : "smooth" });
  }

  return (
    <div style={{ position: "relative" }}>
      {/* Fuori dal Tab: l'elenco si usa con le frecce dal campo, e il
          browser rendeva il riquadro scorrevole una fermata in più
          (docs/changelog/2026-10-30-tastiera.md, collaudo L-12). */}
      <div
        ref={scrollRef}
        className="autocomplete-scroll"
        tabIndex={-1}
        onScroll={countHidden}
        style={{ maxHeight, overflowY: "auto", overscrollBehavior: "contain" }}
      >
        <div ref={contentRef}>{children}</div>
      </div>
      {hiddenBelow > 0 ? (
        // Solo per chi usa mouse o dito: il lettore di schermo scorre le
        // voci con le frecce e sa già quante sono (annuncio nel campo).
        <div className="autocomplete-more" aria-hidden="true">
          <button
            type="button"
            tabIndex={-1}
            // Il clic non toglie il fuoco al campo: altrimenti la lista si chiude.
            onMouseDown={(event) => event.preventDefault()}
            onClick={showMore}
            style={{ color: brand.cianografiaPieno }}
          >
            {hiddenBelow === 1 ? "Ancora 1" : `Altre ${hiddenBelow}`}
            <ChevronDown size={14} strokeWidth={2.2} aria-hidden />
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** Bordo inferiore della barra in alto che resta ferma (header del sito), 0 se non c'è. */
function stickyTopBottom(): number {
  let bottom = 0;
  for (const x of [window.innerWidth / 2, 8]) {
    let node = document.elementFromPoint(x, 2) as HTMLElement | null;
    while (node && node !== document.body) {
      const position = getComputedStyle(node).position;
      if (position === "sticky" || position === "fixed") {
        bottom = Math.max(bottom, node.getBoundingClientRect().bottom);
        break;
      }
      node = node.parentElement;
    }
  }
  return bottom;
}

/** Il campo è dentro una barra o una finestra ferma? Allora la pagina non va spostata. */
function insideFixed(node: HTMLElement): boolean {
  let current: HTMLElement | null = node;
  while (current && current !== document.body) {
    const position = getComputedStyle(current).position;
    if (position === "fixed" || position === "sticky") return true;
    current = current.parentElement;
  }
  return false;
}

/**
 * Telefono: toccando il campo la pagina sale e il campo (con la sua
 * etichetta) si mette sotto la barra in alto, così la lista resta sopra la
 * tastiera. Prima il campo della home stava in fondo allo schermo e con la
 * tastiera aperta della lista non si vedeva nulla.
 */
export function revealFieldForList(field: unknown): void {
  if (typeof window === "undefined") return;
  const node = field as HTMLElement | null;
  if (!node || typeof node.getBoundingClientRect !== "function") return;
  if (!window.matchMedia("(pointer: coarse) and (max-width: 767px)").matches) return;
  if (insideFixed(node)) return;
  const target = stickyTopBottom() + 12;
  const delta = node.getBoundingClientRect().top - target;
  if (Math.abs(delta) < 8) return;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  window.scrollTo({ top: window.scrollY + delta, behavior: reduce ? "auto" : "smooth" });
}
