"use client";

import type { ReactNode } from "react";
import { Icon, Text, XStack, YStack, brand } from "@professionisti/ui";

/**
 * Casella delle dichiarazioni obbligatorie (informative, maggiore età): registrazione e link d'invito.
 * `invalid`: si è provato a proseguire senza spuntarla, la riga si colora di
 * rosso (docs/CHANGELOG.md §246). `id` serve per scorrere fino a lei.
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
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      aria-invalid={showError || undefined}
    >
      <YStack
        width={18}
        height={18}
        marginTop={2}
        borderRadius="$1"
        borderWidth={2}
        borderColor={checked ? brand.cianografia : showError ? brand.urgenza : brand.filetto}
        backgroundColor={checked ? brand.cianografia : brand.calce}
        alignItems="center"
        justifyContent="center"
        flexShrink={0}
      >
        {checked ? <Icon name="check" size={12} strokeWidth={2.5} color="white" /> : null}
      </YStack>
      <Text fontSize="$2" color={showError ? brand.grafite : brand.grafite70} lineHeight={18}>
        {children}
      </Text>
    </XStack>
  );
}
