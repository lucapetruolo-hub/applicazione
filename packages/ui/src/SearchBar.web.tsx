/// <reference lib="dom" />
"use client";

import { Autocomplete } from "./Autocomplete";
import { Button } from "./Button";
import { Icon } from "./Icon";
import { MODE_TABS, useSearchBar, type CityOption, type ProfessionalSuggestion, type SearchBarProps } from "./searchBarModel";
import { brand } from "./tokens";
import styles from "./SearchBar.module.css";

export type { CityAlias, ProfessionalSuggestion, SearchBarProps, SearchMode } from "./searchBarModel";

const cx = (...names: (string | false | undefined)[]) => names.filter(Boolean).join(" ");

/** Voce dei suggerimenti di "Cosa ti serve?": il nome (o il problema) in grassetto, sotto il mestiere. */
function renderProfessional(item: ProfessionalSuggestion) {
  return (
    <div className={`is_View ${styles.suggestion}`}>
      <span className={`is_Text ${styles.suggestionTitle}`}>{item.title ?? item.name}</span>
      <span className={`is_Text ${styles.suggestionDetail}`}>{item.subtitle}</span>
    </div>
  );
}

/** "Città" con la frazione sotto, in grigio (Borgo Sabotino → Latina). */
function renderCity(item: CityOption) {
  return item.detail ? (
    <div className={`is_View ${styles.suggestion}`}>
      <span className={`is_Text ${styles.suggestionText}`}>{item.label}</span>
      <span className={`is_Text ${styles.suggestionDetail}`}>{item.detail}</span>
    </div>
  ) : (
    <span className={`is_Text ${styles.suggestionText}`}>{item.label}</span>
  );
}

/**
 * Variante per il sito di `SearchBar` (SearchBar.tsx), in HTML semplice
 * (docs/changelog/2026-11-10-barra-di-ricerca-senza-tamagui.md): stessi
 * elementi, attributi e stili che scriveva Tamagui, ma il telefono non li
 * calcola all'apertura della pagina. Stato e comportamento sono comuni con
 * l'app in `searchBarModel.ts`; qui solo il disegno (SearchBar.module.css
 * per i valori). Se cambia uno dei due file, va cambiato anche l'altro.
 */
export function SearchBar(props: SearchBarProps) {
  const { professionalSuggestions = [], compact = false, wrapSearchButton = (button) => button, footer } = props;
  const bar = useSearchBar(props);
  const { query, city, mode, activeTab, customQueryField } = bar;
  const cityField = { ...bar.cityField, renderItem: renderCity };

  if (compact) {
    // Una sola pillola bianca: modo, "Cosa ti serve?", "Città" e la lente
    // (richiesta di Luca, docs/changelog/2026-11-09-barra-in-alto-semplice.md).
    // Il modo si sceglie da un piccolo elenco invece di due pulsanti sempre
    // visibili; il nome resta scritto accanto all'icona (§349).
    return (
      <div ref={bar.modeMenuRef as React.RefObject<HTMLDivElement>} className={`is_View ${styles.pill} search-pill`}>
        {/* Invio e Spazio arrivano da KeyboardActivation (apps/web), come per gli altri riquadri con ruolo button. */}
        {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events */}
        <div
          className={`is_View ${styles.modeButton} press-scale`}
          onClick={() => bar.setModeMenuOpen((open) => !open)}
          role="button"
          tabIndex={0}
          aria-haspopup="menu"
          aria-expanded={bar.modeMenuOpen}
          aria-label={`Dove si svolge: ${activeTab.label}. Cambia`}
        >
          <Icon name={activeTab.icon} size={15} color={brand.cianografiaPieno} />
          {/* Sotto i 1281 px solo l'icona, come prima (§349): la barra non ci sta. */}
          <span className={`is_Text ${styles.modeButtonLabel}`}>{activeTab.label}</span>
          <Icon name={bar.modeMenuOpen ? "chevron-up" : "chevron-down"} size={14} color={brand.cianografiaPieno} />
        </div>
        {bar.modeMenuOpen ? (
          <div className={`is_View ${styles.menu} pop-in`} role="menu" aria-label="Dove si svolge">
            {MODE_TABS.map((tab) => {
              const active = tab.key === mode;
              return (
                // eslint-disable-next-line jsx-a11y/click-events-have-key-events
                <div
                  key={tab.key}
                  role="menuitemradio"
                  aria-checked={active}
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") return;
                    event.preventDefault();
                    bar.chooseMode(tab.key);
                  }}
                  className={cx("is_View", styles.menuItem, active ? styles.menuItemActive : styles.menuItemIdle)}
                  onClick={() => bar.chooseMode(tab.key)}
                >
                  <Icon name={tab.icon} size={16} color={active ? brand.cianografiaPieno : brand.grafite70} />
                  <span className={cx("is_Text", styles.menuItemLabel, active && styles.menuItemLabelActive)}>{tab.label}</span>
                  {active ? <Icon name="check" size={16} color={brand.cianografiaPieno} /> : null}
                </div>
              );
            })}
          </div>
        ) : null}
        <div className={`is_View ${styles.pillQuery}`}>
          <Autocomplete
            items={professionalSuggestions}
            getKey={(item) => item.id}
            getLabel={(item) => item.name}
            onSelect={bar.handleSelectProfessional}
            value={query}
            onChangeText={bar.handleQueryChange}
            placeholder="Cosa ti serve?"
            inputClassName="search-pill-input"
            size="3"
            maxResults={professionalSuggestions.length}
            renderItem={renderProfessional}
          />
        </div>
        <div className={`is_View ${styles.pillDivider}`} aria-hidden="true" />
        <div className={`is_View ${styles.pillCity}`}>
          <Autocomplete {...cityField} value={city} onChangeText={bar.setCity} placeholder="Città" inputClassName="search-pill-input" size="3" />
        </div>
        {wrapSearchButton(
          <Button variant="primary" size="3" width={38} height={38} paddingHorizontal={0} borderRadius={999} aria-label="Cerca" onPress={bar.runSearch}>
            <Icon name="search" size={17} color="white" />
          </Button>,
        )}
      </div>
    );
  }

  return (
    <>
      <div className={`is_View ${styles.card}`}>
        {/* Da telefono le due schede occupano tutta la larghezza a metà ciascuna,
            sotto i 390 px larghe quanto il testo, su una riga: a 320 px "Online" usciva dal riquadro
            (docs/changelog/2026-10-28-richiedi-preventivo-in-alto.md). */}
        <div className={`is_View ${styles.tabs}`}>
          {MODE_TABS.map((tab) => {
            const active = tab.key === mode;
            return (
              // Invio e Spazio arrivano da KeyboardActivation (apps/web).
              // eslint-disable-next-line jsx-a11y/click-events-have-key-events
              <div
                key={tab.key}
                className={cx("is_View", styles.tab, active ? styles.tabActive : styles.tabIdle, "press-scale")}
                onClick={() => bar.handleModeChange(tab.key)}
                role="button"
                tabIndex={0}
                aria-pressed={active}
                aria-label={tab.label}
              >
                <Icon name={tab.icon} size={15} color={active ? "white" : brand.grafite70} />
                <span className={cx("is_Text", styles.tabLabel, active ? styles.tabLabelActive : styles.tabLabelIdle)}>{tab.label}</span>
              </div>
            );
          })}
        </div>

        {/* flex-end: con le etichette sopra i campi, "Cerca" resta allineato ai campi e non alle etichette. */}
        <div className={`is_View ${styles.fields}`}>
          <Autocomplete
            items={professionalSuggestions}
            getKey={(item) => item.id}
            getLabel={(item) => item.name}
            onSelect={bar.handleSelectProfessional}
            value={query}
            onChangeText={bar.handleQueryChange}
            // Etichetta vera sopra il campo ed esempio corto dentro: quello
            // lungo di prima veniva tagliato ("Es. Idraulico, Elettricis").
            // L'esempio dice che il campo capisce anche il problema (§392,
            // docs/changelog/2026-10-28-richiedi-preventivo-in-alto.md); corto
            // perché stia intero anche su un telefono da 320 px.
            label={customQueryField?.label ?? "Cosa ti serve?"}
            labelBadge={customQueryField?.badge}
            focusRef={bar.queryFocusRef}
            inputClassName={customQueryField?.className}
            id={`${bar.fieldId}-cosa`}
            placeholder={customQueryField?.placeholder ?? (mode === "online" ? "Es. consulenza idraulico" : "Es. idraulico, un guasto")}
            size="5"
            listInFlowOnPhone
            maxResults={professionalSuggestions.length + (customQueryField?.examples?.length ?? 0)}
            emptyItems={customQueryField?.examples?.length ? [...customQueryField.examples, ...professionalSuggestions] : undefined}
            emptyHeadings={
              customQueryField?.examples?.length
                ? [
                    { index: 0, label: "Scrivi il problema, per esempio:" },
                    { index: customQueryField.examples.length, label: "Oppure scegli chi cerchi:" },
                  ]
                : undefined
            }
            renderItem={renderProfessional}
          />
          <div className={`is_View ${styles.fieldsDivider}`} />
          <Autocomplete
            {...cityField}
            value={city}
            onChangeText={bar.setCity}
            label={mode === "online" ? "Città (facoltativa)" : "Città"}
            focusRef={bar.cityFocusRef}
            id={`${bar.fieldId}-citta`}
            placeholder="Es. Milano"
            size="5"
          />
          {wrapSearchButton(
            <Button variant="primary" onPress={bar.runSearch}>
              Cerca
            </Button>,
          )}
        </div>
        {mode === "online" ? (
          <span className={`is_Text ${styles.onlineHelp}`}>
            Consulenza online: parla con il professionista da remoto, ovunque tu sia. Puoi indicare una città per
            trovare professionisti online della tua zona.
          </span>
        ) : null}
      </div>
      {footer?.({ mode, fillQuery: bar.fillQuery, searchFor: bar.searchFor })}
    </>
  );
}
