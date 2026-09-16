"use client";

import { useEffect, useRef, useState } from "react";
import { motionBase, motionEasing } from "@professionisti/ui";

/**
 * Variante di `FadeInSection.tsx` pensata per singole card dentro un
 * carosello a scorrimento orizzontale, non per un'intera sezione — quella
 * forza `width:100%`/centraggio flex sul proprio wrapper, incompatibile con
 * `flexShrink:0`/larghezza fissa delle card di un carosello. Ritorna
 * `ref`+`style` da applicare direttamente al div esistente della card
 * (nessun nodo wrapper aggiuntivo che romperebbe il layout flex).
 *
 * `IntersectionObserver` con `root: null` (viewport) tiene comunque conto
 * del ritaglio da parte degli antenati con `overflow` (spec: l'area di
 * intersezione è ritagliata dai bounding box di scroll container
 * intermedi) — una card scorsa fuori orizzontalmente in un carosello non
 * risulta quindi "visibile" finché non viene scorsa in vista anche
 * lateralmente, non solo verticalmente: l'animazione di ingresso si
 * ripete scorrendo il carosello, non solo la pagina.
 *
 * `delayMs` (tipicamente `index * 80-90`, mai applicato oltre un tetto
 * ragionevole dal chiamante) crea l'effetto "a cascata" quando più card
 * entrano in vista nello stesso istante — richiesta esplicita dell'utente
 * ("animazione di ingresso" per le card di Recensioni verificate/Nuovi
 * profili).
 */
export function useRevealOnScroll(delayMs = 0) {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.2 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return {
    ref,
    style: {
      opacity: isVisible ? 1 : 0,
      transform: isVisible ? "translateY(0) scale(1)" : "translateY(18px) scale(0.96)",
      transition: `opacity ${motionBase} ${motionEasing} ${delayMs}ms, transform ${motionBase} ${motionEasing} ${delayMs}ms`,
    } as const,
  };
}
