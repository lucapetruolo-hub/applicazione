"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "@professionisti/ui";

/**
 * Riga da scorrere larga quanto lo schermo, come i caroselli di apple.com
 * (richiesta di Luca, docs/changelog/2026-11-11-home-caroselli-larghi.md):
 * la prima scheda parte allineata al titolo della sezione, le altre
 * continuano fino al bordo dello schermo invece di fermarsi a 1080 px.
 * Sotto, a destra, la barra che mostra a che punto si è (scelta di Luca per
 * i nuovi professionisti, docs/CHANGELOG.md §232) e le due frecce, spente
 * alle estremità. Su un telefono senza mouse le frecce non ci sono: basta il
 * dito (.category-carousel-arrow in globals.css).
 *
 * Una sola riga per le categorie e per i nuovi professionisti della home:
 * prima ognuna aveva le sue frecce e i suoi bordi sfumati.
 */
export function BleedRail({
  children,
  id,
  className,
  maxWidth = 1080,
  previousLabel,
  nextLabel,
  itemSelector,
}: {
  children: ReactNode;
  id?: string;
  className?: string;
  /** Larghezza del contenuto della sezione: la prima scheda si allinea al suo bordo sinistro. */
  maxWidth?: number;
  previousLabel: string;
  nextLabel: string;
  /** Una freccia scorre di una scheda; senza, di quasi una schermata. */
  itemSelector?: string;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState({ start: 0, size: 1 });

  function updateProgress() {
    const track = trackRef.current;
    if (!track || track.scrollWidth === 0) return;
    setProgress({
      start: track.scrollLeft / track.scrollWidth,
      size: Math.min(1, track.clientWidth / track.scrollWidth),
    });
  }

  useEffect(() => {
    updateProgress();
    const track = trackRef.current;
    // Anche quando cambiano le schede (filtro, "Mostra altre"), non solo al ridimensionamento.
    const observer = typeof ResizeObserver !== "undefined" && track ? new ResizeObserver(updateProgress) : null;
    if (track) observer?.observe(track);
    window.addEventListener("resize", updateProgress);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", updateProgress);
    };
  }, []);

  function scrollByItem(direction: 1 | -1) {
    const track = trackRef.current;
    if (!track) return;
    const item = itemSelector ? track.querySelector<HTMLElement>(itemSelector) : null;
    const gap = parseFloat(getComputedStyle(track).columnGap) || 0;
    const step = item ? item.getBoundingClientRect().width + gap : track.clientWidth * 0.8;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    track.scrollBy({ left: direction * step, behavior: reduced ? "auto" : "smooth" });
  }

  const atStart = progress.start <= 0.001;
  const atEnd = progress.start + progress.size >= 0.999;

  return (
    <div id={id} className={`bleed-rail${className ? ` ${className}` : ""}`} style={{ ["--bleed-max" as string]: `${maxWidth}px` }}>
      <div ref={trackRef} className="bleed-rail-track category-carousel-track" onScroll={updateProgress}>
        {children}
      </div>
      {progress.size < 1 ? (
        <div className="bleed-rail-controls">
          <div className="bleed-rail-progress" aria-hidden="true">
            <span style={{ left: `${progress.start * 100}%`, width: `${progress.size * 100}%` }} />
          </div>
          <button
            type="button"
            className="bleed-rail-arrow bleed-rail-arrow--prev category-carousel-arrow"
            aria-label={previousLabel}
            disabled={atStart}
            onClick={() => scrollByItem(-1)}
          >
            <Icon name="chevron-left" size={18} color="currentColor" strokeWidth={2.25} />
          </button>
          <button
            type="button"
            className="bleed-rail-arrow bleed-rail-arrow--next category-carousel-arrow"
            aria-label={nextLabel}
            disabled={atEnd}
            onClick={() => scrollByItem(1)}
          >
            <Icon name="chevron-right" size={18} color="currentColor" strokeWidth={2.25} />
          </button>
        </div>
      ) : null}
    </div>
  );
}
