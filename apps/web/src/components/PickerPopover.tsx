"use client";

import { useEffect, useState, type CSSProperties, type FocusEvent, type ReactNode, type RefObject } from "react";
import { brand } from "@professionisti/ui";

/**
 * Riquadro di scelta comune ai campi ora e data del sito (rotella delle ore,
 * calendarietto dei giorni: docs/changelog/2026-11-10-campo-orario-scrivibile.md
 * e 2026-11-11-campo-data-scrivibile.md). Al computer si apre sotto il campo
 * (sopra se sotto manca spazio); sul telefono sale dal basso dello schermo,
 * con il nome del campo in alto e "Fatto". Si chiude con "Fatto", con Esc
 * (solo lui, non la finestra che contiene il campo), con un clic fuori o
 * uscendo dal campo con il Tab.
 */
export type PickerAnchor = { top: number; left: number; up: boolean };

export function usePicker({
  wrapRef,
  inputRef,
  width,
  height,
}: {
  wrapRef: RefObject<HTMLElement | null>;
  inputRef: RefObject<HTMLInputElement | null>;
  width: number;
  height: number;
}) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<PickerAnchor | null>(null);

  const place = () => {
    const box = wrapRef.current?.getBoundingClientRect();
    if (!box) return;
    const up = box.bottom + height + 8 > window.innerHeight && box.top > height + 8;
    const left = Math.max(8, Math.min(box.left, window.innerWidth - width - 8));
    setAnchor({ top: up ? box.top - 6 : box.bottom + 6, left, up });
  };

  const openPicker = () => {
    place();
    setOpen(true);
  };
  const closePicker = (focusField: boolean) => {
    setOpen(false);
    if (focusField) inputRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const target = e.target as Element;
      // Fuori dal campo, o sul fondo scuro dietro il riquadro del telefono.
      if (!wrapRef.current?.contains(target) || target.classList.contains("pk-backdrop")) setOpen(false);
    };
    // Esc chiude solo il riquadro, non la finestra che contiene il campo:
    // ascoltato in cattura, arriva prima della finestra (useDialogFocus).
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      closePicker(true);
    };
    const onMove = () => place();
    window.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", onDown);
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      document.removeEventListener("pointerdown", onDown);
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, true);
    };
    // place e closePicker leggono solo ref e setState.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /** Da mettere sul contenitore del campo: uscendo col Tab il riquadro si chiude. */
  const onWrapperBlur = (e: FocusEvent) => {
    if (!wrapRef.current?.contains(e.relatedTarget as Node | null)) setOpen(false);
  };

  return { open, anchor, openPicker, closePicker, onWrapperBlur, setOpen };
}

/** Al computer il clic nel campo apre anche il riquadro; sul telefono il tocco apre la tastiera. */
export function isFinePointer(): boolean {
  return window.matchMedia("(pointer: fine)").matches;
}

export function PickerPanel({
  id,
  title,
  ariaLabel,
  anchor,
  width,
  onDone,
  children,
}: {
  id: string;
  /** Nome del campo, scritto in alto sul telefono. */
  title: string;
  /** Nome del riquadro per il lettore di schermo. */
  ariaLabel: string;
  anchor: PickerAnchor | null;
  width: number;
  onDone: () => void;
  children: ReactNode;
}) {
  // Fuori da React Compiler: usa `<style jsx>` (docs/CHANGELOG.md §345).
  "use no memo";
  return (
    <div
      className={anchor?.up ? "pk up" : "pk"}
      style={{ "--pk-top": `${anchor?.top ?? 0}px`, "--pk-left": `${anchor?.left ?? 0}px`, "--pk-width": `${width}px` } as CSSProperties}
    >
      <div className="pk-backdrop" aria-hidden />
      <div id={id} className="pk-panel" role="dialog" aria-label={ariaLabel}>
        <p className="pk-title" aria-hidden>
          {title}
        </p>
        {children}
        <button type="button" className="pk-done" onClick={onDone}>
          Fatto
        </button>
      </div>
      <style jsx global>{`
        .pk-backdrop {
          display: none;
        }
        .pk-panel {
          position: fixed;
          z-index: 2000;
          top: var(--pk-top);
          left: var(--pk-left);
          width: var(--pk-width);
          box-sizing: border-box;
          padding: 12px;
          background: ${brand.calce};
          border: 1px solid ${brand.filetto};
          border-radius: 20px;
          box-shadow: 0 12px 32px rgba(27, 26, 24, 0.18);
          font-family: inherit;
          color: ${brand.grafite};
        }
        .pk.up .pk-panel {
          transform: translateY(-100%);
        }
        .pk-title {
          display: none;
          margin: 0 0 8px;
          font-weight: 800;
          font-size: 17px;
          color: ${brand.grafite};
          text-align: center;
        }
        .pk-done {
          margin-top: 12px;
          width: 100%;
          min-height: 44px;
          border: 0;
          border-radius: 999px;
          background: ${brand.cianografiaPieno};
          color: #fff;
          font: inherit;
          font-weight: 700;
          font-size: 16px;
          cursor: pointer;
        }
        .pk-done:focus-visible {
          outline: 2px solid ${brand.grafite};
          outline-offset: 2px;
        }
        /* Telefono: il riquadro sale dal basso dello schermo, grande da toccare. */
        @media (max-width: 639px) {
          .pk-backdrop {
            display: block;
            position: fixed;
            inset: 0;
            z-index: 1999;
            background: rgba(20, 24, 30, 0.45);
          }
          .pk-panel,
          .pk.up .pk-panel {
            top: auto;
            left: 0;
            right: 0;
            bottom: 0;
            width: auto;
            transform: none;
            padding: 16px 20px calc(16px + env(safe-area-inset-bottom));
            border-radius: 20px 20px 0 0;
          }
          .pk-title {
            display: block;
          }
        }
      `}</style>
    </div>
  );
}

/** Stile comune del campo con il pulsante a destra (orologio o calendario). */
export function PickerFieldStyles() {
  "use no memo";
  return (
    <style jsx global>{`
      .pk-field {
        position: relative;
        display: inline-block;
        min-width: 0;
      }
      .pk-field input {
        margin: 0;
        font-variant-numeric: tabular-nums;
        box-sizing: border-box;
      }
      .pk-field input::placeholder {
        color: ${brand.grafite70};
        opacity: 1;
      }
      .pk-field-btn {
        position: absolute;
        top: 50%;
        right: 4px;
        transform: translateY(-50%);
        width: 36px;
        height: 36px;
        display: flex;
        align-items: center;
        justify-content: center;
        border: 0;
        border-radius: 10px;
        background: transparent;
        color: ${brand.grafite};
        cursor: pointer;
      }
      @media (hover: hover) {
        .pk-field-btn:hover {
          background: ${brand.gesso};
        }
      }
      .pk-field-btn:focus-visible {
        outline: 2px solid ${brand.cianografiaScuro};
        outline-offset: 1px;
      }
    `}</style>
  );
}
