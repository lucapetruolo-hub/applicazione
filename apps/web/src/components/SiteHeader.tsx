"use client";

import Link from "next/link";
import { Button, Text, XStack } from "@professionisti/ui";
import { useAuth } from "@/lib/AuthContext";

export function SiteHeader() {
  const { user, isLoading, logout } = useAuth();

  return (
    <XStack
      width="100%"
      paddingVertical="$3"
      paddingHorizontal="$4"
      $gtSm={{ paddingHorizontal: "$5" }}
      alignItems="center"
      justifyContent="space-between"
      borderBottomWidth={1}
      borderBottomColor="$borderColor"
      backgroundColor="white"
    >
      <Link href="/" style={{ textDecoration: "none" }}>
        <Text fontSize="$5" $gtSm={{ fontSize: "$6" }} fontWeight="800" color="$blue10">
          🛠️ Professionisti
        </Text>
      </Link>
      <XStack gap="$4" alignItems="center">
        {isLoading ? null : user ? (
          <>
            <Text fontSize="$3" color="$color11">
              {user.name ?? user.phone ?? user.email}
            </Text>
            <Text
              fontSize="$3"
              fontWeight="600"
              color="$blue10"
              cursor="pointer"
              onPress={logout}
              accessibilityRole="button"
              accessibilityLabel="Esci dal tuo account"
            >
              Esci
            </Text>
          </>
        ) : (
          <Link href="/accedi" style={{ textDecoration: "none" }}>
            <Text fontSize="$3" fontWeight="600" color="$blue10">
              Accedi
            </Text>
          </Link>
        )}
        <Link href="/per-professionisti" style={{ textDecoration: "none" }}>
          <Button size="$3">Sei un professionista?</Button>
        </Link>
      </XStack>
    </XStack>
  );
}
