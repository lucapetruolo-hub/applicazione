"use client";

import { useEffect, useRef } from "react";

/**
 * Chiama `onClick` a ogni clic su un link interno del sito (menu laterale,
 * barra del telefono, intestazione), prima che Next.js cambi pagina: chi
 * chiama può chiudere un modulo aperto o fermare il cambio di pagina con
 * `event.preventDefault()` per chiedere conferma (docs/CHANGELOG.md §343).
 * Serve anche per "Le mie richieste" mentre si è già lì: Next.js non
 * ricarica la stessa pagina e lo stato resterebbe com'era. In ascolto in
 * fase di cattura, così arriva prima del gestore di `Link`, senza toccare
 * i menu.
 */
export function useInternalLinkClick(onClick: (url: URL, event: MouseEvent) => void, enabled = true) {
  const onClickRef = useRef(onClick);
  useEffect(() => {
    onClickRef.current = onClick;
  });

  useEffect(() => {
    if (!enabled) return;
    function handleClick(event: MouseEvent) {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(anchor instanceof HTMLAnchorElement) || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      onClickRef.current(url, event);
      // Fermato: niente gestore di `Link` dopo di noi.
      if (event.defaultPrevented) event.stopPropagation();
    }
    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, [enabled]);
}
