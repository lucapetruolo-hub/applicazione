"use client";

import { Text, XStack, YStack, brand, radiusDoc } from "@professionisti/ui";

/**
 * Riquadro "prima → ora" di un cambio di data/orario: lo stesso per il
 * professionista (proposta del cliente, in Richieste e lavori) e per il
 * cliente (modifica del professionista, in Le mie richieste) — richiesta
 * esplicita dell'utente, docs/CHANGELOG.md §186. Senza `beforeText` data e
 * orario non sono cambiati (è stata aggiunta solo una nota): niente "prima"
 * sbarrato né freccia, solo l'appuntamento com'è (docs/CHANGELOG.md §194).
 */
export function ScheduleChangeBox({
  title,
  beforeLabel,
  beforeText,
  afterLabel,
  afterText,
  note,
  marginTop,
}: {
  title: string;
  beforeLabel?: string;
  beforeText?: string | null;
  afterLabel: string;
  afterText: string;
  note?: string | null;
  marginTop?: "$3";
}) {
  return (
    <YStack
      marginTop={marginTop}
      padding="$4"
      borderRadius={radiusDoc}
      backgroundColor="#FFF8E1"
      borderWidth={1.5}
      borderStyle="dashed"
      borderColor={brand.ottone}
      gap="$3"
    >
      <Text fontFamily="$body" fontWeight="800" fontSize={14} color="#8a5a00">
        {title}
      </Text>
      <XStack alignItems="center" gap="$2">
        {beforeText ? (
          <>
            <YStack flex={1} padding="$3" borderRadius={12} backgroundColor="#F5F5F5">
              <Text fontSize={10.5} fontWeight="700" color={brand.grafite70} textTransform="uppercase">
                {beforeLabel}
              </Text>
              <Text fontSize={13} color={brand.grafite70} textDecorationLine="line-through">
                {beforeText}
              </Text>
            </YStack>
            <Text fontSize={20} fontWeight="800" color={brand.ottone}>
              →
            </Text>
          </>
        ) : null}
        <YStack flex={1} padding="$3" borderRadius={12} backgroundColor={brand.calce} borderWidth={2} borderColor={brand.ottone}>
          <Text fontSize={10.5} fontWeight="700" color={brand.ottone} textTransform="uppercase">
            {afterLabel}
          </Text>
          <Text fontSize={13} fontWeight="800" color={brand.grafite}>
            {afterText}
          </Text>
        </YStack>
      </XStack>
      {note ? (
        <YStack padding="$3" borderRadius={8} backgroundColor={brand.calce} borderLeftWidth={3} borderLeftColor={brand.ottone}>
          <Text fontSize={13} color={brand.grafite}>
            {note}
          </Text>
        </YStack>
      ) : null}
    </YStack>
  );
}
