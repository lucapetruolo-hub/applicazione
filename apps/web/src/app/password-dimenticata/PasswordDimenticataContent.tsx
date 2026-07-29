"use client";

import { Text, YStack, brand } from "@professionisti/ui";

export function PasswordDimenticataContent() {
  return (
    <YStack width="100%" alignItems="center" backgroundColor={brand.gesso} paddingVertical="$9" paddingHorizontal="$4">
      <YStack width="100%" maxWidth={420} gap="$3" alignItems="center">
        <Text fontFamily="$heading" fontWeight="800" fontSize="$8" color={brand.grafite} textAlign="center">
          Recupero password — presto disponibile
        </Text>
        <Text color={brand.grafite70} textAlign="center">
          L&apos;invio del link di reset via email è in arrivo. Nel frattempo scrivi a supporto@professionisti.it.
        </Text>
      </YStack>
    </YStack>
  );
}
