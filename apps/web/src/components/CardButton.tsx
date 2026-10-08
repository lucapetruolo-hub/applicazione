"use client";

import type { ComponentProps, ReactNode } from "react";
import { Button, Text, brand } from "@professionisti/ui";

/**
 * Pulsante delle azioni in fondo alle schede delle richieste ("Richieste e
 * lavori" del professionista, "Le mie richieste" del cliente): stessa
 * altezza e testo di "Contatta/Cronologia" per tutti, e sempre un bordo o
 * uno sfondo, mai solo testo (richiesta esplicita dell'utente,
 * docs/CHANGELOG.md §195).
 *
 * - `primary`: pieno blu, l'azione principale della scheda
 * - `outline`: bordo grafite, le azioni secondarie (Modifica, Ripeti, Annulla...)
 * - `danger`: bordo rosso, azioni che tolgono qualcosa (Rifiuta, Elimina...)
 * - `dangerSolid`: pieno rosso, la conferma di un'azione `danger`
 * - `fill`: pieno di un colore già scelto dall'utente (ottone, verde, turchese)
 */
type Tone = "primary" | "outline" | "danger" | "dangerSolid";

type CardButtonProps = Omit<ComponentProps<typeof Button>, "variant" | "size" | "height" | "children"> & {
  tone?: Tone;
  fill?: string;
  /** Versione più piccola, per i pannelli stretti come la prenotazione in Agenda (richiesta dell'utente). */
  compact?: boolean;
  children: ReactNode;
};

export const CARD_BUTTON_HEIGHT = 40;
const CARD_BUTTON_HEIGHT_COMPACT = 34;

export function CardButton({ tone = "outline", fill, compact, children, disabled, ...rest }: CardButtonProps) {
  const textColor = fill || tone === "primary" || tone === "dangerSolid" ? "white" : tone === "danger" ? brand.urgenza : brand.grafite;
  const toneProps: ComponentProps<typeof Button> = fill
    ? { variant: "secondary", backgroundColor: fill, borderColor: fill, hoverStyle: { backgroundColor: fill, opacity: 0.88 }, pressStyle: { backgroundColor: fill, opacity: 0.8 } }
    : tone === "primary"
      ? { variant: "primary" }
      : tone === "dangerSolid"
        ? { variant: "urgent" }
        : tone === "danger"
          ? { variant: "secondary", borderColor: brand.urgenza, hoverStyle: { backgroundColor: brand.urgenzaVelo }, pressStyle: { backgroundColor: brand.urgenzaVelo } }
          : { variant: "secondary" };

  return (
    // `toneProps` prima di misura e altezza: in Tamagui vince la prop scritta
    // per ultima, e le varianti di Button impostano altezza 48.
    <Button
      {...toneProps}
      size={compact ? "$2" : "$3"}
      height={compact ? CARD_BUTTON_HEIGHT_COMPACT : CARD_BUTTON_HEIGHT}
      paddingHorizontal={compact ? 14 : 24}
      disabled={disabled}
      opacity={disabled ? 0.6 : 1}
      {...rest}
    >
      {typeof children === "string" ? (
        <Text color={textColor} fontFamily="$body" fontWeight="600" fontSize={compact ? "$2" : "$3"}>
          {children}
        </Text>
      ) : (
        children
      )}
    </Button>
  );
}
