"use client";

import { useEffect, useState } from "react";
import { PROBLEM_SEARCH_LABEL, PROBLEM_THINKING_AFTER_MS, PROBLEM_THINKING_LABEL } from "@/lib/navigationProgress";

/**
 * La frase dell'attesa della ricerca dal problema: "Cerco chi ti serve…",
 * poi, se l'attesa dura, "Sto pensando a chi può aiutarti…"
 * (docs/changelog/2026-11-12-attesa-ia-5-secondi.md). Altre frasi restano come sono.
 */
export function useThinkingLabel(label: string | undefined): string | undefined {
  const [thinkingFor, setThinkingFor] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (label !== PROBLEM_SEARCH_LABEL) return;
    const timer = window.setTimeout(() => setThinkingFor(label), PROBLEM_THINKING_AFTER_MS);
    return () => {
      window.clearTimeout(timer);
      setThinkingFor(undefined);
    };
  }, [label]);
  return label === PROBLEM_SEARCH_LABEL && thinkingFor === label ? PROBLEM_THINKING_LABEL : label;
}
