"use client";

import { Fragment } from "react";
import { Label, Text, XStack, YStack, isWeb } from "tamagui";
import { AutocompleteList, revealFieldForList } from "./AutocompleteList";
import { useAutocomplete, type AutocompleteProps } from "./autocompleteModel";
import { Input } from "./Input";
import { brand } from "./tokens";

export type { AutocompleteProps } from "./autocompleteModel";

/**
 * Campo di testo con elenco a discesa filtrato in tempo reale, usato per la
 * ricerca professionisti/città (condiviso web+mobile). La logica sta in
 * `autocompleteModel.ts`, comune con la variante del sito in HTML semplice
 * (Autocomplete.web.tsx, docs/changelog/2026-11-10-barra-di-ricerca-senza-tamagui.md).
 */
export function Autocomplete<T>(props: AutocompleteProps<T>) {
  const { getKey, getLabel, renderItem, value, placeholder, size, label, labelBadge, id, inputClassName, inputStart, inputEnd } = props;
  const {
    containerRef,
    inputRef,
    listboxId,
    listboxLabel,
    inputAriaLabel,
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
  } = useAutocomplete(props);

  const field = (
    <Input
      ref={inputRef as never}
      className={inputClassName}
      id={id}
      flex={1}
      size={size}
      borderWidth={0}
      value={value}
      onChangeText={handleChangeText}
      placeholder={placeholder}
      aria-label={inputAriaLabel}
      autoComplete="off"
      // Invio senza suggerimento scelto non toglie il fuoco dal campo (collaudo L-08).
      blurOnSubmit={false}
      onFocus={() => {
        handleFocus();
        revealFieldForList(containerRef.current);
      }}
      onBlur={handleBlur}
      // Sul sito il tasto arriva da onKeyDown (con Tamagui 3 l'Input del
      // web è un <input> vero e ignora onKeyPress), nell'app da onKeyPress.
      onKeyDown={(event: { key: string; preventDefault: () => void }) => handleKey(event.key, () => event.preventDefault())}
      {...(isWeb
        ? null
        : {
            onKeyPress: (event: unknown) => {
              const key = (event as { nativeEvent?: { key?: string } }).nativeEvent?.key;
              if (key) handleKey(key, () => undefined);
            },
          })}
      {...(comboboxProps as Record<string, unknown>)}
    />
  );

  return (
    <YStack position="relative" flex={1} ref={containerRef as never}>
      {label ? (
        <XStack alignItems="center" gap="2" paddingBottom={4}>
          <Label htmlFor={id} fontSize={16} lineHeight="18px" height="auto" fontWeight="600" color={brand.grafite70} paddingLeft="1">
            {label}
          </Label>
          {labelBadge ? (
            <Text className="label-badge" fontSize={12} lineHeight="16px" fontWeight="700" color="white" backgroundColor={brand.cianografiaPieno} borderRadius={999} paddingHorizontal={8} paddingVertical={2}>
              {labelBadge}
            </Text>
          ) : null}
        </XStack>
      ) : null}
      {inputStart != null || inputEnd != null ? (
        // Miniatura e tasti dentro il campo, come sul sito (docs/changelog/2026-11-13-foto-nel-campo-di-ricerca.md).
        <XStack alignItems="center" gap="2">
          {inputStart}
          {field}
          {inputEnd}
        </XStack>
      ) : (
        field
      )}
      {/* Annuncio per i lettori di schermo: quanti suggerimenti ci sono. */}
      <Text role="status" aria-live="polite" position="absolute" width={1} height={1} overflow="hidden" opacity={0} pointerEvents="none">
        {statusText}
      </Text>
      {showDropdown ? (
        <YStack
          // Si apre morbida (apps/web/src/app/globals.css, `.pop-in`).
          className="pop-in"
          position={listInFlow ? "absolute sm:relative" : "absolute"}
          top={listInFlow ? "100% sm:auto" : "100%"}
          left={0}
          right={0}
          marginTop="2"
          backgroundColor="white"
          borderWidth={1}
          borderColor="borderColor"
          borderRadius="4"
          overflow="hidden"
          zIndex={1000}
          shadowColor="shadowColor"
          shadowRadius={12}
          shadowOpacity={0.15}
        >
          {/* Altezza secondo lo spazio libero, sfumatura con "Altre N", barra
              sempre visibile e frecce che fanno scorrere la lista
              (AutocompleteList.web.tsx). */}
          <AutocompleteList activeOptionId={activeIndex >= 0 ? optionId(activeIndex) : undefined}>
            <YStack id={listboxId} {...({ role: "listbox", "aria-label": listboxLabel } as Record<string, unknown>)}>
              {action ? (
                <YStack
                  id={optionId(0)}
                  role="option"
                  aria-selected={activeIndex === 0}
                  padding="3"
                  borderBottomWidth={1}
                  borderBottomColor="borderColor"
                  cursor="pointer"
                  backgroundColor={`${activeIndex === 0 ? "color3" : undefined} hover:color3`}
                  onPress={() => choose(0)}
                >
                  <Text fontWeight="600" color={brand.cianografiaPieno}>
                    {action.label}
                  </Text>
                  {action.description ? (
                    <Text fontSize={13} color="color10">
                      {action.description}
                    </Text>
                  ) : null}
                </YStack>
              ) : null}
              {filtered.map((item, i) => {
                const index = i + (action ? 1 : 0);
                const heading = headingBefore(i);
                return (
                  <Fragment key={getKey(item)}>
                    {heading ? (
                      <Text role="presentation" paddingHorizontal="3" paddingTop="3" paddingBottom="1" fontSize={13} fontWeight="700" color={brand.grafite70}>
                        {heading.label}
                      </Text>
                    ) : null}
                    <YStack
                      id={optionId(index)}
                      role="option"
                      aria-selected={activeIndex === index}
                      padding="3"
                      borderBottomWidth={1}
                      borderBottomColor="borderColor"
                      cursor="pointer"
                      backgroundColor={`${activeIndex === index ? "color3" : undefined} hover:color3`}
                      onPress={() => choose(index)}
                    >
                      {renderItem ? renderItem(item) : <Text>{getLabel(item)}</Text>}
                    </YStack>
                  </Fragment>
                );
              })}
            </YStack>
          </AutocompleteList>
        </YStack>
      ) : null}
    </YStack>
  );
}
