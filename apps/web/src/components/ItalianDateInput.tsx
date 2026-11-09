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
  // Fuori da React Compiler: usa `<style jsx>` (docs/CHANGELOG.md §345).
  "use no memo";
  const [year, month, day] = value.split("-");
  const shown = year && month && day ? `${day}/${month}/${year}` : "gg/mm/aaaa";
  const { flex, minWidth, width, ...inputStyle } = style ?? {};
  // Il colore va solo sul testo scritto sopra: dato al campo nativo, su
  // Safari per iPhone il suo testo restava visibile e l'ora si leggeva
  // due volte ("08:0008:00", docs/changelog/2026-11-09-orari-doppi-iphone.md).
  const { color, ...nativeStyle } = inputStyle;

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
        style={{ ...nativeStyle, width: "100%" }}
      />
      <span aria-hidden className={value ? "it-date-text" : "it-date-text empty"} style={{ paddingLeft: padX + 1, fontSize: inputStyle.fontSize, color }}>
        {shown}
      </span>
      <style jsx global>{`
        .it-date {
          position: relative;
          display: inline-block;
          min-width: 0;
        }
        /* Su Safari per iPhone il campo nativo ha un aspetto suo (grigio, come
           spento, e più largo della misura data) e scrive il valore in
           ::-webkit-date-and-time-value, non in ::-webkit-datetime-edit:
           senza aspetto nativo e con il testo trasparente si vede solo
           quello scritto sopra. */
        .it-date input {
          -webkit-appearance: none;
          appearance: none;
          color: transparent;
          -webkit-text-fill-color: transparent;
          margin: 0;
        }
        .it-date input::-webkit-datetime-edit {
          opacity: 0;
        }
        .it-date input::-webkit-date-and-time-value {
          opacity: 0;
          text-align: left;
          /* Senza aspetto nativo, vuoto, il campo si schiaccerebbe. */
          min-height: 1.2em;
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
          /* Abbastanza scuro da leggersi (contrasto 4,5:1, A4 di docs/CHANGELOG.md §310). */
          opacity: 0.72;
        }
      `}</style>
    </span>
  );
}
