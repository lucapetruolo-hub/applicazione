/// <reference lib="dom" />
"use client";

import { Fragment, useId } from "react";
import { AutocompleteList, revealFieldForList } from "./AutocompleteList";
import { useAutocomplete, type AutocompleteProps } from "./autocompleteModel";
import styles from "./Autocomplete.module.css";

export type { AutocompleteProps } from "./autocompleteModel";

const cx = (...names: (string | false | undefined)[]) => names.filter(Boolean).join(" ");

/** Misure del campo come `Input` (misure "3", "4" e "5" di Tamagui 1, Autocomplete.module.css). */
const SIZE_CLASS = { "3": styles.size3, "4": styles.size4, "5": styles.size5 } as const;

/**
 * Variante per il sito di `Autocomplete` (Autocomplete.tsx), in HTML semplice
 * (docs/changelog/2026-11-10-barra-di-ricerca-senza-tamagui.md): stessi
 * elementi, attributi e stili che scriveva Tamagui, ma il telefono non li
 * calcola all'apertura della pagina. La logica (filtro, tasti, chiusura al
 * clic fuori) è comune con l'app in `autocompleteModel.ts`; qui solo il
 * disegno. Se cambia uno dei due file, va cambiato anche l'altro.
 */
export function Autocomplete<T>(props: AutocompleteProps<T>) {
  const { getKey, getLabel, renderItem, value, placeholder, size, label, labelBadge, inputClassName, inputStart, inputEnd, id } = props;
  const model = useAutocomplete(props);
  const labelId = useId();
  const sizeClass = SIZE_CLASS[size ?? "4"];

  const option = (index: number, content: React.ReactNode) => (
    // Le opzioni si scelgono col mouse o col dito; dalla tastiera con le
    // frecce e Invio nel campo (aria-activedescendant), come prima.
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events
    <div
      id={model.optionId(index)}
      role="option"
      aria-selected={model.activeIndex === index}
      className={cx("is_View", styles.option, model.activeIndex === index && styles.optionActive)}
      onClick={() => model.choose(index)}
    >
      {content}
    </div>
  );

  // Il tema dei campi di Tamagui (colori, bordo, anello del fuoco) dalle sue classi in tamagui.css.
  const field = (
    <span className="t_sub_theme t_Input t_light_Input is_Theme" style={{ color: "var(--color)", display: "contents" }}>
      <input
        ref={model.inputRef as React.RefObject<HTMLInputElement>}
        tabIndex={0}
        placeholder={placeholder}
        aria-label={model.inputAriaLabel}
        autoComplete="off"
        {...model.comboboxProps}
        data-disable-theme="true"
        id={id}
        name="Input"
        value={value}
        aria-labelledby={label ? labelId : undefined}
        className={cx(
          "is_View",
          styles.input,
          sizeClass,
          "is_View font_body",
          inputStart != null && styles.inputHasStart,
          inputEnd != null && styles.inputHasEnd,
          inputClassName,
        )}
        onChange={(event) => model.handleChangeText(event.target.value)}
        onFocus={() => {
          model.handleFocus();
          revealFieldForList(model.containerRef.current);
        }}
        onBlur={model.handleBlur}
        onKeyDown={(event) => model.handleKey(event.key, () => event.preventDefault())}
      />
    </span>
  );

  return (
    <div className={`is_View ${styles.root}`} ref={model.containerRef as React.RefObject<HTMLDivElement>}>
      {label ? (
        <div className={`is_View ${styles.labelRow}`}>
          <label id={labelId} htmlFor={id} data-disable-theme="true" className={`is_Text font_body ${styles.label} is_Text`}>
            {label}
          </label>
          {labelBadge ? <span className={`is_Text ${styles.badge} label-badge`}>{labelBadge}</span> : null}
        </div>
      ) : null}
      {inputStart != null || inputEnd != null ? (
        // Miniatura e tasti dentro il campo (docs/changelog/2026-11-13-foto-nel-campo-di-ricerca.md).
        <div className={`is_View ${styles.inputWrap}`}>
          {field}
          {inputStart != null ? <div className={`is_View ${styles.inputStart}`}>{inputStart}</div> : null}
          {inputEnd != null ? <div className={`is_View ${styles.inputEnd}`}>{inputEnd}</div> : null}
        </div>
      ) : (
        field
      )}
      {/* Annuncio per i lettori di schermo: quanti suggerimenti ci sono. */}
      <span role="status" aria-live="polite" className={`is_Text ${styles.status}`}>
        {model.statusText}
      </span>
      {model.showDropdown ? (
        // Si apre morbida (apps/web/src/app/globals.css, `.pop-in`).
        <div className={cx("is_View", styles.dropdown, model.listInFlow && styles.dropdownInFlow, "pop-in")}>
          {/* Altezza secondo lo spazio libero, sfumatura con "Altre N", barra
              sempre visibile e frecce che fanno scorrere la lista
              (AutocompleteList.web.tsx). */}
          <AutocompleteList activeOptionId={model.activeIndex >= 0 ? model.optionId(model.activeIndex) : undefined}>
            <div id={model.listboxId} role="listbox" aria-label={model.listboxLabel} className={`is_View ${styles.listbox}`}>
              {model.action
                ? option(
                    0,
                    <>
                      <span className={`is_Text ${styles.actionLabel}`}>{model.action.label}</span>
                      {model.action.description ? <span className={`is_Text ${styles.detail}`}>{model.action.description}</span> : null}
                    </>,
                  )
                : null}
              {model.filtered.map((item, i) => {
                const index = i + (model.action ? 1 : 0);
                const heading = model.headingBefore(i);
                return (
                  <Fragment key={getKey(item)}>
                    {heading ? (
                      <span role="presentation" className={`is_Text ${styles.heading}`}>
                        {heading.label}
                      </span>
                    ) : null}
                    {option(index, renderItem ? renderItem(item) : <span className={`is_Text ${styles.text}`}>{getLabel(item)}</span>)}
                  </Fragment>
                );
              })}
            </div>
          </AutocompleteList>
        </div>
      ) : null}
    </div>
  );
}
