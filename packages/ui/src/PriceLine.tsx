import { Text, XStack, YStack } from "tamagui";
import { brand } from "./tokens";

/**
 * Riga di un prezzo (docs/CHANGELOG.md §305-§306): voce a sinistra, prezzo a
 * destra con le cifre a larghezza fissa, in colonna. Senza puntini di guida
 * in mezzo, tolti su richiesta dell'utente (§316). Un prezzo senza cifre ("Su richiesta") resta
 * nel carattere del testo: in quello a larghezza fissa sembrava scritto a
 * macchina.
 */
export function PriceLine({ label, price, labelColor = brand.grafite70 }: { label: string; price: string; labelColor?: string }) {
  const isAmount = /\d/.test(price);
  return (
    <XStack alignItems="flex-start" gap="$3" paddingVertical={3}>
      <Text fontSize={16} color={labelColor} flexShrink={1}>
        {label}
      </Text>
      <YStack flex={1} minWidth={12} />
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
