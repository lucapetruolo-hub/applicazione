"use client";

import { Text, brand } from "@professionisti/ui";
import { AuthCard, AuthPageBackground } from "@/components/AuthPageBackground";

export function PasswordDimenticataContent() {
  return (
    <AuthPageBackground>
      <AuthCard gap="$3">
        <Text fontFamily="$heading" fontWeight="800" fontSize="$8" color={brand.grafite} textAlign="center">
          Recupero password — presto disponibile
        </Text>
        <Text color={brand.grafite70} textAlign="center">
          L&apos;invio del link di reset via email è in arrivo. Nel frattempo scrivi a supporto@professionisti.it.
        </Text>
      </AuthCard>
    </AuthPageBackground>
  );
}
