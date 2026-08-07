"use client";

import { Text, brand } from "@professionisti/ui";

/**
 * Stato di caricamento condiviso (fase "motion"): sostituisce il testo
 * statico "Caricamento..." ripetuto in ogni pagina che aspetta una
 * risposta API — un pulsare lento (`.loading-pulse`, globals.css) dà un
 * segnale di attività reale invece di un testo fermo, rispettando
 * `prefers-reduced-motion` tramite la regola globale in globals.css.
 */
export function LoadingState({ label = "Caricamento" }: { label?: string }) {
  return (
    <Text fontFamily="$body" fontWeight="700" fontSize={12} color={brand.grafite70} className="loading-pulse">
      {label}...
    </Text>
  );
}
