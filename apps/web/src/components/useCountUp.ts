"use client";

import { useEffect, useRef, useState } from "react";

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
  const ref = useRef<HTMLDivElement>(null);
  const [value, setValue] = useState(0);
  const startedRef = useRef(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setValue(target);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting || startedRef.current) return;
        startedRef.current = true;
        const start = performance.now();

        function tick(now: number) {
          const progress = Math.min((now - start) / durationMs, 1);
          const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
          setValue(Math.round(target * eased));
          if (progress < 1) requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
        observer.disconnect();
      },
      { threshold: 0.3 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [target, durationMs]);

  return { ref, value };
}
