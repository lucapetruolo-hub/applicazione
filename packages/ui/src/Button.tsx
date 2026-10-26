import { Button as TamaguiButton, styled } from "tamagui";
import { brand } from "./tokens";

export const BUTTON_HEIGHT = 44;
const PILL = 999;
/** Quasi nero caldo del pulsante di acquisto dell'abbonamento. */
const INCHIOSTRO = "#1A1513";

/**
 * `variant` è opzionale: senza di esso il bottone si comporta esattamente
 * come prima (sfondo $blue10, radius $4) — nessuna delle decine di pagine
 * già esistenti che usano <Button> senza variant cambia aspetto. Le nuove
 * varianti ("Scheda Intervento", brief redesign §3) sono opt-in per le
 * pagine che verranno riscritte nelle fasi successive.
 */
export const Button = styled(TamaguiButton, {
  name: "Button",
  // Pulsanti "vivi" (docs/CHANGELOG.md §233, scelta dell'utente): forma a
  // pillola piena e altezza 44 (minimo per il tocco). La pressione (scale
  // .97) è in CSS su `.is_Button` in apps/web/src/app/globals.css, così ha
  // una transizione morbida senza driver di animazione Tamagui.
  borderRadius: PILL,
  backgroundColor: "$blue10",
  color: "white",

  hoverStyle: {
    backgroundColor: "$blue9",
  },
  pressStyle: {
    backgroundColor: "$blue8",
  },

  variants: {
    variant: {
      primary: {
        height: BUTTON_HEIGHT,
        paddingHorizontal: 24,
        borderRadius: PILL,
        backgroundColor: brand.cianografiaPieno,
        color: "white",
        fontFamily: "$body",
        fontWeight: "600",
        borderWidth: 0,
        hoverStyle: { backgroundColor: brand.cianografiaScuro },
        pressStyle: { backgroundColor: brand.cianografiaScuro },
        focusStyle: { outlineWidth: 2, outlineColor: brand.cianografia, outlineStyle: "solid", outlineOffset: 2 },
      },
      secondary: {
        height: BUTTON_HEIGHT,
        paddingHorizontal: 24,
        borderRadius: PILL,
        backgroundColor: "transparent",
        borderWidth: 1,
        borderColor: brand.grafite,
        color: brand.grafite,
        fontFamily: "$body",
        fontWeight: "600",
        hoverStyle: { backgroundColor: brand.gesso },
        pressStyle: { backgroundColor: brand.filetto },
        focusStyle: { outlineWidth: 2, outlineColor: brand.cianografia, outlineStyle: "solid", outlineOffset: 2 },
      },
      ghost: {
        height: BUTTON_HEIGHT,
        paddingHorizontal: 24,
        borderRadius: PILL,
        backgroundColor: "transparent",
        borderWidth: 0,
        color: brand.grafite,
        fontFamily: "$body",
        fontWeight: "600",
        hoverStyle: { backgroundColor: brand.gesso },
        pressStyle: { backgroundColor: brand.filetto },
        focusStyle: { outlineWidth: 2, outlineColor: brand.cianografia, outlineStyle: "solid", outlineOffset: 2 },
      },
      // Quasi nero delle regole Taste (docs/CHANGELOG.md §288-§289). Dal
      // 24/10/2026 nessuna pagina lo usa più: l'utente ha scelto il verde per
      // tutti i pulsanti principali, anche in accesso e registrazione (§349).
      scuro: {
        height: BUTTON_HEIGHT,
        paddingHorizontal: 24,
        borderRadius: PILL,
        backgroundColor: brand.grafite,
        color: "white",
        fontFamily: "$body",
        fontWeight: "600",
        borderWidth: 0,
        hoverStyle: { backgroundColor: "#463B35" },
        pressStyle: { backgroundColor: "#463B35" },
        focusStyle: { outlineWidth: 2, outlineColor: brand.cianografia, outlineStyle: "solid", outlineOffset: 2 },
      },
      // Solo nel flusso urgenza (CLAUDE.md, colore semantico: mai decorativo altrove).
      urgent: {
        height: BUTTON_HEIGHT,
        paddingHorizontal: 24,
        borderRadius: PILL,
        backgroundColor: brand.urgenza,
        color: "white",
        fontFamily: "$body",
        fontWeight: "600",
        borderWidth: 0,
        hoverStyle: { backgroundColor: "#A82A21" },
        pressStyle: { backgroundColor: "#A82A21" },
        focusStyle: { outlineWidth: 2, outlineColor: brand.urgenza, outlineStyle: "solid", outlineOffset: 2 },
      },
      // Solo per comprare l'abbonamento (scelta dell'utente, §233): quasi
      // nero con il cerchio rosso della freccia (`ButtonArrow tone="red"`).
      acquisto: {
        height: BUTTON_HEIGHT,
        paddingHorizontal: 24,
        borderRadius: PILL,
        backgroundColor: INCHIOSTRO,
        color: "white",
        fontFamily: "$body",
        fontWeight: "600",
        borderWidth: 0,
        hoverStyle: { backgroundColor: brand.grafite },
        pressStyle: { backgroundColor: brand.grafite },
        focusStyle: { outlineWidth: 2, outlineColor: INCHIOSTRO, outlineStyle: "solid", outlineOffset: 2 },
      },
    },
  } as const,
});
