import { useId, type ComponentProps, type ReactNode } from "react";
import { Text, XStack, YStack } from "tamagui";
import { Icon } from "./Icon";
import { Input } from "./Input";
import { brand, radiusDoc } from "./tokens";

export type FieldProps = ComponentProps<typeof Input> & {
  label: string;
  hint?: string;
  error?: string;
  /** Esito positivo in verde con la spunta (es. "Partita IVA corretta"); l'errore lo sostituisce. */
  success?: string;
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
 *
 * L'errore è annunciato dal lettore di schermo e collegato al campo, che
 * risulta sbagliato (docs/changelog/2026-10-30-tastiera.md, collaudo L-07);
 * l'anello del fuoco sta sul riquadro, così non si sfalsa col bordo rosso.
 */
export function Field({ label, hint, error, success, rightElement, ...inputProps }: FieldProps) {
  const messageId = useId();
  return (
    <YStack gap="2">
      <Text fontFamily="body" fontSize={16} fontWeight="700" color={brand.grafite70}>
        {label}
      </Text>
      <XStack
        alignItems="center"
        borderWidth={1}
        borderColor={error ? brand.urgenza : brand.bordoCampo}
        borderRadius={radiusDoc}
        backgroundColor={brand.calce}
        paddingHorizontal="3"
        outlineWidth="focus-within:2px"
        outlineColor={`focus-within:${error ? brand.urgenza : brand.cianografia}`}
        outlineStyle="focus-within:solid"
        outlineOffset="focus-within:1px"
      >
        <Input
          flex={1}
          borderWidth={0}
          backgroundColor="transparent"
          height={48}
          paddingHorizontal={0}
          outlineWidth="focus:0px"
          {...inputProps}
          blurOnSubmit={false}
          aria-invalid={error ? true : undefined}
          aria-label={label}
          aria-describedby={error || success || hint ? messageId : undefined}
        />
        {rightElement}
      </XStack>
      {error ? (
        <Text id={messageId} role="alert" fontSize={16} color={brand.urgenza}>
          {error}
        </Text>
      ) : success ? (
        <XStack id={messageId} role="status" alignItems="center" gap="2">
          <Icon name="check" size={18} color={brand.cianografiaScuro} strokeWidth={2.25} />
          <Text fontSize={16} fontWeight="600" color={brand.cianografiaScuro}>
            {success}
          </Text>
        </XStack>
      ) : hint ? (
        <Text id={messageId} fontSize={16} color={brand.grafite70}>
          {hint}
        </Text>
      ) : null}
    </YStack>
  );
}
