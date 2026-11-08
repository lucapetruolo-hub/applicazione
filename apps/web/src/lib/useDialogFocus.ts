import { useEffect, useRef, type RefObject } from "react";

/**
 * Comportamento unico delle finestre (E7-02, E7-03, E7-16 del controllo
 * dell'8/11): appena la finestra compare il fuoco ci entra, il Tab gira solo
 * dentro, Esc la chiude e alla chiusura il fuoco torna dove era (di solito il
 * pulsante che l'ha aperta).
 *
 * Il fuoco va, nell'ordine, sull'elemento con `data-autofocus`, sul primo
 * comando visibile che non sia la X di chiusura (`data-dialog-close`) o, se
 * non c'è, sulla finestra stessa. La finestra va montata solo da aperta
 * (`{open ? <… ref={ref} /> : null}`): il fuoco si sposta al montaggio.
 */
export function useDialogFocus(ref: RefObject<HTMLElement | null>, onClose: () => void) {
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const visible = focusableIn(node);
    const preferred = node.querySelector<HTMLElement>("[data-autofocus]");
    const first =
      (preferred && isVisible(preferred) ? preferred : null) ??
      visible.find((el) => !el.closest("[data-dialog-close]")) ??
      null;
    if (first) {
      first.focus();
    } else {
      if (!node.hasAttribute("tabindex")) node.setAttribute("tabindex", "-1");
      node.focus();
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" && event.key !== "Tab") return;
      const active = document.activeElement;
      const inside = active instanceof Node && node.contains(active);
      // Con una seconda finestra aperta sopra questa, decide quella.
      if (!inside && active instanceof Element && active.closest('[role="dialog"], [role="alertdialog"]')) return;
      if (event.key === "Escape") {
        onCloseRef.current();
        return;
      }
      const list = focusableIn(node);
      const head = list[0];
      const tail = list[list.length - 1];
      if (!head || !tail) {
        event.preventDefault();
        return;
      }
      if (event.shiftKey && (!inside || active === head || active === node)) {
        event.preventDefault();
        tail.focus();
      } else if (!event.shiftKey && (!inside || active === tail)) {
        event.preventDefault();
        head.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      if (previous && previous.isConnected) previous.focus();
    };
  }, [ref]);
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function isVisible(el: HTMLElement): boolean {
  return el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden";
}

function focusableIn(node: HTMLElement): HTMLElement[] {
  return Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.getAttribute("aria-disabled") !== "true" && isVisible(el),
  );
}
