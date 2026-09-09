"use client";

import { useRef, type ReactNode } from "react";
import { Icon, brand, motionEasing, motionFast } from "@professionisti/ui";

const SCROLL_STEP = 320;

const arrowStyle = {
  flexShrink: 0,
  width: 40,
  height: 40,
  borderRadius: 20,
  border: "none",
  backgroundColor: brand.calce,
  boxShadow: "none",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  transition: `transform ${motionFast} ${motionEasing}`,
} as const;

/**
 * Riga a scorrimento orizzontale per la griglia categorie in homepage
 * (richiesta esplicita dell'utente: "un elenco scorrevole su un'unica riga
 * dove si può scorrere a destra e sinistra sia con una freccetta che
 * scorrendo col dito"). Lo scroll touch è quello nativo del browser (già
 * funzionante di suo su un contenitore overflow-x scrollabile) — le
 * freccette invocano solo `scrollBy` su un ref, nascoste via CSS su
 * dispositivi touch-only (vedi .category-carousel-arrow in globals.css) dove
 * lo swipe basta.
 */
export function CategoryCarousel({ children }: { children: ReactNode }) {
  const trackRef = useRef<HTMLDivElement>(null);

  function scrollByStep(direction: 1 | -1) {
    trackRef.current?.scrollBy({ left: direction * SCROLL_STEP, behavior: "smooth" });
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, width: "100%" }}>
      <div
        className="category-carousel-arrow"
        role="button"
        tabIndex={0}
        aria-label="Scorri a sinistra"
        onClick={() => scrollByStep(-1)}
        onKeyDown={(e) => e.key === "Enter" && scrollByStep(-1)}
        style={arrowStyle}
      >
        <Icon name="chevron-left" size={18} color={brand.grafite} />
      </div>

      <div
        ref={trackRef}
        className="category-carousel-track"
        style={{
          display: "flex",
          gap: 12,
          overflowX: "auto",
          flex: 1,
          minWidth: 0,
          scrollSnapType: "x proximity",
          paddingTop: 8,
          paddingBottom: 4,
        }}
      >
        {children}
      </div>

      <div
        className="category-carousel-arrow"
        role="button"
        tabIndex={0}
        aria-label="Scorri a destra"
        onClick={() => scrollByStep(1)}
        onKeyDown={(e) => e.key === "Enter" && scrollByStep(1)}
        style={arrowStyle}
      >
        <Icon name="chevron-right" size={18} color={brand.grafite} />
      </div>
    </div>
  );
}
