import type { ComponentProps, ReactNode } from "react";
import { Input, Text, XStack, YStack } from "tamagui";
import { brand, radiusDoc } from "./tokens";

export type FieldProps = ComponentProps<typeof Input> & {
  label: string;
  hint?: string;
  error?: string;
  /** Slot opzionale a destra dentro il campo (es. toggle mostra/nascondi password). */
  rightElement?: ReactNode;
};

/**
 * Label mono uppercase + input + hint/errore — un solo pattern per tutti i
 * form del sito (brief §3), invece di ogni pagina che ridefinisce il proprio
 * stile di campo. L'errore, quando presente, sostituisce l'hint (mai
 * entrambi insieme) ed è sempre un messaggio che dice come risolvere, non
 * un generico "campo non valido" (brief §5.2). Niente icona a sinistra
 * dentro il campo (a differenza del vecchio `AuthInput`): la label sopra
 * basta a identificare il campo, un'icona decorativa in più non è coerente
 * con l'estetica "scheda tecnica" del brief.
 */
export function Field({ label, hint, error, rightElement, ...inputProps }: FieldProps) {
  return (
    <YStack gap="$2">
      <Text fontFamily="$body" fontSize={11} fontWeight="700" color={brand.grafite70}>
        {label}
      </Text>
      <XStack
        alignItems="center"
        borderWidth={1}
        borderColor={error ? brand.urgenza : brand.filetto}
        borderRadius={radiusDoc}
        backgroundColor={brand.calce}
        paddingHorizontal="$3"
      >
        <Input
          flex={1}
          borderWidth={0}
          backgroundColor="transparent"
          height={48}
          paddingHorizontal={0}
          focusStyle={{ outlineWidth: 2, outlineColor: brand.cianografia, outlineStyle: "solid", outlineOffset: 1 }}
          {...inputProps}
        />
        {rightElement}
      </XStack>
      {error ? (
        <Text fontSize={13} color={brand.urgenza}>
          {error}
        </Text>
      ) : hint ? (
        <Text fontSize={13} color={brand.grafite70}>
          {hint}
        </Text>
      ) : null}
    </YStack>
  );
}
