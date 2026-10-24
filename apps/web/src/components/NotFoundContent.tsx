"use client";

import Link from "next/link";
import { Button, Icon, Text, XStack, YStack, brand } from "@professionisti/ui";
import { PopularServicesLinks } from "@/components/PopularServicesLinks";

/**
 * Contenuto della pagina "non trovata" (app/not-found.tsx): la home, la
 * ricerca e i servizi più richiesti, così chi arriva da un link vecchio non
 * resta senza via d'uscita.
 */
export function NotFoundContent() {
  return (
    <YStack width="100%" alignItems="center" backgroundColor="transparent" paddingTop="$9" paddingHorizontal="$4">
      <YStack width="100%" maxWidth={560} alignItems="center" gap="$4">
        <YStack width={64} height={64} borderRadius={32} backgroundColor={brand.cianografiaVelo} alignItems="center" justifyContent="center">
          <Icon name="search" size={28} color={brand.cianografiaScuro} strokeWidth={1.75} />
        </YStack>
        <YStack gap="$2" alignItems="center">
          <Text tag="h1" margin={0} fontFamily="$heading" fontWeight="800" fontSize="$9" color={brand.grafite} textAlign="center" style={{ textWrap: "balance" }}>
            Pagina non trovata
          </Text>
          <Text fontSize="$4" lineHeight={26} color={brand.grafite70} textAlign="center" style={{ textWrap: "balance" }}>
            Il link potrebbe essere sbagliato, oppure la pagina non c&apos;è più.
          </Text>
        </YStack>
        <XStack gap="$3" flexWrap="wrap" justifyContent="center">
          <Link href="/cerca" style={{ textDecoration: "none" }}>
            <Button variant="primary">Cerca un professionista</Button>
          </Link>
          <Link href="/" style={{ textDecoration: "none" }}>
            <Button variant="secondary">Torna alla home</Button>
          </Link>
        </XStack>
      </YStack>
      <div className="not-found-services">
        <PopularServicesLinks order={[]} />
      </div>
    </YStack>
  );
}
