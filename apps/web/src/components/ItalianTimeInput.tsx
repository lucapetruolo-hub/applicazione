"use client";

import type { CSSProperties } from "react";

/**
 * Campo ora che mostra sempre 24 ore, "14:00" e mai "02:00 PM"
 * (docs/CHANGELOG.md §357): come per ItalianDateInput, il campo ora del
 * browser segue la lingua del browser, non quella del sito. Resta il campo
 * nativo (selettore del telefono, tastiera, accessibilità): il suo testo è
 * nascosto e sopra si scrive l'ora. Valore e onChange come il campo nativo (HH:MM).
 */
export function ItalianTimeInput({
  value,
  onChange,
  ariaLabel,
  className,
  wrapperClassName,
  style,
  step,
  padX = 12,
}: {
  value: string;
  onChange: (value: string) => void;
  ariaLabel?: string;
  className?: string;
  /** Classe del contenitore, per dargli la larghezza da CSS. */
  wrapperClassName?: string;
  style?: CSSProperties;
  /** Passo in secondi, come l'attributo del campo nativo (900 = 15 minuti). */
  step?: number;
  /** Spazio a sinistra del testo, uguale al padding del campo. */
  padX?: number;
}) {
  // Fuori da React Compiler: usa `<style jsx>` (docs/CHANGELOG.md §345).
  "use no memo";
  const shown = /^\d{2}:\d{2}/.test(value) ? value.slice(0, 5) : "--:--";
  const { flex, minWidth, width, ...inputStyle } = style ?? {};

  return (
    <span className={wrapperClassName ? `it-time ${wrapperClassName}` : "it-time"} style={{ flex, minWidth, width }}>
      <input
        type="time"
        lang="it"
        aria-label={ariaLabel}
        className={className}
        value={value}
        step={step}
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
      <span aria-hidden className={value ? "it-time-text" : "it-time-text empty"} style={{ paddingLeft: padX + 1, fontSize: inputStyle.fontSize, color: inputStyle.color }}>
        {shown}
      </span>
      <style jsx global>{`
        .it-time {
          position: relative;
          display: inline-block;
          min-width: 0;
        }
        .it-time input {
          color: transparent;
        }
        .it-time input::-webkit-datetime-edit {
          opacity: 0;
        }
        .it-time-text {
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
        .it-time-text.empty {
          opacity: 0.72;
        }
      `}</style>
    </span>
  );
}
