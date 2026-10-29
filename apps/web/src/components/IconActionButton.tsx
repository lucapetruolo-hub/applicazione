"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { brand } from "@professionisti/ui";

type IconActionButtonProps = {
  /** Descrizione mostrata passando sopra col mouse (e letta dagli screen reader). */
  label: string;
  onPress: () => void;
  children: ReactNode;
  active?: boolean;
  disabled?: boolean;
  /** Mostra la descrizione anche senza mouse sopra, es. "Link copiato" dopo un tocco. */
  forceTooltip?: boolean;
  /** Diametro in px (default 40); il cuoricino sulla foto nei risultati è più piccolo. */
  size?: number;
  /**
   * "end": fumetto allineato al bordo destro del pulsante invece che
   * centrato, per i pulsanti vicino al bordo destro dello schermo
   * (docs/CHANGELOG.md §349): centrato usciva dallo schermo.
   */
  tooltipAlign?: "center" | "end";
  /**
   * Piccolo battito quando il pulsante diventa attivo dopo un tocco (il
   * cuoricino "Salva", docs/changelog/2026-10-28-micro-interazioni.md). Non
   * parte se è già attivo al caricamento della pagina.
   */
  celebrate?: boolean;
};

/**
 * Pulsante tondo con la sola icona e la descrizione in un fumetto al
 * passaggio del mouse (richiesta esplicita dell'utente per Salva/Condividi/
 * Segnala nella pagina profilo, docs/CHANGELOG.md §206). Fumetto in CSS e non
 * `title` nativo: quello compare solo dopo circa un secondo.
 */
export function IconActionButton({ label, onPress, children, active, disabled, forceTooltip, size = 40, tooltipAlign = "center", celebrate }: IconActionButtonProps) {
  // Fuori da React Compiler: usa `<style jsx>` (docs/CHANGELOG.md §345).
  "use no memo";
  const pressedRef = useRef(false);
  const [pop, setPop] = useState(false);
  // Il salvataggio risponde dopo il tocco: il battito parte quando `active`
  // diventa vero, solo se l'ultimo cambio viene da un tocco.
  useEffect(() => {
    if (!celebrate) return;
    if (active && pressedRef.current) setPop(true);
    if (active !== undefined && !disabled) pressedRef.current = false;
  }, [active, celebrate, disabled]);
  const classes = [active ? "active" : "", pop ? "icon-action-pop" : ""].filter(Boolean).join(" ");
  return (
    <span className="icon-action">
      <button
        type="button"
        aria-label={label}
        aria-pressed={active}
        disabled={disabled}
        onClick={() => {
          pressedRef.current = true;
          setPop(false);
          onPress();
        }}
        onAnimationEnd={(event) => {
          if (event.animationName === "heart-ring") setPop(false);
        }}
        className={classes || undefined}
      >
        {children}
      </button>
      <span role="tooltip" className={`tip${tooltipAlign === "end" ? " end" : ""}${forceTooltip ? " visible" : ""}`}>
        {label}
      </span>
      <style jsx>{`
        .icon-action {
          position: relative;
          display: inline-flex;
        }
        button {
          width: ${size}px;
          height: ${size}px;
          border-radius: ${size / 2}px;
          border: 1px solid ${brand.filetto};
          background: ${brand.calce};
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          padding: 0;
          position: relative;
        }
        button:hover:not(:disabled) {
          border-color: ${brand.cianografia};
        }
        button.active {
          background: ${brand.cianografiaPieno};
          border-color: ${brand.cianografia};
        }
        button:disabled {
          opacity: 0.5;
          cursor: default;
        }
        .tip {
          position: absolute;
          top: calc(100% + 6px);
          left: 50%;
          transform: translateX(-50%);
          white-space: nowrap;
          background: ${brand.grafite};
          color: #ffffff;
          font-size: 12px;
          font-weight: 600;
          padding: 4px 8px;
          border-radius: 10px;
          pointer-events: none;
          opacity: 0;
          transition: opacity 0.12s;
          z-index: 20;
        }
        .tip.end {
          left: auto;
          right: 0;
          transform: none;
        }
        .icon-action:hover .tip,
        button:focus-visible + .tip,
        .tip.visible {
          opacity: 1;
        }
      `}</style>
    </span>
  );
}
