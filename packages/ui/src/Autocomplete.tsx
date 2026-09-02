"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Input, ScrollView, Text, YStack } from "tamagui";

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
}: AutocompleteProps<T>) {
  const [isFocused, setIsFocused] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

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
      addEventListener: (type: string, listener: (e: Event) => void) => void;
      removeEventListener: (type: string, listener: (e: Event) => void) => void;
    };
    const doc = (globalThis as { document?: DocLike }).document;
    if (!doc) return;
    function handlePointerDown(e: Event) {
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

  const normalizedQuery = value.trim().toLowerCase();
  // Query vuota: mostra comunque un elenco (i primi N) invece di un menu
  // vuoto finché non si digita — l'utente deve vedere subito che ci sono
  // professionisti/città tra cui scegliere, non scoprirlo solo scrivendo.
  // Sotto la soglia minChars invece niente elenco (usato per il campo città:
  // con ~7900 comuni i primi risultati "a caso" non aiutano, meglio aspettare
  // qualche lettera).
  // Match che iniziano con il testo digitato prima di quelli che lo
  // contengono solo in mezzo — altrimenti scrivendo "Roma" può comparire
  // prima "Fabrica di Roma" o un altro comune che contiene "roma" ma non
  // inizia così, invece del comune più pertinente (bug reale segnalato
  // dall'utente). L'ordine originale di `items` (es. dataset ISTAT dei
  // comuni, raggruppato per regione/provincia) non riflette la pertinenza
  // rispetto a quello che si sta cercando.
  const filtered =
    normalizedQuery.length < minChars
      ? []
      : normalizedQuery
        ? items
            .filter((item) => getLabel(item).toLowerCase().includes(normalizedQuery))
            .sort((a, b) => {
              const aLabel = getLabel(a).toLowerCase();
              const bLabel = getLabel(b).toLowerCase();
              const aStarts = aLabel.startsWith(normalizedQuery);
              const bStarts = bLabel.startsWith(normalizedQuery);
              if (aStarts !== bStarts) return aStarts ? -1 : 1;
              return aLabel.localeCompare(bLabel);
            })
            .slice(0, maxResults)
        : items.slice(0, maxResults);

  const showDropdown = isFocused && filtered.length > 0;

  return (
    <YStack position="relative" flex={1} ref={containerRef as never}>
      <Input
        flex={1}
        size={size}
        borderWidth={0}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setTimeout(() => setIsFocused(false), 150)}
      />
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
          <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator>
            {filtered.map((item) => (
              <YStack
                key={getKey(item)}
                padding="$3"
                borderBottomWidth={1}
                borderBottomColor="$borderColor"
                cursor="pointer"
                hoverStyle={{ backgroundColor: "$color3" }}
                onPress={() => onSelect(item)}
              >
                {renderItem ? renderItem(item) : <Text>{getLabel(item)}</Text>}
              </YStack>
            ))}
          </ScrollView>
        </YStack>
      ) : null}
    </YStack>
  );
}
