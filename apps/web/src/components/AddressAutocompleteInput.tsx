"use client";

import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import type { AddressSuggestion } from "@professionisti/shared";
import { apiClient } from "@/lib/apiClient";

type Suggestion = AddressSuggestion;

function newSessionToken(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `s-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export type SelectedAddress = {
  /** Indirizzo formattato da Google, senza ", Italia" finale. */
  address: string;
  latitude: number;
  longitude: number;
  /** Comune ("administrative_area_level_3", altrimenti "locality" di Google), se presente. */
  locality: string | null;
  /** Pezzi dell'indirizzo per i moduli con campi separati (richiesta di preventivo, account). */
  street: string | null;
  houseNumber: string | null;
  postalCode: string | null;
  /** Sigla della provincia (es. "RM"). */
  province: string | null;
};

type Props = {
  value: string;
  onChange: (value: string) => void;
  /** Chiamata quando si sceglie un suggerimento: indirizzo verificato con coordinate esatte. */
  onSelect: (selected: SelectedAddress) => void;
  placeholder?: string;
  style?: CSSProperties;
  /** Favorisce i suggerimenti vicini a questo punto (es. il comune indicato nel profilo), senza escludere il resto d'Italia. */
  biasTowards?: { latitude: number; longitude: number } | null;
  /**
   * Solo indirizzi di questo comune (richiesta preventivo, docs/CHANGELOG.md
   * §214): la ricerca aggiunge il nome del comune, l'elenco tiene solo i
   * suggerimenti di quel comune e una scelta di un altro comune viene rifiutata.
   */
  restrictToCity?: { name: string; latitude: number; longitude: number } | null;
  /** Non serve più (§264: suggerimenti senza consenso ai cookie), resta per compatibilità. */
  askConsent?: boolean;
  /** Google non risponde: chi rende obbligatoria la scelta deve accettare il testo libero. */
  onServiceUnavailable?: () => void;
  disabled?: boolean;
};

/** Confronto dei nomi dei comuni senza maiuscole, accenti e apostrofi diversi. */
function normalizePlaceName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’`]/g, "'")
    .toLowerCase()
    .trim();
}

/**
 * Campo indirizzo con i suggerimenti di Google Places (richiesta esplicita
 * dell'utente, docs/CHANGELOG.md §141): mentre si scrive propone indirizzi
 * reali in Italia, e scegliendone uno arrivano anche le coordinate esatte e i
 * pezzi dell'indirizzo. I suggerimenti li chiede a Google il nostro server
 * (§264): nel browser non si carica niente di Google, quindi funzionano per
 * tutti senza consenso ai cookie. Se il servizio non risponde resta un
 * normale campo di testo.
 */
export function AddressAutocompleteInput({ value, onChange, onSelect, placeholder, style, biasTowards, restrictToCity, onServiceUnavailable, disabled }: Props) {
  // Fuori da React Compiler: usa `<style jsx>` (docs/CHANGELOG.md §335).
  "use no memo";
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [wrongCity, setWrongCity] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  // Il campo cambia anche quando si sceglie un suggerimento: in quel caso non
  // va rifatta la ricerca sul testo appena inserito.
  const typedRef = useRef(false);
  // Un "token di sessione" per ogni ricerca: Google conta una sola sessione
  // (tutte le lettere digitate + la scelta finale) invece di ogni richiesta.
  const sessionRef = useRef<string | null>(null);
  const listboxId = useId();

  // Solo le coordinate, non l'oggetto: un oggetto nuovo a ogni render del
  // genitore rifarebbe la ricerca a vuoto.
  const biasLatitude = restrictToCity?.latitude ?? biasTowards?.latitude;
  const biasLongitude = restrictToCity?.longitude ?? biasTowards?.longitude;
  const cityName = restrictToCity?.name;
  const onServiceUnavailableRef = useRef(onServiceUnavailable);
  useEffect(() => {
    onServiceUnavailableRef.current = onServiceUnavailable;
  });

  // Sotto i 3 caratteri niente suggerimenti, tolti già durante il render.
  if (value.trim().length < 3 && suggestions.length > 0) setSuggestions([]);

  useEffect(() => {
    if (!typedRef.current) return;
    const input = value.trim();
    if (input.length < 3) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        sessionRef.current ??= newSessionToken();
        const result = await apiClient.addressSuggestions({
          // Con un comune scelto la ricerca lo aggiunge al testo: "via roma 5" → "via roma 5, Bari".
          q: cityName ? `${input}, ${cityName}` : input,
          session: sessionRef.current,
          latitude: biasLatitude,
          longitude: biasLongitude,
        });
        if (cancelled) return;
        const wantedCity = cityName ? normalizePlaceName(cityName) : null;
        setSuggestions(result.filter((s) => !wantedCity || normalizePlaceName(s.secondary).includes(wantedCity)));
        setHighlighted(-1);
        setOpen(true);
      } catch {
        // Servizio non disponibile: il campo resta utilizzabile come testo libero.
        if (!cancelled) {
          setSuggestions([]);
          onServiceUnavailableRef.current?.();
        }
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [value, biasLatitude, biasLongitude, cityName]);

  async function choose(suggestion: Suggestion) {
    setOpen(false);
    setSuggestions([]);
    typedRef.current = false;
    const session = sessionRef.current ?? newSessionToken();
    sessionRef.current = null;
    try {
      const place = await apiClient.addressPlace(suggestion.id, session);
      const address = place.address || `${suggestion.main}, ${suggestion.secondary}`;
      onChange(address);
      if (cityName && (!place.comune || normalizePlaceName(place.comune) !== normalizePlaceName(cityName))) {
        setWrongCity(place.comune);
        return;
      }
      setWrongCity(null);
      onSelect({
        address,
        latitude: place.latitude,
        longitude: place.longitude,
        locality: place.comune ?? place.locality,
        street: place.street,
        houseNumber: place.houseNumber,
        postalCode: place.postalCode,
        province: place.province,
      });
    } catch {
      onChange(`${suggestion.main}, ${suggestion.secondary}`);
      onServiceUnavailable?.();
    }
  }

  return (
    <div className="address-autocomplete">
      <input aria-label={placeholder}
        value={value}
        onChange={(e) => {
          typedRef.current = true;
          setWrongCity(null);
          onChange(e.target.value);
        }}
        disabled={disabled}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (!open || suggestions.length === 0) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setHighlighted((i) => Math.min(i + 1, suggestions.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlighted((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter" && highlighted >= 0) {
            e.preventDefault();
            void choose(suggestions[highlighted]!);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        placeholder={placeholder}
        // Larghezza piena come gli altri campi: qui l'input è dentro un contenitore in più.
        style={{ ...style, width: "100%", boxSizing: "border-box" }}
        autoComplete="off"
        role="combobox"
        aria-controls={listboxId}
        aria-expanded={open}
        aria-autocomplete="list"
        // VoiceOver e TalkBack leggono l'opzione evidenziata con le frecce (§324).
        aria-activedescendant={open && highlighted >= 0 ? `${listboxId}-${highlighted}` : undefined}
      />
      {/* Annuncio per i lettori di schermo: quanti suggerimenti sono comparsi (§324). */}
      <span className="address-sr-status" role="status" aria-live="polite">
        {open ? (suggestions.length > 0 ? `${suggestions.length} ${suggestions.length === 1 ? "suggerimento" : "suggerimenti"}: usa le frecce per sceglierne uno.` : "Nessun indirizzo trovato.") : ""}
      </span>
      {open && suggestions.length > 0 ? (
        <ul id={listboxId} className="address-suggestions" role="listbox">
          {suggestions.map((s, i) => (
            <li
              key={s.id}
              id={`${listboxId}-${i}`}
              role="option"
              aria-selected={i === highlighted}
              className={i === highlighted ? "highlighted" : undefined}
              onMouseDown={(e) => {
                e.preventDefault();
                void choose(s);
              }}
            >
              <strong>{s.main}</strong>
              {s.secondary ? <span>{s.secondary}</span> : null}
            </li>
          ))}
          {/* Attribuzione richiesta da Google per i suggerimenti mostrati fuori da una mappa Google. */}
          <li className="address-attribution" role="presentation" aria-hidden="true">
            Suggerimenti di Google
          </li>
        </ul>
      ) : null}
      {wrongCity !== null && cityName ? (
        <p className="address-wrong-city" role="alert">
          {wrongCity ? `Questo indirizzo è a ${wrongCity}, non a ${cityName}.` : `Questo indirizzo non risulta a ${cityName}.`} Scegline uno
          dall&apos;elenco o cambia la città.
        </p>
      ) : null}
      <style jsx>{`
        .address-autocomplete {
          position: relative;
          width: 100%;
        }
        .address-sr-status {
          position: absolute;
          width: 1px;
          height: 1px;
          overflow: hidden;
          clip: rect(0 0 0 0);
          white-space: nowrap;
        }
        .address-wrong-city {
          margin: 6px 0 0;
          font-size: 13px;
          color: #b3261e;
        }
        .address-suggestions {
          position: absolute;
          top: calc(100% + 4px);
          left: 0;
          right: 0;
          z-index: 50;
          margin: 0;
          padding: 4px 0;
          list-style: none;
          background: #ffffff;
          border: 1px solid #e3ded4;
          border-radius: 10px;
          box-shadow: 0 8px 24px rgba(43, 32, 19, 0.12);
          max-height: 280px;
          overflow-y: auto;
        }
        .address-suggestions li {
          display: flex;
          flex-direction: column;
          gap: 2px;
          padding: 9px 12px;
          cursor: pointer;
          font-size: 14px;
          color: #2b2420;
        }
        .address-suggestions li span {
          font-size: 12px;
          color: #6e6459;
        }
        .address-suggestions li:hover,
        .address-suggestions li.highlighted {
          background: #f5f1ea;
        }
        .address-suggestions li.address-attribution {
          cursor: default;
          /* Leggibile anche così piccola: contrasto almeno 4,5:1 (§324). */
          font-size: 12px;
          color: #6e6459;
          align-items: flex-end;
        }
        .address-suggestions li.address-attribution:hover {
          background: transparent;
        }
      `}</style>
    </div>
  );
}
