import type { ReactNode } from "react";
import { Card, Text, XStack, YStack } from "tamagui";

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
  /** Indirizzo del negozio/laboratorio, se il professionista lo ha indicato. */
  address?: string | null;
  rating?: number;
  verified?: boolean;
  remoteAvailable?: boolean;
  /** Prestazioni offerte con prezzo facoltativo, mostrate sotto l'indirizzo. */
  services?: ProfessionalCardService[];
  onPress?: () => void;
  /** Slot opzionale per un'icona/badge categoria (passato da chi consuma il componente, così l'icona custom resta web-only senza sporcare packages/ui). */
  icon?: ReactNode;
};

export function ProfessionalCard({
  businessName,
  categoryLabel,
  city,
  address,
  rating,
  verified,
  remoteAvailable,
  services,
  onPress,
  icon,
}: ProfessionalCardProps) {
  return (
    <Card
      elevate
      bordered
      padding="$4"
      onPress={onPress}
      cursor={onPress ? "pointer" : undefined}
      animation="quick"
      scale={1}
      y={0}
      hoverStyle={onPress ? { scale: 1.02, y: -3, borderColor: "$blue8" } : undefined}
      pressStyle={{ scale: 0.98, y: 0 }}
    >
      <XStack gap="$3" alignItems="flex-start">
        {icon}
        <YStack gap="$1" flex={1}>
          <XStack justifyContent="space-between" alignItems="center">
            <Text fontSize="$5" fontWeight="600">
              {businessName}
            </Text>
            {verified ? (
              <Text fontSize="$2" color="$blue10">
                Verificato
              </Text>
            ) : null}
          </XStack>
          <Text fontSize="$3" color="$color10">
            {categoryLabel} · {city}
          </Text>
          {address ? (
            <Text fontSize="$2" color="$color10">
              📍 {address}
            </Text>
          ) : null}
          <XStack gap="$2" alignItems="center">
            {rating !== undefined ? <Text fontSize="$3">⭐ {rating.toFixed(1)}</Text> : null}
            {remoteAvailable ? (
              <Text fontSize="$2" color="$purple10" fontWeight="600">
                📹 Online
              </Text>
            ) : null}
          </XStack>
          {services && services.length > 0 ? (
            <YStack gap="$1" paddingTop="$1">
              {services.slice(0, 3).map((service) => (
                <XStack key={service.id} justifyContent="space-between" gap="$2">
                  <Text fontSize="$2" color="$color11" flex={1}>
                    {service.name}
                  </Text>
                  <Text fontSize="$2" color="$color11" fontWeight="600">
                    {formatServicePrice(service.priceMinEurCents, service.priceMaxEurCents)}
                  </Text>
                </XStack>
              ))}
            </YStack>
          ) : null}
        </YStack>
      </XStack>
    </Card>
  );
}
