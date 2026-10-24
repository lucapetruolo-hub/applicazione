"use client";

import type { CSSProperties } from "react";

/**
 * Campo data che mostra sempre gg/mm/aaaa (docs/CHANGELOG.md §291,
 * richiesta dell'utente): il campo data del browser segue la lingua del
 * browser, non quella del sito, e su un computer in inglese mostrava
 * "mm/dd/yyyy". Resta il campo nativo (calendario del telefono, tastiera,
 * accessibilità): il suo testo è nascosto e sopra si scrive la data in
 * italiano. Valore e onChange come il campo nativo (AAAA-MM-GG).
 */
export function ItalianDateInput({
  value,
  onChange,
  min,
  max,
  ariaLabel,
  className,
  style,
  padX = 12,
}: {
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  ariaLabel?: string;
  className?: string;
  style?: CSSProperties;
  /** Spazio a sinistra del testo, uguale al padding del campo. */
  padX?: number;
}) {
  const [year, month, day] = value.split("-");
  const shown = year && month && day ? `${day}/${month}/${year}` : "gg/mm/aaaa";
  const { flex, minWidth, width, ...inputStyle } = style ?? {};

  return (
    <span className="it-date" style={{ flex, minWidth, width }}>
      <input
        type="date"
        lang="it"
        aria-label={ariaLabel}
        className={className}
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(e.target.value)}
        onClick={(e) => {
          try {
            e.currentTarget.showPicker?.();
          } catch {
            // Browser senza showPicker: si apre col tocco sull'icona.
          }
        }}
        style={{ ...inputStyle, width: "100%" }}
      />
      <span aria-hidden className={value ? "it-date-text" : "it-date-text empty"} style={{ paddingLeft: padX + 1, fontSize: inputStyle.fontSize, color: inputStyle.color }}>
        {shown}
      </span>
      <style jsx global>{`
        .it-date {
          position: relative;
          display: inline-block;
          min-width: 0;
        }
        .it-date input {
          color: transparent;
        }
        .it-date input::-webkit-datetime-edit {
          opacity: 0;
        }
        .it-date-text {
          position: absolute;
          left: 0;
          top: 0;
          bottom: 0;
          display: flex;
          align-items: center;
          pointer-events: none;
          color: inherit;
          font-variant-numeric: tabular-nums;
        }
        .it-date-text.empty {
          opacity: 0.55;
        }
      `}</style>
    </span>
  );
}
