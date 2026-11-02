import { useEffect, useState } from "react";

/**
 * Elenco dei comuni d'Italia (~8000, 175 KB compressi) caricato solo quando
 * serve, non con la pagina (collaudo N-01, docs/changelog/2026-10-30-velocita-telefono.md):
 * nella home, nella ricerca e nelle pagine città teneva il telefono occupato
 * per un secondo prima che la pagina rispondesse ai tocchi. Le pagine del
 * server (titoli, indirizzi delle città) lo leggono come prima da
 * `@professionisti/shared`; nel browser si passa da qui.
 */
export type ComuniModule = typeof import("./comuniData");

let loaded: ComuniModule | null = null;
let pending: Promise<ComuniModule> | null = null;

export function loadComuni(): Promise<ComuniModule> {
  pending ??= import("./comuniData").then(
    (module) => (loaded = module),
    (error: unknown) => {
      // Rete caduta: al prossimo tentativo si riprova.
      pending = null;
      throw error;
    },
  );
  return pending;
}

/**
 * Elenco dei comuni, o `null` finché non è arrivato. Con `eager` si scarica
 * subito; altrimenti al primo campo selezionato della pagina (per scrivere
 * una città bisogna prima toccare il campo), così chi legge e basta non lo
 * scarica mai.
 */
export function useComuni(eager = false): ComuniModule | null {
  const [comuni, setComuni] = useState<ComuniModule | null>(loaded);
  useEffect(() => {
    if (comuni) return;
    let active = true;
    const start = () => {
      loadComuni().then(
        (module) => {
          if (active) setComuni(module);
        },
        () => undefined,
      );
    };
    if (eager) {
      start();
      return () => {
        active = false;
      };
    }
    window.addEventListener("focusin", start, { once: true });
    return () => {
      active = false;
      window.removeEventListener("focusin", start);
    };
  }, [comuni, eager]);
  return comuni;
}
