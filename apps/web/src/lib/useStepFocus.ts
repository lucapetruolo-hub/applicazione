"use client";

import { useEffect, useRef } from "react";

// Il primo titolo mostrato dopo l'apertura del sito non prende il fuoco:
// chi arriva da un link parte dall'inizio della pagina, come sempre.
let firstStepShown = false;

/**
 * Porta il fuoco sul titolo del passo quando il passo cambia, nei moduli a
 * passi (registrazione, richiesta di preventivo, dati fiscali): prima il
 * fuoco restava sul pulsante del passo vecchio o tornava alla pagina intera
 * e chi usa tastiera o lettore di schermo non sapeva che il passo era
 * cambiato (docs/changelog/2026-10-30-tastiera.md, collaudo L-06).
 * L'elemento deve avere `tabIndex={-1}`.
 */
export function useStepFocus<T extends HTMLElement>(step: string | number) {
  const ref = useRef<T>(null);
  const lastStep = useRef<string | number | null>(null);
  useEffect(() => {
    if (lastStep.current === step) return;
    lastStep.current = step;
    if (!firstStepShown) {
      firstStepShown = true;
      return;
    }
    ref.current?.focus();
  }, [step]);
  return ref;
}
