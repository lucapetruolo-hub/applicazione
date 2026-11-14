import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { buildSearchIndex, rankSearchMatches } from "./searchMatch";

/**
 * Logica comune del campo con suggerimenti: la usano `Autocomplete.tsx`
 * (app) e `Autocomplete.web.tsx` (sito in HTML semplice,
 * docs/changelog/2026-11-10-barra-di-ricerca-senza-tamagui.md). Qui stato,
 * filtro, tasti e chiusura al clic fuori; i due file disegnano soltanto.
 */
/** Misure usate dalle pagine; il sito le ha in Autocomplete.module.css (una nuova va aggiunta lì). */
export type AutocompleteSize = "3" | "4" | "5";

export type AutocompleteProps<T> = {
  items: T[];
  getKey: (item: T) => string;
  getLabel: (item: T) => string;
  onSelect: (item: T) => void;
  renderItem?: (item: T) => ReactNode;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  maxResults?: number;
  /** Numero minimo di caratteri digitati prima di mostrare l'elenco (0 = mostra subito, anche a campo vuoto). */
  minChars?: number;
  size?: AutocompleteSize;
  /**
   * Etichetta visibile sopra il campo (regola "input-labels": il solo
   * segnaposto sparisce mentre si scrive). Serve anche `id`, che lega
   * l'etichetta al campo. Senza, il segnaposto fa da nome accessibile.
   */
  label?: string;
  /** Pillola corta accanto all'etichetta (es. "Novità" sulla ricerca per problema in home). */
  labelBadge?: string;
  /** Riceve una funzione che mette il cursore nel campo (gli esempi della home). */
  focusRef?: { current: (() => void) | null };
  /** Classe del campo (in home il bordo con la luce che gira). */
  inputClassName?: string;
  /**
   * Contenuto dentro il campo, all'inizio e alla fine (in home la miniatura
   * della foto scelta e il tasto "Foto",
   * docs/changelog/2026-11-13-foto-nel-campo-di-ricerca.md). Il campo lascia
   * lo spazio per non scriverci sotto.
   */
  inputStart?: ReactNode;
  inputEnd?: ReactNode;
  id?: string;
  /** Nome per il lettore di schermo quando l'etichetta visibile non è legata al campo: senza, si legge il segnaposto ("Es. Milano"). */
  "aria-label"?: string;
  /**
   * Testo su cui si cerca, se diverso da `getLabel` (es. una frazione:
   * si cerca "Borgo Sabotino", si mostra anche il comune).
   */
  getSearchText?: (item: T) => string;
  /** A parità di corrispondenza, più bassa prima (es. città con professionisti, §383). */
  priority?: (item: T) => number;
  /** Elenco mostrato a campo vuoto, al posto dei primi `maxResults` di `items` (es. ultima città usata e più cercate). */
  emptyItems?: T[];
  /**
   * Titoletti dentro l'elenco a campo vuoto, prima della voce di `emptyItems`
   * con quell'indice (es. "Scrivi il problema, per esempio:" sopra le frasi
   * d'esempio e "Oppure scegli chi cerchi:" sopra i mestieri, in home).
   */
  emptyHeadings?: { index: number; label: string }[];
  /** Riga in cima a campo vuoto, prima dell'elenco (es. "Vicino a me"). */
  leadingAction?: {
    label: string;
    description?: string;
    /** Se restituisce una Promise, l'elenco resta aperto finché non risponde `true` (es. posizione trovata). */
    onPress: () => void | Promise<boolean>;
  };
  /**
   * Sotto gli 800 px, mentre si scrive, l'elenco sta nella pagina e spinge
   * giù i campi sotto invece di coprirli (collaudo dell'8/11, E6-04: in home
   * il suggerimento del problema nascondeva "Città").
   */
  listInFlowOnPhone?: boolean;
};

/**
 * Il campo ha il fuoco? Nell'app lo dice il TextInput (`isFocused`), sul
 * sito (un <input> vero) l'elemento attivo della pagina.
 */
function inputHasFocus(input: { isFocused?: () => boolean } | null): boolean {
  if (!input) return false;
  if (typeof input.isFocused === "function") return input.isFocused();
  const doc = (globalThis as { document?: { activeElement?: unknown } }).document;
  return doc?.activeElement === input;
}

export type FieldHandle = { focus?: () => void; blur?: () => void; isFocused?: () => boolean };

export function useAutocomplete<T>({
  items,
  getLabel,
  onSelect,
  value,
  onChangeText,
  placeholder,
  maxResults = 30,
  minChars = 0,
  label,
  focusRef,
  "aria-label": accessibilityLabel,
  getSearchText,
  priority,
  emptyItems,
  emptyHeadings,
  leadingAction,
  listInFlowOnPhone = false,
}: AutocompleteProps<T>) {
  const [isFocused, setIsFocused] = useState(false);
  // Opzione evidenziata con le frecce (-1 nessuna). 0 è la riga in cima se c'è.
  const [highlighted, setHighlighted] = useState(-1);
  const listboxId = `${useId().replace(/:/g, "")}-elenco`;
  const containerRef = useRef<unknown>(null);
  const inputRef = useRef<FieldHandle | null>(null);
  useEffect(() => {
    if (!focusRef) return;
    focusRef.current = () => inputRef.current?.focus?.();
    return () => {
      focusRef.current = null;
    };
  }, [focusRef]);

  // Chiudi il dropdown anche al click/tap fuori dal campo (web): il blur
  // ritardato da solo non basta — con il dropdown aperto a z-index alto il
  // click sul bottone di invio sottostante veniva intercettato e il form
  // risultava "non cliccabile" (bug reale segnalato in audit).
  useEffect(() => {
    // Web-only: il package è condiviso con React Native, dove `document`
    // non esiste né nei tipi né a runtime — doppia guardia (typeof + cast)
    // per non rompere il typecheck RN né il bundle nativo.
    if (typeof globalThis !== "object" || !("document" in globalThis)) return;
    type DocLike = {
      addEventListener: (type: string, listener: (e: { target: unknown }) => void) => void;
      removeEventListener: (type: string, listener: (e: { target: unknown }) => void) => void;
    };
    const doc = (globalThis as { document?: DocLike }).document;
    if (!doc) return;
    function handlePointerDown(e: { target: unknown }) {
      const node = containerRef.current as { contains?: (t: unknown) => boolean } | null;
      if (node && typeof node.contains === "function" && !node.contains(e.target)) {
        setIsFocused(false);
      }
    }
    doc.addEventListener("mousedown", handlePointerDown);
    doc.addEventListener("touchstart", handlePointerDown);
    return () => {
      doc.removeEventListener("mousedown", handlePointerDown);
      doc.removeEventListener("touchstart", handlePointerDown);
    };
  }, []);

  // I testi si normalizzano una volta per elenco, non a ogni lettera
  // (i comuni sono ~7900).
  const searchIndex = useMemo(() => buildSearchIndex(items, getSearchText ?? getLabel), [items, getSearchText, getLabel]);
  const trimmedQuery = value.trim();
  // Campo vuoto: un elenco subito, senza dover scrivere (le più cercate,
  // l'ultima città usata, o i primi N). Sotto la soglia `minChars` invece
  // niente. Mentre si scrive l'ordine è quello di `rankSearchMatches`:
  // prima chi inizia con le lettere scritte (non "Fabrica di Roma" prima di
  // "Roma", bug segnalato dall'utente), poi le parole, poi chi le contiene,
  // infine chi somiglia con un errore di battitura (§383).
  const filtered =
    trimmedQuery.length === 0
      ? (emptyItems ?? items).slice(0, maxResults)
      : trimmedQuery.length < minChars
        ? []
        : rankSearchMatches(searchIndex, trimmedQuery, { priority, limit: maxResults });
  const action = trimmedQuery.length === 0 ? leadingAction : undefined;
  const optionCount = filtered.length + (action ? 1 : 0);

  const showDropdown = isFocused && optionCount > 0;
  const listInFlow = listInFlowOnPhone && trimmedQuery.length > 0;
  const activeIndex = showDropdown && highlighted >= 0 && highlighted < optionCount ? highlighted : -1;

  function choose(index: number) {
    if (action && index === 0) {
      const result = action.onPress();
      if (result instanceof Promise) {
        // "Vicino a me": l'elenco resta aperto con "Cerco la tua posizione…"
        // e, se non la trova, con il motivo; si chiude solo quando la trova.
        inputRef.current?.focus?.();
        setIsFocused(true);
        void result.then((done) => {
          if (done) {
            setIsFocused(false);
            inputRef.current?.blur?.();
          }
        });
        return;
      }
    } else {
      const item = filtered[index - (action ? 1 : 0)];
      if (item !== undefined) onSelect(item);
    }
    setHighlighted(-1);
    setIsFocused(false);
  }

  // Frecce, Invio ed Esc come in AddressAutocompleteInput (§324): il
  // lettore di schermo legge l'opzione evidenziata.
  function handleKey(key: string, preventDefault: () => void) {
    if (key === "Escape") {
      setIsFocused(false);
      return;
    }
    if (!showDropdown) {
      if (key === "ArrowDown") setIsFocused(true);
      return;
    }
    if (key === "ArrowDown") {
      preventDefault();
      setHighlighted(Math.min(activeIndex + 1, optionCount - 1));
    } else if (key === "ArrowUp") {
      preventDefault();
      setHighlighted(Math.max(activeIndex - 1, 0));
    } else if (key === "Enter" && activeIndex >= 0) {
      preventDefault();
      choose(activeIndex);
    }
  }

  function handleChangeText(text: string) {
    setHighlighted(-1);
    setIsFocused(true);
    onChangeText(text);
  }

  function handleFocus() {
    setIsFocused(true);
  }

  function handleBlur() {
    setTimeout(() => {
      if (!inputHasFocus(inputRef.current)) setIsFocused(false);
    }, 150);
  }

  const optionId = (index: number) => `${listboxId}-${index}`;
  // Attributi del "combobox" (sul sito vanno al campo).
  const comboboxProps = {
    role: "combobox",
    "aria-autocomplete": "list",
    "aria-expanded": showDropdown,
    "aria-controls": listboxId,
    "aria-activedescendant": activeIndex >= 0 ? optionId(activeIndex) : undefined,
  } as const;

  const statusText =
    isFocused && trimmedQuery
      ? filtered.length > 0
        ? `${filtered.length} ${filtered.length === 1 ? "suggerimento" : "suggerimenti"}: usa le frecce per sceglierne uno.`
        : "Nessun suggerimento."
      : "";

  /** Titoletto da mettere prima della voce `i` dell'elenco, se c'è. */
  const headingBefore = (i: number) => (trimmedQuery.length === 0 ? emptyHeadings?.find((h) => h.index === i) : undefined);

  return {
    containerRef,
    inputRef,
    listboxId,
    listboxLabel: label ?? accessibilityLabel ?? placeholder,
    inputAriaLabel: label ? undefined : accessibilityLabel ?? placeholder,
    filtered,
    action,
    showDropdown,
    listInFlow,
    activeIndex,
    optionId,
    comboboxProps,
    statusText,
    headingBefore,
    choose,
    handleKey,
    handleChangeText,
    handleFocus,
    handleBlur,
  };
}
