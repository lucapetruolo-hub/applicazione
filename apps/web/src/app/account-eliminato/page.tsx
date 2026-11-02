import type { Metadata } from "next";
import Link from "next/link";
import { Button, Icon, Text, YStack, brand } from "@professionisti/ui";

export const metadata: Metadata = {
  title: "Account eliminato",
  robots: { index: false, follow: false },
};

/**
 * Conferma dopo "Elimina definitivamente" (collaudo B-01): prima si tornava
 * alla home senza nessun segno che l'account fosse stato chiuso.
 */
export default function AccountEliminatoPage() {
  return (
    <YStack width="100%" alignItems="center" paddingTop="$9" paddingHorizontal="$4">
      <YStack width="100%" maxWidth={560} alignItems="center" gap="$4">
        <YStack width={64} height={64} borderRadius={32} backgroundColor={brand.cianografiaVelo} alignItems="center" justifyContent="center">
          <Icon name="check" size={28} color={brand.cianografiaScuro} strokeWidth={1.75} />
        </YStack>
        <Text tag="h1" margin={0} fontFamily="$heading" fontWeight="800" fontSize="$9" color={brand.grafite} textAlign="center">
          Account eliminato
        </Text>
        <Text fontSize="$4" lineHeight={26} color={brand.grafite70} textAlign="center">
          Ti abbiamo mandato un&apos;email di conferma. Se avevi appuntamenti in programma li abbiamo annullati e abbiamo avvisato l&apos;altra persona.
        </Text>
        <Link href="/" style={{ textDecoration: "none" }}>
          <Button tabIndex={-1} variant="secondary">
            Torna alla home
          </Button>
        </Link>
      </YStack>
    </YStack>
  );
}
