import { useCallback, useSyncExternalStore } from "react";
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
export function useAccountNavCollapsed(): [boolean, () => void] {
  const collapsed = useSyncExternalStore(subscribe, isCollapsed, () => false);
  const toggle = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY, isCollapsed() ? "0" : "1");
    } catch {
      // archiviazione non disponibile (navigazione privata bloccata): resta lo stato automatico
    }
    // Lo script di layout.tsx ricalcola l'attributo, poi il hook lo rilegge.
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);
  return [collapsed, toggle];
}
