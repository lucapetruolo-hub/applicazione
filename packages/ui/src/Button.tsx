import { Button as TamaguiButton, styled } from "tamagui";
import { brand, radiusDoc } from "./tokens";

/**
 * `variant` è opzionale: senza di esso il bottone si comporta esattamente
 * come prima (sfondo $blue10, radius $4) — nessuna delle decine di pagine
 * già esistenti che usano <Button> senza variant cambia aspetto. Le nuove
 * varianti ("Scheda Intervento", brief redesign §3) sono opt-in per le
 * pagine che verranno riscritte nelle fasi successive.
 */
export const Button = styled(TamaguiButton, {
  name: "Button",
  borderRadius: "$4",
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
        height: 48,
        paddingHorizontal: 24,
        borderRadius: radiusDoc,
        backgroundColor: brand.cianografia,
        color: "white",
        fontFamily: "$body",
        fontWeight: "600",
        borderWidth: 0,
        hoverStyle: { backgroundColor: brand.cianografiaScuro },
        pressStyle: { backgroundColor: brand.cianografiaScuro },
        focusStyle: { outlineWidth: 2, outlineColor: brand.cianografia, outlineStyle: "solid", outlineOffset: 2 },
      },
      secondary: {
        height: 48,
        paddingHorizontal: 24,
        borderRadius: radiusDoc,
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
        height: 48,
        paddingHorizontal: 24,
        borderRadius: radiusDoc,
        backgroundColor: "transparent",
        borderWidth: 0,
        color: brand.grafite,
        fontFamily: "$body",
        fontWeight: "600",
        hoverStyle: { backgroundColor: brand.gesso },
        pressStyle: { backgroundColor: brand.filetto },
        focusStyle: { outlineWidth: 2, outlineColor: brand.cianografia, outlineStyle: "solid", outlineOffset: 2 },
      },
      // Solo nel flusso urgenza (CLAUDE.md, colore semantico: mai decorativo altrove).
      urgent: {
        height: 48,
        paddingHorizontal: 24,
        borderRadius: radiusDoc,
        backgroundColor: brand.urgenza,
        color: "white",
        fontFamily: "$body",
        fontWeight: "600",
        borderWidth: 0,
        hoverStyle: { backgroundColor: "#A82A21" },
        pressStyle: { backgroundColor: "#A82A21" },
        focusStyle: { outlineWidth: 2, outlineColor: brand.urgenza, outlineStyle: "solid", outlineOffset: 2 },
      },
    },
  } as const,
});
