"use client";

import { Badge, Surface, Text, XStack, YStack, brand } from "@professionisti/ui";

const BOOST_OPTIONS: { type: "BOOST_LOCALE" | "BADGE_REPUTAZIONE" | "STORIA_SUCCESSO"; label: string; description: string; priceEur: number }[] = [
  { type: "BOOST_LOCALE", label: "Boost locale", description: "Prime posizioni nei risultati per 30 giorni.", priceEur: 19.9 },
  { type: "BADGE_REPUTAZIONE", label: "Badge reputazione", description: "Evidenza per rating alto e risposta rapida.", priceEur: 9.9 },
  { type: "STORIA_SUCCESSO", label: "Storia di successo", description: "Contenuto editoriale in evidenza sulla piattaforma.", priceEur: 49.9 },
];

/**
 * Pacchetti di visibilità (CLAUDE.md §6). Spostati dalla Dashboard a
 * "Profilo e visibilità" (docs/CHANGELOG.md §147): la Home "Oggi" mostra solo
 * cose da fare. Prezzi e contenuti invariati (decisione di prezzo non presa
 * qui).
 */
export function BoostSection() {
  return (
    <YStack gap="$3">
      <Text fontFamily="$heading" fontWeight="700" fontSize="$7" color={brand.grafite}>
        Aumenta la tua visibilità
      </Text>
      <YStack gap="$3" $gtSm={{ flexDirection: "row" }}>
        {BOOST_OPTIONS.map((option) => (
          <Surface key={option.type} flex={1} gap="$2">
            <XStack alignItems="center" gap="$2" flexWrap="wrap">
              <Badge variant="pro">{option.label}</Badge>
              {/* Pagamenti non ancora attivi (Stripe escluso dal lancio):
                  il bottone "Acquista" fallirebbe sempre, quindi mostriamo
                  uno stato "In arrivo" onesto invece di un errore. */}
              <YStack backgroundColor={brand.cianografiaVelo} borderRadius="$10" paddingHorizontal="$2" paddingVertical={2}>
                <Text fontSize={11} fontWeight="700" color={brand.cianografia}>
                  In arrivo
                </Text>
              </YStack>
            </XStack>
            <Text color={brand.grafite70} fontSize="$3">
              {option.description}
            </Text>
            <Text fontWeight="700" color={brand.grafite}>
              €{option.priceEur.toFixed(2)}
            </Text>
            <Text fontSize="$2" color={brand.grafite70}>
              Ti avviseremo appena gli acquisti in piattaforma saranno attivi.
            </Text>
          </Surface>
        ))}
      </YStack>
    </YStack>
  );
}
