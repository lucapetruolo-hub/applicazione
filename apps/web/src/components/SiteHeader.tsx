"use client";

import Link from "next/link";
import { Button, Logo, Text, XStack } from "@professionisti/ui";
import { useAuth } from "@/lib/AuthContext";
import { AccountMenu } from "./AccountMenu";

export function SiteHeader() {
  const { user, isLoading } = useAuth();

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
        <Logo size={26} />
      </Link>
      <XStack gap="$4" alignItems="center">
        {isLoading ? null : user ? (
          <AccountMenu />
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
