import { YStack, styled } from "tamagui";
import { brand, radiusDoc } from "./tokens";

/**
 * Superficie bianca, radius morbido, ombra soffice al posto del bordo
 * hairline (brief "Vicinato", CLAUDE.md §19 — sostituisce il bordo sottile
 * di "Scheda Intervento": angoli quasi nulli + filetto era linguaggio da
 * documento tecnico, qui l'ombra dà profondità senza sembrare freddo). Il
 * "Card" del brief redesign, rinominato `Surface` per non collidere col
 * `Card` di Tamagui, già re-esportato da questo package.
 */
export const Surface = styled(YStack, {
  name: "Surface",
  backgroundColor: brand.calce,
  borderWidth: 0,
  borderRadius: radiusDoc,
  padding: "$4",
  shadowColor: "rgba(43,32,19,0.03)",
  shadowRadius: 6,
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 1,

  variants: {
    /** Superficie flottante (dropdown, modali): ombra più marcata. */
    floating: {
      true: {
        shadowColor: "rgba(43,32,19,0.06)",
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 5 },
        shadowOpacity: 1,
      },
    },
  } as const,
});
