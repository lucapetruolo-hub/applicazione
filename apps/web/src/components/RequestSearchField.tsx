"use client";

import { useRef, type CSSProperties } from "react";
import { Icon, brand } from "@professionisti/ui";

/**
 * Casella di ricerca delle richieste, uguale per cliente e professionista
 * (docs/changelog/2026-11-11-ricerca-fuori-dai-filtri.md): lente a sinistra,
 * così si capisce subito che è una ricerca, e una X per cancellare quello che
 * si è scritto (area di tocco 44 × 44 px), che riporta il cursore nella
 * casella.
 */
export function RequestSearchField({
  value,
  onChange,
  placeholder,
  inputStyle,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  inputStyle: CSSProperties;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div style={{ position: "relative", width: "100%", minWidth: 0 }}>
      <span aria-hidden style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", display: "flex", pointerEvents: "none" }}>
        <Icon name="search" size={18} color={brand.grafite70} />
      </span>
      <input
        ref={inputRef}
        aria-label="Cerca nelle richieste"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && value) {
            e.stopPropagation();
            onChange("");
          }
        }}
        placeholder={placeholder}
        enterKeyHint="search"
        autoComplete="off"
        style={{ ...inputStyle, width: "100%", minWidth: 0, boxSizing: "border-box", paddingLeft: 44, paddingRight: value ? 48 : 16 }}
      />
      {value ? (
        <button
          type="button"
          aria-label="Cancella ricerca"
          onClick={() => {
            onChange("");
            inputRef.current?.focus();
          }}
          style={{
            position: "absolute",
            right: 2,
            top: "50%",
            transform: "translateY(-50%)",
            width: 44,
            height: 44,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: "none",
            background: "transparent",
            borderRadius: 999,
            cursor: "pointer",
            padding: 0,
          }}
        >
          <span style={{ width: 22, height: 22, borderRadius: 999, backgroundColor: brand.filetto, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Icon name="x" size={14} strokeWidth={2.5} color={brand.grafite} />
          </span>
        </button>
      ) : null}
    </div>
  );
}
