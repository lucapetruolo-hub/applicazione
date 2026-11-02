"use client";

import { useEffect, useState } from "react";

/**
 * Elenco dei comuni caricato solo quando serve (docs/changelog/2026-11-02-nextjs-16.md):
 * sono circa 100 KB compressi, che la home e le barre di ricerca mandavano a
 * ogni visita anche a chi non tocca il campo "Città". Qui arriva dopo che la
 * pagina è pronta, prima che si scriva una città; chi deve usarlo subito
 * (per esempio al clic su "Cerca") aspetta `loadComuni()`.
 */
export type ComuniModule = typeof import("@professionisti/shared/comuni");

let loaded: ComuniModule | null = null;
let pending: Promise<ComuniModule> | null = null;

export function loadComuni(): Promise<ComuniModule> {
  if (loaded) return Promise.resolve(loaded);
  pending ??= import("@professionisti/shared/comuni").then(
    (module) => (loaded = module),
    (error: unknown) => {
      // Rete caduta: al prossimo tentativo si riprova.
      pending = null;
      throw error;
    },
  );
  return pending;
}

/** L'elenco, `null` finché non è arrivato. Lo chiede quando il browser è libero. */
export function useComuni(): ComuniModule | null {
  const [comuni, setComuni] = useState<ComuniModule | null>(loaded);
  useEffect(() => {
    if (comuni) return;
    let active = true;
    const load = () =>
      loadComuni().then(
        (module) => {
          if (active) setComuni(module);
        },
        () => {},
      );
    const idle = typeof window.requestIdleCallback === "function" ? window.requestIdleCallback(load, { timeout: 2000 }) : window.setTimeout(load, 300);
    return () => {
      active = false;
      if (typeof window.cancelIdleCallback === "function") window.cancelIdleCallback(idle);
      else window.clearTimeout(idle);
    };
  }, [comuni]);
  return comuni;
}
