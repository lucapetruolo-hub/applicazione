"use client";

import { useId, type ReactNode } from "react";
import { Icon, Text, XStack, YStack, brand } from "@professionisti/ui";

/**
 * Casella delle dichiarazioni obbligatorie (informative, maggiore età): registrazione e link d'invito.
 * `invalid`: si è provato a proseguire senza spuntarla, la riga si colora di
 * rosso (docs/CHANGELOG.md §248). `id` serve per scorrere fino a lei.
 *
 * La casella vera (role="checkbox", raggiungibile col Tab e spuntabile con
 * Spazio) è solo il quadratino, con la scritta come nome; la riga intera
 * resta cliccabile. Prima la casella era tutta la riga e conteneva i link a
 * Termini e Privacy: con la tastiera non si spuntava
 * (docs/changelog/2026-10-30-tastiera.md, collaudo L-02).
 */
export function ConsentCheckbox({
  checked,
  onToggle,
  children,
  invalid = false,
  id,
}: {
  checked: boolean;
  onToggle: () => void;
  children: ReactNode;
  invalid?: boolean;
  id?: string;
}) {
  const showError = invalid && !checked;
  const labelId = useId();
  return (
    <XStack
      id={id}
      className={showError ? "consent-invalid" : undefined}
      alignItems="flex-start"
      gap="$2"
      paddingHorizontal={8}
      paddingVertical={6}
      marginHorizontal={-8}
      borderRadius="$2"
      borderWidth={1}
      borderColor={showError ? brand.urgenza : "transparent"}
      backgroundColor={showError ? brand.urgenzaVelo : "transparent"}
      cursor="pointer"
      onPress={onToggle}
    >
      <YStack
        accessibilityRole="checkbox"
        aria-checked={checked}
        aria-invalid={showError || undefined}
        aria-labelledby={labelId}
        onPress={(e: { stopPropagation: () => void }) => {
          e.stopPropagation();
          onToggle();
        }}
        width={18}
        height={18}
        marginTop={2}
        borderRadius="$1"
        borderWidth={2}
        borderColor={checked ? brand.cianografia : showError ? brand.urgenza : brand.bordoCampo}
        backgroundColor={checked ? brand.cianografia : brand.calce}
        alignItems="center"
        justifyContent="center"
        flexShrink={0}
      >
        {checked ? <Icon name="check" size={12} strokeWidth={2.5} color="white" /> : null}
      </YStack>
      <Text id={labelId} fontSize={13} color={showError ? brand.grafite : brand.grafite70} lineHeight={18}>
        {children}
      </Text>
    </XStack>
  );
}
