"use client";

import { Text, XStack, YStack, brand } from "@professionisti/ui";

/**
 * "Social proof" richiesta esplicitamente dall'utente ("Utenti entrati
 * nella piattaforma / Professionisti entrati nella piattaforma") — due
 * numeri reali (`GET /stats/platform`, apps/api/src/stats), mai finti:
 * l'utente ha specificato esplicitamente che devono essere conteggi reali.
 * Non renderizzata affatto se lo stat fetch fallisce (page.tsx ricade su
 * `null`) — nessuno zero fuorviante al posto di un dato assente.
 */
export function PlatformStats({ stats }: { stats: { totalUsers: number; totalProfessionals: number } }) {
  // Sotto questa soglia i numeri sarebbero più imbarazzanti che
  // rassicuranti (es. "3 utenti") — stessa logica di cautela già applicata
  // altrove nel prodotto (MIN_PROFESSIONALS_TO_SHOWCASE per la vetrina).
  if (stats.totalUsers < 10) return null;

  return (
    <YStack width="100%" alignItems="center" paddingVertical="$5" paddingHorizontal="$4">
      <XStack gap="$7" flexWrap="wrap" justifyContent="center" alignItems="center">
        <YStack alignItems="center" gap={2}>
          <Text fontFamily="$heading" fontWeight="700" fontSize={28} color={brand.grafite}>
            {stats.totalUsers.toLocaleString("it-IT")}
          </Text>
          <Text fontSize={13} fontWeight="600" color={brand.grafite70}>
            Utenti entrati nella piattaforma
          </Text>
        </YStack>
        <YStack alignItems="center" gap={2}>
          <Text fontFamily="$heading" fontWeight="700" fontSize={28} color={brand.grafite}>
            {stats.totalProfessionals.toLocaleString("it-IT")}
          </Text>
          <Text fontSize={13} fontWeight="600" color={brand.grafite70}>
            Professionisti entrati nella piattaforma
          </Text>
        </YStack>
      </XStack>
    </YStack>
  );
}
