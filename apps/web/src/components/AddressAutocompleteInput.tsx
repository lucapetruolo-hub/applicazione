"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { APIProvider, useMapsLibrary } from "@vis.gl/react-google-maps";
import { GOOGLE_API_PROVIDER_PROPS, HAS_GOOGLE_MAPS_KEY } from "@/components/GoogleMapGate";
import { useCookieConsent } from "@/lib/cookieConsent";

export type SelectedAddress = {
  /** Indirizzo formattato da Google, senza ", Italia" finale. */
  address: string;
  latitude: number;
  longitude: number;
  /** Comune (componente "locality" di Google), se presente. */
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
};

/**
 * Campo indirizzo con i suggerimenti di Google Places (API "New"), richiesta
 * esplicita dell'utente (docs/CHANGELOG.md §141): mentre si scrive propone
 * indirizzi reali in Italia, e scegliendone uno arrivano anche le coordinate
 * esatte, senza più geocodificare lato server. Stesso consenso della mappa
 * (servizi Google, `useCookieConsent`): senza consenso o senza chiave resta
 * un normale campo di testo, come prima.
 */
export function AddressAutocompleteInput(props: Props) {
  const consent = useCookieConsent();
  if (!HAS_GOOGLE_MAPS_KEY || !consent) {
    return (
      <input value={props.value} onChange={(e) => props.onChange(e.target.value)} placeholder={props.placeholder} style={props.style} />
    );
  }
  return (
    <APIProvider {...GOOGLE_API_PROVIDER_PROPS}>
      <PlacesAddressInput {...props} />
    </APIProvider>
  );
}

type Suggestion = { id: string; main: string; secondary: string; prediction: google.maps.places.PlacePrediction };

function PlacesAddressInput({ value, onChange, onSelect, placeholder, style, biasTowards }: Props) {
  const places = useMapsLibrary("places");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  // Il campo cambia anche quando si sceglie un suggerimento: in quel caso non
  // va rifatta la ricerca sul testo appena inserito.
  const typedRef = useRef(false);
  // Un "token di sessione" per ogni ricerca: Google conta una sola sessione
  // (tutte le lettere digitate + la scelta finale) invece di ogni richiesta.
  const sessionRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);

  useEffect(() => {
    if (!places || !typedRef.current) return;
    const input = value.trim();
    if (input.length < 3) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        sessionRef.current ??= new places.AutocompleteSessionToken();
        const { suggestions: result } = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input,
          sessionToken: sessionRef.current,
          includedRegionCodes: ["it"],
          // Solo vie e numeri civici, niente negozi o luoghi di interesse.
          includedPrimaryTypes: ["street_address", "route", "premise", "subpremise"],
          language: "it",
          ...(biasTowards
            ? { locationBias: { center: { lat: biasTowards.latitude, lng: biasTowards.longitude }, radius: 30_000 } }
            : {}),
        });
        if (cancelled) return;
        setSuggestions(
          result.flatMap((s) =>
            s.placePrediction
              ? [
                  {
                    id: s.placePrediction.placeId,
                    main: s.placePrediction.mainText?.toString() ?? s.placePrediction.text.toString(),
                    secondary: s.placePrediction.secondaryText?.toString() ?? "",
                    prediction: s.placePrediction,
                  },
                ]
              : [],
          ),
        );
        setHighlighted(-1);
        setOpen(true);
      } catch {
        // Servizio non disponibile: il campo resta utilizzabile come testo libero.
        if (!cancelled) setSuggestions([]);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [places, value, biasTowards?.latitude, biasTowards?.longitude]);

  async function choose(suggestion: Suggestion) {
    setOpen(false);
    setSuggestions([]);
    typedRef.current = false;
    try {
      const place = suggestion.prediction.toPlace();
      await place.fetchFields({ fields: ["formattedAddress", "location", "addressComponents"] });
      sessionRef.current = null;
      const location = place.location;
      const address = (place.formattedAddress ?? `${suggestion.main}, ${suggestion.secondary}`).replace(/, Italia$/, "");
      onChange(address);
      if (location) {
        const component = (type: string) => place.addressComponents?.find((c) => c.types.includes(type));
        onSelect({
          address,
          latitude: location.lat(),
          longitude: location.lng(),
          locality: component("locality")?.longText ?? null,
          street: component("route")?.longText ?? null,
          houseNumber: component("street_number")?.longText ?? null,
          postalCode: component("postal_code")?.longText ?? null,
          province: component("administrative_area_level_2")?.shortText ?? null,
        });
      }
    } catch {
      sessionRef.current = null;
      onChange(`${suggestion.main}, ${suggestion.secondary}`);
    }
  }

  return (
    <div className="address-autocomplete">
      <input
        value={value}
        onChange={(e) => {
          typedRef.current = true;
          onChange(e.target.value);
        }}
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
        aria-expanded={open}
        aria-autocomplete="list"
      />
      {open && suggestions.length > 0 ? (
        <ul className="address-suggestions" role="listbox">
          {suggestions.map((s, i) => (
            <li
              key={s.id}
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
          <li className="address-attribution" aria-hidden="true">
            Suggerimenti di Google
          </li>
        </ul>
      ) : null}
      <style jsx>{`
        .address-autocomplete {
          position: relative;
          width: 100%;
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
          font-size: 11px;
          color: #9a8f82;
          align-items: flex-end;
        }
        .address-suggestions li.address-attribution:hover {
          background: transparent;
        }
      `}</style>
    </div>
  );
}
