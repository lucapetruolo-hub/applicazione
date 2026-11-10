"use client";

import type { MouseEvent } from "react";

/**
 * "Vai al contenuto" (Fase 6, accessibilità): invisibile finché non riceve il
 * fuoco da tastiera. Oltre a saltare all'ancora porta il fuoco sul contenuto,
 * così anche Safari e VoiceOver proseguono da lì (E7-17 del controllo
 * dell'8/11). Il `tabindex` resta sul contenuto solo finché ha il fuoco: un
 * `<main>` sempre focalizzabile prenderebbe il fuoco a ogni clic nella pagina.
 */
export function SkipLink() {
  function onClick(event: MouseEvent<HTMLAnchorElement>) {
    const main = document.getElementById("main-content");
    if (!main) return;
    event.preventDefault();
    main.setAttribute("tabindex", "-1");
    main.focus();
    main.addEventListener("blur", () => main.removeAttribute("tabindex"), { once: true });
  }
  return (
    <a href="#main-content" className="skip-link" onClick={onClick}>
      Vai al contenuto
    </a>
  );
}
