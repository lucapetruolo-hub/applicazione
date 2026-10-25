import { useEffect, useState, type RefObject } from "react";

/**
 * Dice se una barra che scorre in orizzontale ha ancora contenuto a destra
 * (docs/CHANGELOG.md §346): le barre a schede delle aree riservate, su
 * telefono, sfumano il bordo destro finché c'è altro da vedere. Prima la
 * barra era tagliata di netto, senza nessun segnale che continuava.
 */
export function useScrollMoreRight(ref: RefObject<HTMLElement | null>): boolean {
  const [moreRight, setMoreRight] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = () => setMoreRight(element.scrollWidth - element.clientWidth - element.scrollLeft > 4);
    update();
    element.addEventListener("scroll", update, { passive: true });
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    observer?.observe(element);
    return () => {
      element.removeEventListener("scroll", update);
      observer?.disconnect();
    };
  }, [ref]);
  return moreRight;
}
