"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePrefersReducedMotion } from "@/lib/useMediaQuery";

/**
 * Conteggio animato da 0 al valore reale quando la card entra in vista —
 * stesso principio "animazione di ingresso" già applicato alle card di
 * Recensioni verificate/Nuovi profili (CLAUDE.md §105), qui per
 * `PlatformStats` (i due numeri "Utenti/Professionisti entrati nella
 * piattaforma"): i numeri restano reali (mai un valore finto, invariato
 * — solo COME arrivano al numero vero cambia).
 *
 * `requestAnimationFrame`, non un `setInterval` a passo fisso: l'unica via
 * per un'easing fluido indipendente dal refresh rate del dispositivo. Non
 * governato dalla regola CSS globale `prefers-reduced-motion` già in uso
 * nel resto del sito (quella collassa solo `transition`/`animation` CSS,
 * non un ciclo JS) — controllato qui esplicitamente: chi ha quella
 * preferenza di sistema vede subito il valore finale, senza il conteggio.
 */
export function useCountUp(target: number, durationMs = 900) {
  // Ref a callback (l'elemento in uno stato): l'osservatore parte quando l'elemento c'è.
  const [node, setNode] = useState<Element | null>(null);
  const attach = useCallback((element: object | null) => setNode(element instanceof Element ? element : null), []);
  const [value, setValue] = useState(0);
  const reducedMotion = usePrefersReducedMotion();
  const startedRef = useRef(false);

  useEffect(() => {
    if (!node || reducedMotion) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting || startedRef.current) return;
        startedRef.current = true;
        observer.disconnect();
        const start = performance.now();

        function tick(now: number) {
          const progress = Math.min((now - start) / durationMs, 1);
          const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
          setValue(Math.round(target * eased));
          if (progress < 1) requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
      },
      { threshold: 0.3 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [node, target, durationMs, reducedMotion]);

  return { attach, value: reducedMotion ? target : value };
}
