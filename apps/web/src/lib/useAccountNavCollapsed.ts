import { useCallback, useEffect, useSyncExternalStore } from "react";
import { ATTRIBUTE, CHANGE_EVENT, COLLAPSED, STORAGE_KEY } from "@/lib/accountNavCollapsed";

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("resize", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("resize", onChange);
  };
}

const isCollapsed = () => document.documentElement.getAttribute(ATTRIBUTE) === COLLAPSED;

/** Menu laterale ridotto a icone? E il comando per cambiarlo (vedi accountNavCollapsed.ts). */
export function useAccountNavCollapsed(): [boolean, () => boolean] {
  const collapsed = useSyncExternalStore(subscribe, isCollapsed, () => false);
  const toggle = useCallback(() => {
    const next = !isCollapsed();
    applyNavPreference(next);
    return next;
  }, []);
  return [collapsed, toggle];
}

/** Salva la scelta nel browser e aggiorna il menu (anche quella arrivata dall'account). */
export function applyNavPreference(collapsed: boolean) {
  try {
    if (localStorage.getItem(STORAGE_KEY) === (collapsed ? "1" : "0")) return;
    localStorage.setItem(STORAGE_KEY, collapsed ? "1" : "0");
  } catch {
    // archiviazione non disponibile (navigazione privata bloccata): resta lo stato automatico
  }
  // Lo script di layout.tsx ricalcola l'attributo, poi il hook lo rilegge.
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

const TIPS_ATTRIBUTE = "data-acct-tips";
const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

/**
 * Tastiera del menu laterale (docs/CHANGELOG.md §333):
 * - `[` riduce o espande il menu, fuori dai campi di testo (come Linear e Notion);
 * - Esc chiude il fumetto col nome (WCAG 1.4.13), che torna passando su
 *   un'altra voce o spostando il focus.
 */
export function useAccountNavKeys(toggle: () => unknown) {
  useEffect(() => {
    let hiddenOver: Element | null = null;
    const show = () => {
      hiddenOver = null;
      document.documentElement.removeAttribute(TIPS_ATTRIBUTE);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        hiddenOver = document.querySelector(".acct-nav-link:hover, .acct-nav-toggle:hover") ?? document.activeElement;
        document.documentElement.setAttribute(TIPS_ATTRIBUTE, "hidden");
        return;
      }
      if (event.key !== "[" || event.ctrlKey || event.metaKey || event.altKey || isTyping(event.target)) return;
      // Solo dove il menu è una colonna che si può ridurre.
      if (!window.matchMedia("(min-width: 1000px)").matches || !document.querySelector(".acct-nav-toggle")) return;
      event.preventDefault();
      toggle();
    };
    const onOver = (event: PointerEvent) => {
      if (!hiddenOver) return;
      const item = event.target instanceof Element ? event.target.closest(".acct-nav-link, .acct-nav-toggle") : null;
      if (item && item !== hiddenOver) show();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerover", onOver);
    document.addEventListener("focusin", show);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerover", onOver);
      document.removeEventListener("focusin", show);
    };
  }, [toggle]);
}
