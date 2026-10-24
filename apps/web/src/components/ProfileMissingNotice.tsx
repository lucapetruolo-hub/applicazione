"use client";

import Link from "next/link";
import { Button, Text, YStack, brand } from "@professionisti/ui";

/**
 * L'API risponde 404 "Completa prima il tuo profilo" finché il professionista
 * non ha nome attività, categoria e città: è un passo da fare, non un errore.
 * Prima Abbonamento, Dati fiscali e Richieste mostravano "Non riusciamo a
 * caricare… Riprova" a chi si era appena iscritto (docs/CHANGELOG.md §305).
 */
export function isProfileMissingError(err: unknown): boolean {
  return err instanceof Error && err.message.toLowerCase().includes("profilo");
}

export function ProfileMissingNotice({ text }: { text: string }) {
  return (
    <YStack width="100%" alignItems="center" paddingVertical="$9" paddingHorizontal="$4">
      <YStack width="100%" maxWidth={480} gap="$4" alignItems="center">
        <Text fontFamily="$heading" fontWeight="700" fontSize="$7" color={brand.grafite} textAlign="center">
          Completa il tuo profilo per iniziare
        </Text>
        <Text color={brand.grafite70} textAlign="center">
          {text}
        </Text>
        <Link href="/dashboard/profilo" style={{ textDecoration: "none" }}>
          <Button variant="primary">Completa profilo</Button>
        </Link>
      </YStack>
    </YStack>
  );
}
