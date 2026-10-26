"use client";

import type { BillingInterval } from "@professionisti/shared";
import { brand } from "@professionisti/ui";

/**
 * Interruttore Mensile / Annuale dei prezzi dell'abbonamento (docs/CHANGELOG.md
 * §354, decisione dell'utente): l'annuale è quello mostrato per primo e dice
 * quanto si risparmia. Usato nella pagina prezzi e in Abbonamento.
 */
export function BillingIntervalToggle({ value, onChange }: { value: BillingInterval; onChange: (value: BillingInterval) => void }) {
  // Fuori da React Compiler: usa `<style jsx>` (docs/CHANGELOG.md §345).
  "use no memo";
  return (
    <div className="interval-toggle" role="group" aria-label="Rinnovo dell'abbonamento">
      <button type="button" aria-pressed={value === "MONTH"} onClick={() => onChange("MONTH")}>
        Mensile
      </button>
      <button type="button" aria-pressed={value === "YEAR"} onClick={() => onChange("YEAR")}>
        Annuale · <span className="save">Risparmi 2 mesi</span>
      </button>
      <style jsx>{`
        .interval-toggle {
          display: inline-flex;
          align-self: flex-start;
          gap: 2px;
          padding: 4px;
          border-radius: 999px;
          background: ${brand.calce};
          border: 1px solid rgba(43, 36, 32, 0.14);
        }
        button {
          all: unset;
          cursor: pointer;
          padding: 9px 16px;
          border-radius: 999px;
          font-size: 15px;
          font-weight: 600;
          color: ${brand.grafite70};
          white-space: nowrap;
        }
        button:focus-visible {
          outline: 2px solid ${brand.cianografiaScuro};
          outline-offset: 2px;
        }
        button[aria-pressed="true"] {
          background: ${brand.grafite};
          color: #fff;
        }
        .save {
          color: ${brand.cianografiaScuro};
          font-weight: 700;
        }
        button[aria-pressed="true"] .save {
          color: #9fe3c2;
        }
        @media (max-width: 420px) {
          button {
            padding: 9px 12px;
            font-size: 14px;
          }
        }
      `}</style>
    </div>
  );
}
