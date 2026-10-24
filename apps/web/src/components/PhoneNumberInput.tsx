"use client";

import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import {
  COMMON_PHONE_COUNTRY_ISOS,
  PHONE_COUNTRIES,
  findPhoneCountry,
  joinPhoneNumber,
  splitPhoneNumber,
  type PhoneCountry,
} from "@professionisti/shared";
import { brand } from "@professionisti/ui";

type Props = {
  /** Numero completo, es. "+39 3331234567" (i numeri senza prefisso sono letti come italiani). */
  value: string;
  onChange: (value: string) => void;
  style?: CSSProperties;
  placeholder?: string;
};

type CountryOption = PhoneCountry & { name: string };

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

/** Per la ricerca: niente maiuscole né accenti ("Città del Vaticano" si trova con "citta"). */
function searchable(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/**
 * Bandiera come immagine (`public/flags`, da country-flag-icons, licenza
 * MIT): le bandiere emoji su Windows compaiono come due lettere ("IT").
 */
function Flag({ iso }: { iso: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- piccola SVG statica, next/image non la ottimizzerebbe
  return <img src={`/flags/${iso.toLowerCase()}.svg`} alt="" width={21} height={14} loading="lazy" style={{ borderRadius: 2, boxShadow: "0 0 0 1px rgba(0,0,0,0.08)", flexShrink: 0 }} />;
}

/**
 * Numero di telefono con il prefisso del paese (richiesta esplicita
 * dell'utente, docs/CHANGELOG.md §214): Italia preimpostata, in cima i paesi
 * più usati e sotto tutti gli altri in ordine alfabetico, con la ricerca
 * per nome o prefisso come negli altri siti.
 */
export function PhoneNumberInput({ value, onChange, style, placeholder = "Numero di telefono" }: Props) {
  // Il paese scelto resta in memoria: un prefisso condiviso (+1, +44, +7)
  // non deve far saltare la scelta mentre si scrive il numero.
  const [iso, setIso] = useState(() => splitPhoneNumber(value).iso);
  const lastEmitted = useRef(value);
  const national = splitPhoneNumber(value, iso).national;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlighted, setHighlighted] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const numberRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();

  // Valore cambiato da fuori (es. dati dell'account caricati dopo): si rilegge il paese.
  useEffect(() => {
    if (value === lastEmitted.current) return;
    lastEmitted.current = value;
    setIso(splitPhoneNumber(value).iso);
  }, [value]);

  // Chiusura toccando fuori dall'elenco.
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

  const emit = (nextIso: string, nextNational: string) => {
    const next = joinPhoneNumber(nextIso, nextNational);
    lastEmitted.current = next;
    onChange(next);
  };

  const { common, others } = useMemo(() => {
    const commonSet = new Set<string>(COMMON_PHONE_COUNTRY_ISOS);
    return {
      common: COMMON_PHONE_COUNTRY_ISOS.map((code) => ({ ...findPhoneCountry(code)!, name: countryName(code) })),
      others: PHONE_COUNTRIES.filter((c) => !commonSet.has(c.iso))
        .map((c) => ({ ...c, name: countryName(c.iso) }))
        .sort((a, b) => a.name.localeCompare(b.name, "it")),
    };
  }, []);

  // Con una ricerca: un solo elenco, prima i paesi il cui nome inizia con il testo.
  const groups: { label: string | null; items: CountryOption[] }[] = useMemo(() => {
    const q = searchable(query.trim().replace(/^\+/, ""));
    if (!q) {
      return [
        { label: "Più usati", items: common },
        { label: "Tutti i paesi", items: others },
      ];
    }
    const all = [...common, ...others];
    const starts = all.filter((c) => searchable(c.name).startsWith(q) || c.dial.startsWith(q));
    const contains = all.filter((c) => !starts.includes(c) && searchable(c.name).includes(q));
    return [{ label: null, items: [...starts, ...contains] }];
  }, [query, common, others]);
  const flat = groups.flatMap((g) => g.items);

  function choose(country: CountryOption) {
    setIso(country.iso);
    emit(country.iso, national);
    setOpen(false);
    setQuery("");
    numberRef.current?.focus();
  }

  function onListKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((i) => Math.min(i + 1, flat.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const country = flat[highlighted];
      if (country) choose(country);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  useEffect(() => {
    document.getElementById(`${listboxId}-${highlighted}`)?.scrollIntoView({ block: "nearest" });
  }, [highlighted, listboxId]);

  const selected = findPhoneCountry(iso);
  let index = -1;

  return (
    <div className="phone-input" ref={rootRef}>
      <button
        type="button"
        className="phone-country"
        aria-label={`Prefisso: ${countryName(iso)} +${selected?.dial ?? "39"}. Cambia paese`}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => {
          setHighlighted(0);
          setOpen((v) => !v);
        }}
      >
        <Flag iso={iso} />
        <span>+{selected?.dial ?? "39"}</span>
        <span className="phone-chevron" aria-hidden="true">
          ▾
        </span>
      </button>
      <input
        ref={numberRef}
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
        style={{ ...style, border: "none", borderRadius: 0, flex: 1, minWidth: 0, width: "auto", outline: "none" }}
      />
      {open ? (
        <div className="phone-panel">
          <input
            ref={searchRef}
            className="phone-search"
            aria-label="Cerca il paese"
            placeholder="Cerca paese o prefisso"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setHighlighted(0);
            }}
            onKeyDown={onListKeyDown}
            role="combobox"
            aria-controls={listboxId}
            aria-expanded="true"
            aria-activedescendant={flat[highlighted] ? `${listboxId}-${highlighted}` : undefined}
          />
          <ul id={listboxId} role="listbox" aria-label="Paesi">
            {groups.map((group) => (
              <li key={group.label ?? "risultati"} role="presentation">
                {group.label ? <div className="phone-group">{group.label}</div> : null}
                <ul role="group" aria-label={group.label ?? "Risultati"}>
                  {group.items.map((country) => {
                    index += 1;
                    const i = index;
                    return (
                      <li
                        key={`${group.label}-${country.iso}`}
                        id={`${listboxId}-${i}`}
                        role="option"
                        aria-selected={country.iso === iso}
                        className={i === highlighted ? "highlighted" : undefined}
                        onMouseEnter={() => setHighlighted(i)}
                        onClick={() => choose(country)}
                      >
                        <Flag iso={country.iso} />
                        <span className="phone-name">{country.name}</span>
                        <span className="phone-dial">+{country.dial}</span>
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
            {flat.length === 0 ? <li className="phone-empty">Nessun paese trovato</li> : null}
          </ul>
        </div>
      ) : null}
      <style jsx>{`
        .phone-input {
          position: relative;
          display: flex;
          align-items: stretch;
          width: 100%;
          box-sizing: border-box;
          border: 1px solid ${brand.bordoCampo};
          border-radius: 4px;
          background: #ffffff;
        }
        .phone-input:focus-within {
          outline: 2px solid ${brand.grafite70};
          outline-offset: 1px;
        }
        .phone-country {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 0 10px 0 12px;
          border: none;
          border-right: 1px solid ${brand.filetto};
          border-radius: 4px 0 0 4px;
          font: inherit;
          font-size: 15px;
          color: ${brand.grafite};
          white-space: nowrap;
          background: #faf8f4;
          cursor: pointer;
        }
        .phone-chevron {
          font-size: 11px;
          color: ${brand.grafite70};
        }
        .phone-panel {
          position: absolute;
          top: calc(100% + 4px);
          left: 0;
          z-index: 60;
          width: min(340px, 100%);
          background: #ffffff;
          border: 1px solid #e3ded4;
          border-radius: 10px;
          box-shadow: 0 8px 24px rgba(43, 32, 19, 0.12);
          overflow: hidden;
        }
        .phone-search {
          width: 100%;
          box-sizing: border-box;
          padding: 10px 12px;
          border: none;
          border-bottom: 1px solid #e3ded4;
          font: inherit;
          font-size: 16px;
          outline: none;
        }
        .phone-panel ul {
          list-style: none;
          margin: 0;
          padding: 0;
        }
        .phone-panel > ul {
          max-height: 280px;
          overflow-y: auto;
          padding: 4px 0;
        }
        .phone-group {
          padding: 8px 12px 4px;
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          color: #9a8f82;
        }
        .phone-panel li[role="option"] {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 9px 12px;
          cursor: pointer;
          font-size: 14px;
          color: #2b2420;
        }
        .phone-panel li[role="option"].highlighted {
          background: #f5f1ea;
        }
        .phone-panel li[role="option"][aria-selected="true"] {
          font-weight: 700;
        }
        .phone-name {
          flex: 1;
          min-width: 0;
        }
        .phone-dial {
          color: #6e6459;
        }
        .phone-empty {
          padding: 12px;
          font-size: 14px;
          color: #6e6459;
        }
      `}</style>
    </div>
  );
}
