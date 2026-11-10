"use client";

import type { ComponentProps, ReactNode } from "react";
import { Button, ButtonArrow, Text, XStack, brand } from "@professionisti/ui";
import { ButtonWaitBar } from "./WaitBar";

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

type CardButtonProps = Omit<ComponentProps<typeof Button>, "variant" | "size" | "children"> & {
  tone?: Tone;
  fill?: string;
  /** Versione più piccola, per i pannelli stretti come la prenotazione in Agenda (richiesta dell'utente). */
  compact?: boolean;
  /** Versione piccola solo su telefono, per le file di pulsanti delle schede (docs/CHANGELOG.md §228). */
  compactOnPhone?: boolean;
  /** Freccia che ruota al passaggio del mouse, solo sulle azioni principali (docs/CHANGELOG.md §233). */
  arrow?: boolean;
  /** Mentre si aspetta il server: la barra sopra la scritta, con questa frase per il lettore di schermo. */
  waitingLabel?: string;
  children: ReactNode;
};

// 44 come i pulsanti del sito (BUTTON_HEIGHT), 40 nella versione piccola:
// a 34-40 si sbagliava a toccare da telefono (collaudo D-07, L-13).
export const CARD_BUTTON_HEIGHT = 44;
const CARD_BUTTON_HEIGHT_COMPACT = 40;

export function CardButton({ tone = "outline", fill, compact, compactOnPhone, arrow, waitingLabel, children, disabled, ...rest }: CardButtonProps) {
  const textColor = fill || tone === "primary" || tone === "dangerSolid" ? "white" : tone === "danger" ? brand.urgenza : brand.grafite;
  const toneProps: ComponentProps<typeof Button> = fill
    ? { variant: "secondary", backgroundColor: fill, borderColor: fill }
    : tone === "primary"
      ? { variant: "primary" }
      : tone === "dangerSolid"
        ? { variant: "urgent" }
        : tone === "danger"
          ? { variant: "secondary", borderColor: brand.urgenza, backgroundColor: `transparent hover:${brand.urgenzaVelo} press:${brand.urgenzaVelo}` }
          : { variant: "secondary" };

  const label =
    typeof children === "string" ? (
      <Text color={textColor} fontFamily="body" fontWeight="600" fontSize={compact ? "2" : compactOnPhone ? "3 xs:13px" : "3"}>
        {children}
      </Text>
    ) : (
      children
    );

  return (
    // `toneProps` prima di misura e altezza: in Tamagui vince la prop scritta
    // per ultima, e le varianti di Button impostano altezza 48.
    <Button
      {...toneProps}
      size={compact ? "2" : "3"}
      height={compact ? CARD_BUTTON_HEIGHT_COMPACT : compactOnPhone ? `${CARD_BUTTON_HEIGHT}px xs:${CARD_BUTTON_HEIGHT_COMPACT}px` : CARD_BUTTON_HEIGHT}
      paddingHorizontal={compact ? 14 : compactOnPhone ? "24px xs:14px" : 24}
      // Il colore pieno si schiarisce un poco al passaggio e alla pressione.
      opacity={disabled ? 0.6 : fill ? "1 hover:0.88 press:0.8" : 1}
      {...rest}
      disabled={disabled}
    >
      {arrow ? (
        <XStack alignItems="center" gap="2">
          {label}
          <ButtonArrow size={compact ? 20 : 24} />
        </XStack>
      ) : (
        label
      )}
      {/* Barra bianca sui pulsanti pieni, verde su quelli bianchi. */}
      {waitingLabel ? <ButtonWaitBar label={waitingLabel} tone={fill || tone === "primary" || tone === "dangerSolid" ? "light" : "green"} /> : null}
    </Button>
  );
}
