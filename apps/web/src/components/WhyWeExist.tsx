"use client";

import { Section, Text, XStack, YStack, brand } from "@professionisti/ui";

/**
 * "Perché esistiamo" (richiesta esplicita dell'utente): storia personale
 * del fondatore, testo fornito verbatim dall'utente stesso — non una
 * testimonianza fabbricata (diverso dai casi già documentati in questo
 * progetto in cui recensioni/testimonial finti sono stati rimossi, qui è
 * il titolare della piattaforma che racconta la propria esperienza reale).
 */
export function WhyWeExist() {
  return (
    <Section eyebrow="Perché esistiamo" maxWidth={720}>
      <XStack width="100%" gap="$4" alignItems="flex-start" flexWrap="wrap">
        <YStack
          width={56}
          height={56}
          borderRadius={28}
          backgroundColor={brand.cianografiaVelo}
          alignItems="center"
          justifyContent="center"
          flexShrink={0}
        >
          <Text fontFamily="$heading" fontWeight="800" fontSize={22} color={brand.cianografia}>
            L
          </Text>
        </YStack>
        <YStack flex={1} minWidth={240} gap="$3">
          <Text fontSize="$5" lineHeight={28} color={brand.grafite} fontStyle="italic">
            &quot;Mi chiamo Luca. Sono stato fregato da un idraulico che mi ha chiesto una cifra spropositata rispetto
            al lavoro effettuato. Da lì è nato questo progetto: un posto dove il prezzo è chiaro prima, non
            dopo.&quot;
          </Text>
          <Text fontSize="$3" fontWeight="700" color={brand.grafite70}>
            Luca, fondatore
          </Text>
        </YStack>
      </XStack>
    </Section>
  );
}
