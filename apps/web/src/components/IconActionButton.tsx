"use client";

import type { ReactNode } from "react";
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
};

/**
 * Pulsante tondo con la sola icona e la descrizione in un fumetto al
 * passaggio del mouse (richiesta esplicita dell'utente per Salva/Condividi/
 * Segnala nella pagina profilo, docs/CHANGELOG.md §206). Fumetto in CSS e non
 * `title` nativo: quello compare solo dopo circa un secondo.
 */
export function IconActionButton({ label, onPress, children, active, disabled, forceTooltip, size = 40, tooltipAlign = "center" }: IconActionButtonProps) {
  // Fuori da React Compiler: usa `<style jsx>` (docs/CHANGELOG.md §345).
  "use no memo";
  return (
    <span className="icon-action">
      <button
        type="button"
        aria-label={label}
        aria-pressed={active}
        disabled={disabled}
        onClick={onPress}
        className={active ? "active" : undefined}
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
