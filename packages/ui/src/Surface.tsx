import { YStack, styled } from "tamagui";
import { brand, radiusDoc } from "./tokens";

/**
 * Superficie bianca a bordo hairline, radius 4, senza ombra — il "Card" del
 * brief redesign (brief §3), rinominato `Surface` per non collidere col
 * `Card` di Tamagui, già re-esportato da questo package e ancora in uso da
 * pagine non ancora riscritte nel nuovo linguaggio visivo: un `Card`
 * ridefinito con lo stesso nome le avrebbe cambiate senza controllo.
 */
export const Surface = styled(YStack, {
  name: "Surface",
  backgroundColor: brand.calce,
  borderWidth: 1,
  borderColor: brand.filetto,
  borderRadius: radiusDoc,
  padding: "$4",

  variants: {
    /** Superficie flottante (dropdown, modali): unica ombra ammessa dal brief. */
    floating: {
      true: {
        shadowColor: "rgba(20,24,30,0.06)",
        shadowRadius: 2,
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 1,
      },
    },
  } as const,
});
