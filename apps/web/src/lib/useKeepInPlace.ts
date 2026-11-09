"use client";

import { useCallback, useEffect, useLayoutEffect, useRef } from "react";

/** Per quanto tempo dopo un tocco si tiene fermo il riquadro: copre anche le risposte lente dell'API. */
const HOLD_MS = 4000;
const SCROLL_KEYS = new Set(["PageUp", "PageDown", "ArrowUp", "ArrowDown", "Home", "End"]);

/**
 * Tiene fermo sullo schermo un riquadro mentre lo si usa
 * (docs/changelog/2026-11-09-giorno-per-giorno-fermo.md).
 *
 * Un tocco dentro il riquadro ne segna la posizione; se dopo il tocco la
 * pagina cambia altezza (il riquadro si accorcia in fondo alla pagina, o
 * Safari, che non tiene ferma la vista da solo, vede crescere qualcosa più
 * su), la pagina torna dov'era prima di disegnare. Uno spazio vuoto in fondo
 * (`spacerRef`) evita che il browser la trascini su quando il riquadro si
 * accorcia; si ritira da solo man mano che si scorre verso l'alto.
 * Se la persona scorre lei, il riquadro non viene più tenuto.
 */
export function useKeepInPlace<T extends HTMLElement>() {
  const anchorRef = useRef<T>(null);
  const spacerRef = useRef<HTMLDivElement>(null);
  const pending = useRef<{ top: number; until: number } | null>(null);

  const remember = useCallback(() => {
    const el = anchorRef.current;
    if (!el) return;
    pending.current = { top: el.getBoundingClientRect().top, until: Date.now() + HOLD_MS };
  }, []);

  // A ogni disegno, prima che si veda: nessun salto visibile.
  useLayoutEffect(() => {
    const held = pending.current;
    const el = anchorRef.current;
    if (!held || !el) return;
    if (Date.now() > held.until) {
      pending.current = null;
      return;
    }
    const spacer = spacerRef.current;
    if (spacer) spacer.style.height = "0px";
    // Posizione nella pagina, non sullo schermo: non cambia se il browser ha già spostato la vista.
    const target = Math.max(0, el.getBoundingClientRect().top + window.scrollY - held.top);
    if (spacer) {
      const missing = target + window.innerHeight - document.documentElement.scrollHeight;
      spacer.style.height = missing > 0 ? `${Math.ceil(missing)}px` : "0px";
    }
    if (Math.abs(window.scrollY - target) >= 1) window.scrollTo({ top: target, behavior: "instant" });
  });

  useEffect(() => {
    const release = () => {
      pending.current = null;
    };
    const onKey = (e: KeyboardEvent) => {
      if (SCROLL_KEYS.has(e.key)) release();
    };
    // Lo spazio in fondo resta solo finché serve a tenere la vista dov'è.
    const onScroll = () => {
      const spacer = spacerRef.current;
      if (!spacer || pending.current) return;
      const height = spacer.offsetHeight;
      if (height === 0) return;
      const needed = window.scrollY + window.innerHeight - (document.documentElement.scrollHeight - height);
      const next = Math.max(0, Math.min(height, Math.ceil(needed)));
      if (next !== height) spacer.style.height = `${next}px`;
    };
    window.addEventListener("wheel", release, { passive: true });
    window.addEventListener("touchmove", release, { passive: true });
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("wheel", release);
      window.removeEventListener("touchmove", release);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  return { anchorRef, spacerRef, remember };
}
