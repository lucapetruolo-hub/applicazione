import type { ComponentProps } from "react";
import { Input, Text, YStack } from "tamagui";
import { brand, radiusDoc } from "./tokens";

export type FieldProps = ComponentProps<typeof Input> & {
  label: string;
  hint?: string;
  error?: string;
};

/**
 * Label mono uppercase + input + hint/errore — un solo pattern per tutti i
 * form del sito (brief §3), invece di ogni pagina che ridefinisce il proprio
 * stile di campo. L'errore, quando presente, sostituisce l'hint (mai
 * entrambi insieme) ed è sempre un messaggio che dice come risolvere, non
 * un generico "campo non valido" (brief §5.2).
 */
export function Field({ label, hint, error, ...inputProps }: FieldProps) {
  return (
    <YStack gap="$2">
      <Text fontFamily="$mono" fontSize={11} fontWeight="500" letterSpacing={0.8} textTransform="uppercase" color={brand.grafite70}>
        {label}
      </Text>
      <Input
        borderWidth={1}
        borderColor={error ? brand.urgenza : brand.filetto}
        borderRadius={radiusDoc}
        backgroundColor={brand.calce}
        paddingHorizontal="$3"
        height={48}
        focusStyle={{ borderColor: brand.cianografia, outlineWidth: 2, outlineColor: brand.cianografia, outlineStyle: "solid", outlineOffset: 1 }}
        {...inputProps}
      />
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
