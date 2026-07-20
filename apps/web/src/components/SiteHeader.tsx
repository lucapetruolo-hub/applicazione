"use client";

import Link from "next/link";
import { Text, XStack } from "@professionisti/ui";

export function SiteHeader() {
  return (
    <XStack
      width="100%"
      paddingVertical="$3"
      paddingHorizontal="$5"
      alignItems="center"
      justifyContent="space-between"
      borderBottomWidth={1}
      borderBottomColor="$borderColor"
      backgroundColor="white"
    >
      <Link href="/" style={{ textDecoration: "none" }}>
        <Text fontSize="$6" fontWeight="800" color="$blue10">
          🛠️ Professionisti
        </Text>
      </Link>
      <XStack gap="$5" alignItems="center">
        <Link href="/per-professionisti" style={{ textDecoration: "none" }}>
          <Text fontSize="$3" color="$color12">
            Per i professionisti
          </Text>
        </Link>
        <Link href="/accedi" style={{ textDecoration: "none" }}>
          <Text fontSize="$3" fontWeight="600" color="$blue10">
            Accedi
          </Text>
        </Link>
      </XStack>
    </XStack>
  );
}
