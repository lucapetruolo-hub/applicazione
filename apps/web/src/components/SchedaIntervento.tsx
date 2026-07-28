"use client";

import { useEffect, useState } from "react";

export type SchedaInterventoProps = {
  categoryLabel: string | null;
  city: string | null;
  urgencyLabel: string | null;
};

const FIELDS: { key: "categoria" | "zona" | "urgenza" | "sopralluogo" | "stato"; label: string }[] = [
  { key: "categoria", label: "Categoria" },
  { key: "zona", label: "Zona" },
  { key: "urgenza", label: "Urgenza" },
  { key: "sopralluogo", label: "Sopralluogo" },
  { key: "stato", label: "Stato" },
];

/**
 * "Scheda Intervento": l'elemento firma dell'hero (brief redesign §4.2).
 * Un documento tecnico stilizzato che si compila in tempo reale mentre
 * l'utente riempie i tre campi della ricerca a fianco — mostra il prodotto
 * (il preventivo strutturato) invece di descriverlo a parole.
 *
 * Componente web-only (apps/web, non packages/ui): il pattern documentale
 * (timbro obliquo, righe tratteggiate) è CSS puro specifico di questa
 * sezione, stesso principio già applicato a ResultsMap/blueprint pattern —
 * non è un primitivo riutilizzabile, è la messa in scena di questa hero.
 */
export function SchedaIntervento({ categoryLabel, city, urgencyLabel }: SchedaInterventoProps) {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(query.matches);
    const listener = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    query.addEventListener("change", listener);
    return () => query.removeEventListener("change", listener);
  }, []);

  const values: Record<(typeof FIELDS)[number]["key"], string | null> = {
    categoria: categoryLabel,
    zona: city,
    urgenza: urgencyLabel,
    sopralluogo: categoryLabel ? "Da concordare" : null,
    stato: categoryLabel && city ? "Bozza" : null,
  };

  const isReady = Boolean(categoryLabel && city && urgencyLabel);

  return (
    <div className="scheda">
      <div className="scheda-header">
        <span>SCHEDA INTERVENTO</span>
        <span>N. 0001</span>
      </div>

      <div className="scheda-body">
        {FIELDS.map((field) => {
          const value = values[field.key];
          const filled = Boolean(value);
          return (
            <div key={field.key} className={`scheda-row ${filled ? "filled" : ""}`}>
              <span className="scheda-row-label">{field.label}</span>
              <span className={`scheda-row-value ${reducedMotion ? "no-anim" : ""} ${filled ? "visible" : ""}`}>
                {value ?? ""}
              </span>
            </div>
          );
        })}
      </div>

      <div className="scheda-footer">
        <span className={`scheda-stamp ${isReady ? "ready" : ""} ${reducedMotion ? "no-anim" : ""}`}>
          {isReady ? "PRONTA PER L'INVIO" : "IN ATTESA DI PREVENTIVO"}
        </span>
      </div>

      <style jsx>{`
        .scheda {
          width: 100%;
          max-width: 380px;
          background: #ffffff;
          border: 1px solid #d6dad5;
          border-radius: 8px;
          padding: 24px;
          display: flex;
          flex-direction: column;
          gap: 20px;
        }
        .scheda-header {
          display: flex;
          justify-content: space-between;
          font-family: var(--font-mono), monospace;
          font-size: 11px;
          font-weight: 500;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #4a525e;
          padding-bottom: 12px;
          border-bottom: 1px solid #d6dad5;
        }
        .scheda-body {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .scheda-row {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          padding-bottom: 8px;
          border-bottom: 1px dashed #d6dad5;
          transition: border-color 200ms ease;
        }
        .scheda-row.filled {
          border-bottom-style: solid;
          border-bottom-color: #1b4d8f;
        }
        .scheda-row-label {
          font-family: var(--font-mono), monospace;
          font-size: 11px;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: #4a525e;
        }
        .scheda-row-value {
          font-family: var(--font-body), sans-serif;
          font-size: 15px;
          font-weight: 600;
          color: #14181e;
          opacity: 0;
          transform: translateY(8px);
          transition:
            opacity 200ms ease,
            transform 200ms ease;
        }
        .scheda-row-value.visible {
          opacity: 1;
          transform: translateY(0);
        }
        .scheda-row-value.no-anim {
          transition: none;
        }
        .scheda-footer {
          display: flex;
          justify-content: flex-end;
          padding-top: 4px;
        }
        .scheda-stamp {
          font-family: var(--font-mono), monospace;
          font-size: 11px;
          font-weight: 500;
          letter-spacing: 0.06em;
          padding: 6px 12px;
          border: 1.5px solid #c8362b;
          color: #c8362b;
          border-radius: 4px;
          transform: rotate(-4deg);
          transition:
            color 200ms ease,
            border-color 200ms ease;
        }
        .scheda-stamp.ready {
          color: #1f7a52;
          border-color: #1f7a52;
        }
        .scheda-stamp.no-anim {
          transition: none;
        }
      `}</style>
    </div>
  );
}
