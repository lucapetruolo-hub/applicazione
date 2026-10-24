import { Text, XStack, YStack } from "tamagui";
import { brand } from "./tokens";

/**
 * "La riga del preventivo", il segno grafico del sito (docs/CHANGELOG.md
 * §304-§305): voce a sinistra, puntini di guida, prezzo a destra con le cifre
 * a larghezza fissa, in colonna. Un prezzo senza cifre ("Su richiesta") resta
 * nel carattere del testo: in quello a larghezza fissa sembrava scritto a
 * macchina.
 */
export function PriceLine({ label, price, labelColor = brand.grafite70 }: { label: string; price: string; labelColor?: string }) {
  const isAmount = /\d/.test(price);
  return (
    <XStack alignItems="flex-end" gap="$2" paddingVertical={3}>
      <Text fontSize={16} color={labelColor} flexShrink={1}>
        {label}
      </Text>
      <YStack flex={1} minWidth={12} marginBottom={6} borderBottomWidth={2} borderStyle="dotted" borderColor="#B9A58C" aria-hidden />
      <Text
        fontFamily={isAmount ? "$mono" : "$body"}
        fontSize={isAmount ? 15 : 16}
        fontWeight={isAmount ? "500" : "600"}
        color={brand.grafite}
        flexShrink={0}
        numberOfLines={1}
      >
        {price}
      </Text>
    </XStack>
  );
}
