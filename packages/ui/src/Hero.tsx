import type { ReactNode } from "react";
import { H1, Paragraph, Text, XStack, YStack } from "tamagui";
import { Icon } from "./Icon";
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

// Macchie decorative soffuse: solo View + opacity + borderRadius (nessun
// filtro CSS, nessuna libreria di gradienti) così restano rese in modo
// identico su web (react-native-web) e nativo (Expo), coerente con
// CLAUDE.md — packages/ui è condiviso da web e mobile.
function DecorativeBlobs() {
  return (
    <YStack position="absolute" top={0} left={0} right={0} bottom={0} overflow="hidden">
      <YStack position="absolute" top={-120} left={-80} width={320} height={320} borderRadius={320} backgroundColor="$blue7" opacity={0.35} />
      <YStack position="absolute" top={-60} right={-100} width={280} height={280} borderRadius={280} backgroundColor="$purple7" opacity={0.25} />
      <YStack position="absolute" bottom={-140} left="35%" width={260} height={260} borderRadius={260} backgroundColor="$yellow7" opacity={0.2} />
    </YStack>
  );
}

export function Hero({ title, subtitle, extra, onUrgentPress, onQuotePress, ...searchProps }: HeroProps) {
  return (
    <YStack
      width="100%"
      paddingVertical="$9"
      paddingHorizontal="$4"
      backgroundColor="$blue2"
      alignItems="center"
      gap="$5"
      position="relative"
    >
      <DecorativeBlobs />

      <YStack maxWidth={640} alignItems="center" gap="$2" zIndex={1}>
        <H1 textAlign="center" size="$10">
          {title}
        </H1>
        <Paragraph textAlign="center" color="$color10" size="$5">
          {subtitle}
        </Paragraph>
      </YStack>

      <YStack width="100%" maxWidth={680} gap="$3" zIndex={1}>
        <XStack gap="$2" flexWrap="wrap" justifyContent="center">
          <XStack paddingHorizontal="$3" paddingVertical="$2" borderRadius="$10" backgroundColor="$blue10" alignItems="center" gap="$2">
            <Icon name="search" size={16} color="white" />
            <Text fontSize="$3" fontWeight="600" color="white">
              Trova un professionista
            </Text>
          </XStack>
          <XStack
            paddingHorizontal="$3"
            paddingVertical="$2"
            borderRadius="$10"
            backgroundColor="white"
            animation="quick"
            scale={1}
            hoverStyle={{ scale: 1.05, backgroundColor: "$color2" }}
            pressStyle={{ scale: 0.97, backgroundColor: "$color3" }}
            cursor="pointer"
            alignItems="center"
            gap="$2"
            onPress={onUrgentPress}
          >
            <Icon name="zap" size={16} />
            <Text fontSize="$3" fontWeight="600" color="$color12">
              Richiesta urgente
            </Text>
          </XStack>
          <XStack
            paddingHorizontal="$3"
            paddingVertical="$2"
            borderRadius="$10"
            backgroundColor="white"
            animation="quick"
            scale={1}
            hoverStyle={{ scale: 1.05, backgroundColor: "$color2" }}
            pressStyle={{ scale: 0.97, backgroundColor: "$color3" }}
            cursor="pointer"
            alignItems="center"
            gap="$2"
            onPress={onQuotePress}
          >
            <Icon name="file-text" size={16} />
            <Text fontSize="$3" fontWeight="600" color="$color12">
              Preventivo gratuito
            </Text>
          </XStack>
        </XStack>

        <SearchBar {...searchProps} />
      </YStack>
      {extra ? (
        <YStack zIndex={1} width="100%" alignItems="center">
          {extra}
        </YStack>
      ) : null}
    </YStack>
  );
}
