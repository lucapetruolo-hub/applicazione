import { useCallback, useSyncExternalStore } from "react";
import { ATTRIBUTE, CHANGE_EVENT, COLLAPSED, STORAGE_KEY } from "@/lib/accountNavCollapsed";

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => window.removeEventListener(CHANGE_EVENT, onChange);
}

const isCollapsed = () => document.documentElement.getAttribute(ATTRIBUTE) === COLLAPSED;

/** Menu laterale ridotto a icone? E il comando per cambiarlo (vedi accountNavCollapsed.ts). */
export function useAccountNavCollapsed(): [boolean, () => void] {
  const collapsed = useSyncExternalStore(subscribe, isCollapsed, () => false);
  const toggle = useCallback(() => {
    const next = !isCollapsed();
    if (next) document.documentElement.setAttribute(ATTRIBUTE, COLLAPSED);
    else document.documentElement.removeAttribute(ATTRIBUTE);
    try {
      if (next) localStorage.setItem(STORAGE_KEY, "1");
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      // archiviazione non disponibile: la scelta vale fino alla chiusura della pagina
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);
  return [collapsed, toggle];
}
