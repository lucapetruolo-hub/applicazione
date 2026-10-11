"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  COMMON_PHONE_COUNTRY_ISOS,
  PHONE_COUNTRIES,
  findPhoneCountry,
  joinPhoneNumber,
  phoneCountryFlag,
  splitPhoneNumber,
} from "@professionisti/shared";
import { brand } from "@professionisti/ui";

type Props = {
  /** Numero completo, es. "+39 3331234567" (i numeri senza prefisso sono letti come italiani). */
  value: string;
  onChange: (value: string) => void;
  style?: CSSProperties;
  placeholder?: string;
};

const countryNames = (() => {
  try {
    return new Intl.DisplayNames(["it"], { type: "region" });
  } catch {
    return null;
  }
})();

function countryName(iso: string): string {
  return countryNames?.of(iso) ?? iso;
}

/**
 * Numero di telefono con il prefisso del paese (richiesta esplicita
 * dell'utente): Italia preimpostata, in cima i paesi più usati e sotto tutti
 * gli altri in ordine alfabetico. Il prefisso è un `<select>` nativo
 * (trasparente sopra la bandiera): sul telefono apre il selettore del
 * sistema e da tastiera si cerca il paese scrivendone il nome.
 */
export function PhoneNumberInput({ value, onChange, style, placeholder = "Numero di telefono" }: Props) {
  // Il paese scelto resta in memoria: un prefisso condiviso (+1, +44, +7)
  // non deve far saltare la scelta mentre si scrive il numero.
  const [iso, setIso] = useState(() => splitPhoneNumber(value).iso);
  const lastEmitted = useRef(value);
  const national = splitPhoneNumber(value, iso).national;

  // Valore cambiato da fuori (es. dati dell'account caricati dopo): si rilegge il paese.
  useEffect(() => {
    if (value === lastEmitted.current) return;
    lastEmitted.current = value;
    setIso(splitPhoneNumber(value).iso);
  }, [value]);

  const emit = (nextIso: string, nextNational: string) => {
    const next = joinPhoneNumber(nextIso, nextNational);
    lastEmitted.current = next;
    onChange(next);
  };

  const { common, others } = useMemo(() => {
    const commonSet = new Set<string>(COMMON_PHONE_COUNTRY_ISOS);
    const sorted = PHONE_COUNTRIES.filter((c) => !commonSet.has(c.iso))
      .map((c) => ({ ...c, name: countryName(c.iso) }))
      .sort((a, b) => a.name.localeCompare(b.name, "it"));
    return {
      common: COMMON_PHONE_COUNTRY_ISOS.map((code) => ({ ...findPhoneCountry(code)!, name: countryName(code) })),
      others: sorted,
    };
  }, []);

  const selected = findPhoneCountry(iso);

  return (
    <div className="phone-input" style={{ borderColor: brand.filetto }}>
      <div className="phone-country">
        <span aria-hidden="true">
          {phoneCountryFlag(iso)} +{selected?.dial ?? "39"}
        </span>
        <span className="phone-chevron" aria-hidden="true">
          ▾
        </span>
        <select
          aria-label="Prefisso del paese"
          value={iso}
          onChange={(e) => {
            setIso(e.target.value);
            emit(e.target.value, national);
          }}
        >
          <optgroup label="Più usati">
            {common.map((c) => (
              <option key={c.iso} value={c.iso}>
                {`${phoneCountryFlag(c.iso)} ${c.name} (+${c.dial})`}
              </option>
            ))}
          </optgroup>
          <optgroup label="Tutti i paesi">
            {others.map((c) => (
              <option key={c.iso} value={c.iso}>
                {`${phoneCountryFlag(c.iso)} ${c.name} (+${c.dial})`}
              </option>
            ))}
          </optgroup>
        </select>
      </div>
      <input
        aria-label="Numero di telefono"
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        value={national}
        onChange={(e) => {
          const typed = e.target.value;
          // Numero incollato con il prefisso ("+39 333…", "0039 333…"): si separa da solo.
          if (/^\s*(\+|00)/.test(typed)) {
            const parsed = splitPhoneNumber(typed);
            setIso(parsed.iso);
            emit(parsed.iso, parsed.national);
            return;
          }
          emit(iso, typed.replace(/[^\d\s]/g, ""));
        }}
        placeholder={placeholder}
        style={{ ...style, border: "none", borderRadius: 0, flex: 1, minWidth: 0, width: "auto" }}
      />
      <style jsx>{`
        .phone-input {
          display: flex;
          align-items: stretch;
          width: 100%;
          box-sizing: border-box;
          border: 1px solid;
          border-radius: 4px;
          background: #ffffff;
          overflow: hidden;
        }
        .phone-input:focus-within {
          outline: 2px solid ${brand.grafite70};
          outline-offset: 1px;
        }
        .phone-input :global(input:focus) {
          outline: none;
        }
        .phone-country {
          position: relative;
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 0 10px 0 12px;
          border-right: 1px solid ${brand.filetto};
          font-size: 15px;
          color: ${brand.grafite};
          white-space: nowrap;
          background: #faf8f4;
        }
        .phone-chevron {
          font-size: 11px;
          color: ${brand.grafite70};
        }
        .phone-country select {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          opacity: 0;
          cursor: pointer;
          font-size: 16px;
        }
      `}</style>
    </div>
  );
}
