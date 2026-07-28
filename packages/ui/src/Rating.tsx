import { Text, XStack } from "tamagui";
import { Icon } from "./Icon";
import { brand } from "./tokens";

export type RatingProps = {
  value: number;
  count?: number;
  size?: number;
};

/**
 * Stelle proporzionali al voto medio (arrotondate alla stella più vicina —
 * a differenza di apps/web/src/components/StarRating.tsx, che usa una
 * tecnica di ritaglio CSS web-only per il riempimento frazionario esatto e
 * resta lì per quello; questa versione è cross-platform, quindi rinuncia al
 * mezzo-riempimento pixel-perfect per restare portabile su React Native)
 * + valore numerico in mono + conteggio recensioni tra parentesi — brief §3.
 */
export function Rating({ value, count, size = 16 }: RatingProps) {
  return (
    <XStack alignItems="center" gap="$2">
      <XStack gap={2}>
        {[1, 2, 3, 4, 5].map((position) => (
          <Icon
            key={position}
            name="star"
            size={size}
            color={position <= Math.round(value) ? brand.ottone : brand.filetto}
            fill={position <= Math.round(value) ? brand.ottone : "none"}
          />
        ))}
      </XStack>
      <Text fontFamily="$mono" fontSize={13} fontWeight="500" color={brand.grafite}>
        {value.toFixed(1)}
      </Text>
      {count !== undefined ? (
        <Text fontSize={13} color={brand.grafite70}>
          ({count} recension{count === 1 ? "e" : "i"})
        </Text>
      ) : null}
    </XStack>
  );
}
