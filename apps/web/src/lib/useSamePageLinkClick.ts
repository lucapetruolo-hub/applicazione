"use client";

import { useEffect, useRef } from "react";

/**
 * Chiama `onClick` quando si clicca un link che porta alla pagina già aperta
 * (stesso percorso), per esempio "Le mie richieste" nel menu mentre si è già
 * lì. Next.js in quel caso non ricarica la pagina e lo stato resta com'era:
 * serve per chiudere un modulo aperto e tornare all'elenco (richiesta
 * esplicita dell'utente, docs/CHANGELOG.md §336). Ascolta tutto il
 * documento, così vale per il menu laterale, la barra in basso e
 * l'intestazione senza toccarli.
 */
export function useSamePageLinkClick(onClick: () => void, enabled = true) {
  const onClickRef = useRef(onClick);
  useEffect(() => {
    onClickRef.current = onClick;
  });

  useEffect(() => {
    if (!enabled) return;
    function handleClick(event: MouseEvent) {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(anchor instanceof HTMLAnchorElement) || anchor.target === "_blank") return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin === window.location.origin && url.pathname === window.location.pathname) onClickRef.current();
    }
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [enabled]);
}
