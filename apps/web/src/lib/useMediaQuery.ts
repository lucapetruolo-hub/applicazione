import { useSyncExternalStore } from "react";

/**
 * Una media query CSS letta durante il render invece che in un effetto.
 * Nel render del server vale `false`: subito dopo l'idratazione React
 * rilegge il valore vero, e lo aggiorna quando cambia.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const media = window.matchMedia(query);
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** Preferenza di sistema "riduci movimento". */
export function usePrefersReducedMotion(): boolean {
  return useMediaQuery("(prefers-reduced-motion: reduce)");
}
