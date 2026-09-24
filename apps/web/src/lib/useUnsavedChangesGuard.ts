"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Avviso "modifiche non salvate" (richiesta esplicita dell'utente, profilo
 * professionista — docs/CHANGELOG.md §136). Finché `isDirty` è vero:
 * - chiusura/ricarica della scheda o link verso un altro sito → finestra
 *   nativa del browser (`beforeunload`, testo deciso dal browser);
 * - click su un link interno del sito (header, menu, footer, `<Link>`) →
 *   il click viene fermato e il link resta in `pendingHref`, così la pagina
 *   può mostrare il proprio popup e decidere dopo se proseguire.
 *
 * Il listener sta in fase di cattura sul `document`: gira prima di quello di
 * React (montato sul contenitore dell'app), quindi fermando lì il click
 * nemmeno `next/link` avvia la navigazione. Non copre le navigazioni fatte
 * da codice (`router.push` da un bottone) né il tasto "indietro" del
 * browser, che l'App Router di Next.js non permette di intercettare.
 */
export function useUnsavedChangesGuard(isDirty: boolean) {
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  useEffect(() => {
    if (!isDirty) return;

    function onBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }

    function onClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;
      const url = new URL(anchor.href, window.location.href);
      // Link verso un altro sito: ci pensa `beforeunload`.
      if (url.origin !== window.location.origin) return;
      // Stessa pagina (es. ancora #sezione): nessuna uscita.
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      event.preventDefault();
      event.stopPropagation();
      setPendingHref(url.pathname + url.search + url.hash);
    }

    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [isDirty]);

  const cancelLeave = useCallback(() => setPendingHref(null), []);

  return { pendingHref, cancelLeave };
}
