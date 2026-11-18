"use client";

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

/**
 * Cambiare l'ordine delle miniature delle foto trascinandole (richiesta di
 * Luca del 18/11, docs/changelog/2026-11-18-luci-ia-solo-con-ia.md).
 *
 * - Dito: si tiene premuta la miniatura un attimo (280 ms) e poi si sposta;
 *   un tocco veloce o uno scorrimento della pagina non la prendono.
 * - Mouse: si prende e si sposta subito.
 * - Tastiera: frecce sinistra/destra sulla miniatura col fuoco.
 * Mentre la miniatura passa sopra un'altra si scambiano di posto, così si vede
 * subito il nuovo ordine (funziona anche su più righe). Niente librerie.
 *
 * `move(from, to)` deve spostare l'elemento nello stato (con un aggiornamento
 * a funzione); `label(index)` dà il nome della miniatura al lettore di schermo.
 * Il contenitore riceve `containerRef`, ogni miniatura `itemProps(index)` e la
 * classe `reorder-item` (stili in globals.css). `announcement` va in una zona
 * `aria-live`.
 */
const HOLD_MS = 280;
const TOUCH_SLOP = 8;
const MOUSE_SLOP = 4;

type DragState = {
  index: number;
  pointerId: number;
  pointerType: string;
  startX: number;
  startY: number;
  /** Dove il dito ha preso la miniatura, rispetto al suo angolo. */
  grabX: number;
  grabY: number;
  active: boolean;
  timer: ReturnType<typeof setTimeout> | null;
  el: HTMLElement;
  tx: number;
  ty: number;
  /** Ascoltatori sulla finestra di questo trascinamento, tolti alla fine. */
  onMove: (event: PointerEvent) => void;
  onUp: (event: PointerEvent) => void;
};

export function usePhotoReorder({
  count,
  move,
  label,
}: {
  count: number;
  move: (from: number, to: number) => void;
  label: (index: number) => string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const moveRef = useRef(move);
  const countRef = useRef(count);
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    moveRef.current = move;
    countRef.current = count;
  });

  // Mentre si trascina col dito la pagina non scorre.
  useEffect(() => {
    const block = (event: TouchEvent) => {
      if (dragRef.current?.active) event.preventDefault();
    };
    document.addEventListener("touchmove", block, { passive: false });
    return () => {
      document.removeEventListener("touchmove", block);
      stop(false);
    };
  }, []);

  function items(): HTMLElement[] {
    return Array.from(containerRef.current?.querySelectorAll<HTMLElement>("[data-reorder-index]") ?? []);
  }

  function place(drag: DragState, x: number, y: number) {
    const rect = drag.el.getBoundingClientRect();
    // Posizione "vera" della miniatura (senza lo spostamento disegnato): dopo uno
    // scambio cambia, perché la miniatura è passata in un altro posto della fila.
    const left = rect.left - drag.tx;
    const top = rect.top - drag.ty;
    drag.tx = x - drag.grabX - left;
    drag.ty = y - drag.grabY - top;
    drag.el.style.transform = `translate(${drag.tx}px, ${drag.ty}px) scale(1.06)`;
  }

  function activate(drag: DragState) {
    drag.active = true;
    drag.el.dataset.dragging = "true";
    if (drag.pointerType !== "mouse") navigator.vibrate?.(10);
  }

  function onWindowMove(drag: DragState, event: PointerEvent) {
    if (dragRef.current !== drag || event.pointerId !== drag.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.active) {
      if (drag.pointerType === "mouse") {
        if (Math.hypot(dx, dy) < MOUSE_SLOP) return;
        activate(drag);
      } else {
        // Il dito si è mosso prima della pressione lunga: è uno scorrimento.
        if (Math.hypot(dx, dy) > TOUCH_SLOP) stop(false);
        return;
      }
    }
    event.preventDefault();
    place(drag, event.clientX, event.clientY);
    const over = items().find((item) => {
      if (item === drag.el) return false;
      const rect = item.getBoundingClientRect();
      return event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
    });
    const to = over ? Number(over.dataset.reorderIndex) : -1;
    if (to >= 0 && to !== drag.index) {
      moveRef.current(drag.index, to);
      drag.index = to;
    }
  }

  function stop(announce: boolean) {
    const drag = dragRef.current;
    if (!drag) return;
    window.removeEventListener("pointermove", drag.onMove);
    window.removeEventListener("pointerup", drag.onUp);
    window.removeEventListener("pointercancel", drag.onUp);
    if (drag.timer) clearTimeout(drag.timer);
    drag.el.style.transform = "";
    delete drag.el.dataset.dragging;
    if (announce && drag.active) setAnnouncement(`Spostata al posto ${drag.index + 1} di ${countRef.current}.`);
    dragRef.current = null;
  }

  function itemProps(index: number) {
    return {
      "data-reorder-index": index,
      tabIndex: 0,
      role: "group",
      "aria-roledescription": "foto da riordinare",
      "aria-label": `${label(index)}, posto ${index + 1} di ${count}. Frecce sinistra e destra per spostarla.`,
      onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
        if (count < 2 || event.button !== 0 || dragRef.current) return;
        // Il tasto per togliere la foto resta un tasto.
        if ((event.target as HTMLElement).closest('button, [role="button"]')) return;
        const el = event.currentTarget;
        const rect = el.getBoundingClientRect();
        const drag: DragState = {
          index,
          pointerId: event.pointerId,
          pointerType: event.pointerType,
          startX: event.clientX,
          startY: event.clientY,
          grabX: event.clientX - rect.left,
          grabY: event.clientY - rect.top,
          active: false,
          timer: null,
          el,
          tx: 0,
          ty: 0,
          onMove: (moveEvent) => onWindowMove(drag, moveEvent),
          onUp: (upEvent) => {
            if (dragRef.current === drag && upEvent.pointerId === drag.pointerId) stop(true);
          },
        };
        if (event.pointerType !== "mouse") {
          drag.timer = setTimeout(() => {
            drag.timer = null;
            if (dragRef.current === drag) activate(drag);
          }, HOLD_MS);
        }
        dragRef.current = drag;
        window.addEventListener("pointermove", drag.onMove, { passive: false });
        window.addEventListener("pointerup", drag.onUp);
        window.addEventListener("pointercancel", drag.onUp);
      },
      // Niente menu "Salva immagine" del telefono durante la pressione lunga.
      onContextMenu: (event: ReactMouseEvent<HTMLElement>) => {
        if (count > 1) event.preventDefault();
      },
      onKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => {
        if (event.target !== event.currentTarget) return;
        const to = event.key === "ArrowLeft" ? index - 1 : event.key === "ArrowRight" ? index + 1 : -1;
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault();
        if (to < 0 || to >= count) return;
        moveRef.current(index, to);
        setAnnouncement(`Spostata al posto ${to + 1} di ${count}.`);
        // Spostando la miniatura il browser può perdere il fuoco: lo rimettiamo.
        requestAnimationFrame(() => {
          containerRef.current?.querySelector<HTMLElement>(`[data-reorder-index="${to}"]`)?.focus();
        });
      },
    };
  }

  return { containerRef, itemProps, announcement };
}

/** Sposta un elemento di un elenco da `from` a `to` (nuovo elenco). */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return [...list];
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item as T);
  return next;
}
