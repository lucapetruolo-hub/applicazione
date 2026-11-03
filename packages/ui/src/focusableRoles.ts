import { hooks, setupHooks } from "@tamagui/core";
import { Platform } from "react-native";
import { focusTabIndex } from "./focusTabIndex";

/*
 * Comandi fatti con un riquadro raggiungibili col Tab, come con Tamagui 1
 * (docs/changelog/2026-11-02-tamagui-3.md).
 *
 * Sul sito Tamagui 1 dava da sé `tabIndex="0"` a un elemento con ruolo
 * button, checkbox, link, radio, textbox o switch (e a chi aveva
 * `focusable`), e `"-1"` con `focusable={false}`. Tamagui 3 non lo fa più:
 * la casella dei Termini, "Vedi dettagli" e il menu dell'account non si
 * raggiungevano più con la tastiera. Qui la stessa regola, per tutti i
 * componenti, senza toccare le 160 pagine che contano su di lei.
 * `KeyboardActivation` (apps/web) li fa poi partire con Invio e Spazio.
 */
if (Platform.OS === "web") {
  // La trasformazione di Tamagui (che toglie `focusable` e `accessible`)
  // resta e gira sempre: qui si aggiunge solo il tabIndex.
  const tamaguiTransform = hooks.usePropsTransform;
  setupHooks({
    usePropsTransform(elementType, props, stateRef, willHydrate) {
      const tabIndex = focusTabIndex(elementType, props);
      const out = tamaguiTransform?.(elementType, props, stateRef, willHydrate) ?? props;
      if (tabIndex !== undefined) out.tabIndex = tabIndex;
      return out;
    },
  });
}
