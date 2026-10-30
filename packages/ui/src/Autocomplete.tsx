"use client";

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { Input, Label, ScrollView, Text, YStack } from "tamagui";
import { buildSearchIndex, rankSearchMatches } from "./searchMatch";
import { brand } from "./tokens";

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
  size?: React.ComponentProps<typeof Input>["size"];
  /**
   * Etichetta visibile sopra il campo (regola "input-labels": il solo
   * segnaposto sparisce mentre si scrive). Serve anche `id`, che lega
   * l'etichetta al campo. Senza, il segnaposto fa da nome accessibile.
   */
  label?: string;
  id?: string;
  /** Nome per il lettore di schermo quando l'etichetta visibile non è legata al campo: senza, si legge il segnaposto ("Es. Milano"). */
  accessibilityLabel?: string;
  /**
   * Testo su cui si cerca, se diverso da `getLabel` (es. una frazione:
   * si cerca "Borgo Sabotino", si mostra anche il comune).
   */
  getSearchText?: (item: T) => string;
  /** A parità di corrispondenza, più bassa prima (es. città con professionisti, §383). */
  priority?: (item: T) => number;
  /** Elenco mostrato a campo vuoto, al posto dei primi `maxResults` di `items` (es. ultima città usata e più cercate). */
  emptyItems?: T[];
  /** Riga in cima a campo vuoto, prima dell'elenco (es. "Vicino a me"). */
  leadingAction?: {
    label: string;
    description?: string;
    /** Se restituisce una Promise, l'elenco resta aperto finché non risponde `true` (es. posizione trovata). */
    onPress: () => void | Promise<boolean>;
  };
};

/**
 * Campo di testo con elenco a discesa filtrato in tempo reale, usato per la
 * ricerca professionisti/città (condiviso web+mobile).
 */
export function Autocomplete<T>({
  items,
  getKey,
  getLabel,
  onSelect,
  renderItem,
  value,
  onChangeText,
  placeholder,
  maxResults = 30,
  minChars = 0,
  size,
  label,
  id,
  accessibilityLabel,
  getSearchText,
  priority,
  emptyItems,
  leadingAction,
}: AutocompleteProps<T>) {
  const [isFocused, setIsFocused] = useState(false);
  // Opzione evidenziata con le frecce (-1 nessuna). 0 è la riga in cima se c'è.
  const [highlighted, setHighlighted] = useState(-1);
  const listboxId = `${useId().replace(/:/g, "")}-elenco`;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<{ focus?: () => void; blur?: () => void; isFocused?: () => boolean } | null>(null);

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
      const node = containerRef.current as unknown as { contains?: (t: unknown) => boolean } | null;
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

  const optionId = (index: number) => `${listboxId}-${index}`;
  // Attributi del "combobox" per il web (react-native-web li passa al campo).
  const comboboxProps = {
    role: "combobox",
    "aria-autocomplete": "list",
    "aria-expanded": showDropdown,
    "aria-controls": listboxId,
    "aria-activedescendant": activeIndex >= 0 ? optionId(activeIndex) : undefined,
  } as Record<string, unknown>;

  return (
    <YStack position="relative" flex={1} ref={containerRef as never}>
      {label ? (
        <Label htmlFor={id} fontSize={16} lineHeight={18} height="auto" fontWeight="600" color={brand.grafite70} paddingLeft="$1" paddingBottom={4}>
          {label}
        </Label>
      ) : null}
      <Input
        ref={inputRef as never}
        id={id}
        flex={1}
        size={size}
        borderWidth={0}
        value={value}
        onChangeText={(text) => {
          setHighlighted(-1);
          setIsFocused(true);
          onChangeText(text);
        }}
        placeholder={placeholder}
        accessibilityLabel={label ? undefined : accessibilityLabel ?? placeholder}
        autoComplete="off"
        // Invio senza suggerimento scelto non toglie il fuoco dal campo (collaudo L-08).
        blurOnSubmit={false}
        onFocus={() => setIsFocused(true)}
        onBlur={() =>
          setTimeout(() => {
            if (!inputRef.current?.isFocused?.()) setIsFocused(false);
          }, 150)
        }
        onKeyPress={(event) => handleKey(event.nativeEvent.key, () => event.preventDefault())}
        {...comboboxProps}
      />
      {/* Annuncio per i lettori di schermo: quanti suggerimenti ci sono. */}
      <Text role="status" aria-live="polite" position="absolute" width={1} height={1} overflow="hidden" opacity={0} pointerEvents="none">
        {isFocused && trimmedQuery ? (filtered.length > 0 ? `${filtered.length} ${filtered.length === 1 ? "suggerimento" : "suggerimenti"}: usa le frecce per sceglierne uno.` : "Nessun suggerimento.") : ""}
      </Text>
      {showDropdown ? (
        <YStack
          position="absolute"
          top="100%"
          left={0}
          right={0}
          marginTop="$2"
          backgroundColor="white"
          borderWidth={1}
          borderColor="$borderColor"
          borderRadius="$4"
          overflow="hidden"
          zIndex={1000}
          shadowColor="$shadowColor"
          shadowRadius={12}
          shadowOpacity={0.15}
        >
          {/* Altezza fissa + scroll: con centinaia di risultati (es. i comuni
              italiani) serve poter scorrere con la rotellina, non solo vedere
              i primi N tagliati senza modo di vedere gli altri. */}
          {/* Fuori dal Tab: l'elenco si usa con le frecce dal campo, e il
              browser rendeva il riquadro scorrevole una fermata in più
              (docs/changelog/2026-10-30-tastiera.md, collaudo L-12). */}
          <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator {...({ tabIndex: -1 } as Record<string, unknown>)}>
            <YStack id={listboxId} {...({ role: "listbox", "aria-label": label ?? accessibilityLabel ?? placeholder } as Record<string, unknown>)}>
              {action ? (
                <YStack
                  id={optionId(0)}
                  role="option"
                  aria-selected={activeIndex === 0}
                  padding="$3"
                  borderBottomWidth={1}
                  borderBottomColor="$borderColor"
                  cursor="pointer"
                  backgroundColor={activeIndex === 0 ? "$color3" : undefined}
                  hoverStyle={{ backgroundColor: "$color3" }}
                  onPress={() => choose(0)}
                >
                  <Text fontWeight="600" color={brand.cianografiaPieno}>
                    {action.label}
                  </Text>
                  {action.description ? (
                    <Text fontSize={13} color="$color10">
                      {action.description}
                    </Text>
                  ) : null}
                </YStack>
              ) : null}
              {filtered.map((item, i) => {
                const index = i + (action ? 1 : 0);
                return (
                  <YStack
                    key={getKey(item)}
                    id={optionId(index)}
                    role="option"
                    aria-selected={activeIndex === index}
                    padding="$3"
                    borderBottomWidth={1}
                    borderBottomColor="$borderColor"
                    cursor="pointer"
                    backgroundColor={activeIndex === index ? "$color3" : undefined}
                    hoverStyle={{ backgroundColor: "$color3" }}
                    onPress={() => choose(index)}
                  >
                    {renderItem ? renderItem(item) : <Text>{getLabel(item)}</Text>}
                  </YStack>
                );
              })}
            </YStack>
          </ScrollView>
        </YStack>
      ) : null}
    </YStack>
  );
}
