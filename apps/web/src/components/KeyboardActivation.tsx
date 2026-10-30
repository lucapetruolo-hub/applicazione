"use client";

import { useEffect } from "react";

/**
 * Invio e Spazio su ogni comando fatto con un riquadro (role="button",
 * "checkbox", "switch"…), come su un pulsante vero
 * (docs/changelog/2026-10-30-tastiera.md, collaudo L-01 e L-02).
 *
 * Tamagui rende raggiungibili col Tab i riquadri con `onPress` e un ruolo,
 * ma non li fa partire dalla tastiera: le schede delle richieste, il menu
 * "Azioni", i filtri e la casella dei Termini si raggiungevano e poi non
 * rispondevano. Un solo ascoltatore per tutto il sito, così vale anche per
 * i comandi che verranno. Un comando che gestisce già i tasti da sé chiama
 * `preventDefault()` e qui non succede altro.
 */
const ENTER_OR_SPACE = new Set(["button", "menuitem", "menuitemcheckbox", "menuitemradio", "tab", "switch", "option"]);
const SPACE_ONLY = new Set(["checkbox", "radio"]);
const NATIVE = new Set(["BUTTON", "A", "INPUT", "TEXTAREA", "SELECT", "SUMMARY"]);

export function KeyboardActivation() {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key !== "Enter" && event.key !== " ") return;
      const target = event.target;
      if (!(target instanceof HTMLElement) || NATIVE.has(target.tagName) || target.isContentEditable) return;
      const role = target.getAttribute("role");
      if (!role || target.getAttribute("aria-disabled") === "true") return;
      const activates =
        ENTER_OR_SPACE.has(role) || (SPACE_ONLY.has(role) && event.key === " ") || (role === "link" && event.key === "Enter");
      if (!activates) return;
      // Spazio non deve far scorrere la pagina.
      event.preventDefault();
      target.click();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);
  return null;
}
