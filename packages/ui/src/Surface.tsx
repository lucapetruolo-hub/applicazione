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
  // Nessuna ombra di default (richiesta esplicita dell'utente, quattro giri
  // di "ancora meno ombra"): il contrasto bianco-su-pesca basta a
  // distinguere una card in flusso normale, un'ombra qui era ridondante.
  shadowColor: "rgba(43,32,19,0)",
  shadowRadius: 0,
  shadowOffset: { width: 0, height: 0 },
  shadowOpacity: 1,

  variants: {
    /** Superficie flottante (dropdown, modali): unico caso che tiene un
     * accenno di ombra, appena percettibile — separarsi dal contenuto
     * sottostante resta utile solo quando la superficie è sollevata sopra
     * altro contenuto, non quando è semplicemente una card nel flusso. */
    floating: {
      true: {
        shadowColor: "rgba(43,32,19,0.015)",
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 1,
      },
    },
  } as const,
});
