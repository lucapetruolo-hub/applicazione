import type { ReactNode } from "react";
import { H1, Paragraph, Text, XStack, YStack } from "tamagui";
import { SearchBar, type SearchBarProps } from "./SearchBar";

export type HeroProps = SearchBarProps & {
  title: string;
  subtitle: string;
  extra?: ReactNode;
  /** Callback per il tab "Richiesta urgente" — la navigazione la gestisce chi consuma il componente (web/mobile hanno router diversi). */
  onUrgentPress?: () => void;
  /** Callback per il tab "Preventivo gratuito". */
  onQuotePress?: () => void;
};

export function Hero({ title, subtitle, extra, onUrgentPress, onQuotePress, ...searchProps }: HeroProps) {
  return (
    <YStack
      width="100%"
      paddingVertical="$9"
      paddingHorizontal="$4"
      backgroundColor="$blue2"
      alignItems="center"
      gap="$5"
    >
      <YStack maxWidth={640} alignItems="center" gap="$2">
        <H1 textAlign="center" size="$10">
          {title}
        </H1>
        <Paragraph textAlign="center" color="$color10" size="$5">
          {subtitle}
        </Paragraph>
      </YStack>

      <YStack width="100%" maxWidth={680} gap="$3">
        <XStack gap="$2" flexWrap="wrap" justifyContent="center">
          <XStack paddingHorizontal="$3" paddingVertical="$2" borderRadius="$10" backgroundColor="$blue10">
            <Text fontSize="$3" fontWeight="600" color="white">
              🔍 Trova un professionista
            </Text>
          </XStack>
          <XStack
            paddingHorizontal="$3"
            paddingVertical="$2"
            borderRadius="$10"
            backgroundColor="white"
            pressStyle={{ backgroundColor: "$color3" }}
            cursor="pointer"
            onPress={onUrgentPress}
          >
            <Text fontSize="$3" fontWeight="600" color="$color12">
              ⚡ Richiesta urgente
            </Text>
          </XStack>
          <XStack
            paddingHorizontal="$3"
            paddingVertical="$2"
            borderRadius="$10"
            backgroundColor="white"
            pressStyle={{ backgroundColor: "$color3" }}
            cursor="pointer"
            onPress={onQuotePress}
          >
            <Text fontSize="$3" fontWeight="600" color="$color12">
              📋 Preventivo gratuito
            </Text>
          </XStack>
        </XStack>

        <SearchBar {...searchProps} />
      </YStack>
      {extra}
    </YStack>
  );
}
