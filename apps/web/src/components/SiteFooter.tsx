"use client";

import Link from "next/link";
import { PROFESSIONAL_CATEGORIES } from "@professionisti/shared";
import { Text, XStack, YStack } from "@professionisti/ui";

export function SiteFooter() {
  return (
    <YStack
      width="100%"
      backgroundColor="$color2"
      paddingVertical="$8"
      paddingHorizontal="$5"
      gap="$6"
      borderTopWidth={1}
      borderTopColor="$borderColor"
    >
      <XStack flexWrap="wrap" gap="$8" justifyContent="space-between">
        <YStack gap="$2" maxWidth={280}>
          <Text fontSize="$5" fontWeight="800" color="$blue10">
            🛠️ Professionisti
          </Text>
          <Text fontSize="$3" color="$color10">
            Trova e prenota professionisti verificati per la casa: idraulici, elettricisti, imbianchini e altro,
            vicino a te.
          </Text>
        </YStack>

        <YStack gap="$2">
          <Text fontSize="$3" fontWeight="700">
            Categorie
          </Text>
          {PROFESSIONAL_CATEGORIES.slice(0, 6).map((category) => (
            <Link key={category.slug} href={`/cerca/${category.slug}`} style={{ textDecoration: "none" }}>
              <Text fontSize="$3" color="$color10">
                {category.label}
              </Text>
            </Link>
          ))}
        </YStack>

        <YStack gap="$2">
          <Text fontSize="$3" fontWeight="700">
            Azienda
          </Text>
          <Link href="/per-professionisti" style={{ textDecoration: "none" }}>
            <Text fontSize="$3" color="$color10">
              Per i professionisti
            </Text>
          </Link>
          <Link href="/accedi" style={{ textDecoration: "none" }}>
            <Text fontSize="$3" color="$color10">
              Accedi
            </Text>
          </Link>
        </YStack>
      </XStack>

      <Text fontSize="$2" color="$color9">
        © {new Date().getFullYear()} Professionisti. Tutti i diritti riservati.
      </Text>
    </YStack>
  );
}
