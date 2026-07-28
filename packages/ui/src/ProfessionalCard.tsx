import type { ReactNode } from "react";
import { Text, XStack, YStack } from "tamagui";
import { Badge } from "./Badge";
import { Icon } from "./Icon";
import { Rating } from "./Rating";
import { Surface } from "./Surface";
import { brand } from "./tokens";

export type ProfessionalCardService = {
  id: string;
  name: string;
  priceMinEurCents: number | null;
  priceMaxEurCents: number | null;
};

// Duplicata (non importata da @professionisti/shared): packages/ui non
// dipende dal resto del monorepo, resta un design system consumabile da solo
// — vedi formatServicePriceRange in packages/shared/src/professionals.ts per
// la stessa logica lato pagina profilo pubblica.
function formatServicePrice(priceMinEurCents: number | null, priceMaxEurCents: number | null): string {
  const format = (cents: number) => `${(cents / 100).toFixed(2)} €`;
  if (priceMinEurCents !== null && priceMaxEurCents !== null && priceMaxEurCents > priceMinEurCents) {
    return `${format(priceMinEurCents)} - ${format(priceMaxEurCents)}`;
  }
  const single = priceMinEurCents ?? priceMaxEurCents;
  return single !== null ? format(single) : "Su richiesta";
}

export type ProfessionalCardProps = {
  businessName: string;
  categoryLabel: string;
  city: string;
  rating?: number;
  reviewCount?: number;
  verified?: boolean;
  remoteAvailable?: boolean;
  /** Prestazioni offerte con prezzo facoltativo, mostrate sotto categoria/città. */
  services?: ProfessionalCardService[];
  onPress?: () => void;
  /** Slot opzionale per un'icona/badge categoria (passato da chi consuma il componente, così l'icona custom resta web-only senza sporcare packages/ui). */
  icon?: ReactNode;
};

export function ProfessionalCard({
  businessName,
  categoryLabel,
  city,
  rating,
  reviewCount,
  verified,
  remoteAvailable,
  services,
  onPress,
  icon,
}: ProfessionalCardProps) {
  return (
    <Surface
      onPress={onPress}
      cursor={onPress ? "pointer" : undefined}
      padding="$4"
      hoverStyle={onPress ? { borderColor: brand.cianografia } : undefined}
      pressStyle={onPress ? { borderColor: brand.cianografiaScuro } : undefined}
    >
      <XStack gap="$3" alignItems="flex-start">
        {icon}
        <YStack gap="$2" flex={1}>
          <XStack justifyContent="space-between" alignItems="center" gap="$2">
            <Text fontFamily="$heading" fontWeight="700" fontSize="$5" color={brand.grafite}>
              {businessName}
            </Text>
            {verified ? <Badge variant="verificato">Verificato</Badge> : null}
          </XStack>
          <Text fontFamily="$mono" fontSize={12} textTransform="uppercase" color={brand.grafite70}>
            {categoryLabel} · {city}
          </Text>
          <XStack gap="$3" alignItems="center" flexWrap="wrap">
            {rating !== undefined ? <Rating value={rating} count={reviewCount} size={13} /> : null}
            {remoteAvailable ? (
              <XStack gap="$1" alignItems="center">
                <Icon name="video" size={13} color={brand.cianografia} strokeWidth={1.5} />
                <Text fontFamily="$mono" fontSize={11} textTransform="uppercase" color={brand.cianografia} fontWeight="600">
                  Online
                </Text>
              </XStack>
            ) : null}
          </XStack>
          {services && services.length > 0 ? (
            <YStack gap="$1" paddingTop="$1" borderTopWidth={1} borderTopColor={brand.filetto} marginTop="$1">
              {services.slice(0, 3).map((service) => (
                <XStack key={service.id} justifyContent="space-between" gap="$2">
                  <Text fontSize="$2" color={brand.grafite70} flex={1}>
                    {service.name}
                  </Text>
                  <Text fontSize="$2" color={brand.grafite} fontWeight="600">
                    {formatServicePrice(service.priceMinEurCents, service.priceMaxEurCents)}
                  </Text>
                </XStack>
              ))}
            </YStack>
          ) : null}
        </YStack>
      </XStack>
    </Surface>
  );
}
