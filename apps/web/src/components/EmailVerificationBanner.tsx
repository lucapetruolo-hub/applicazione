"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Text, XStack, brand } from "@professionisti/ui";
import { useAuth } from "@/lib/AuthContext";

/**
 * Avviso sotto l'intestazione finché l'email non è confermata
 * (docs/CHANGELOG.md §178). Compare solo quando l'API richiede davvero la
 * conferma (`EMAIL_VERIFICATION_REQUIRED=true` su Render): prima che il
 * dominio d'invio sia verificato su Resend, l'email non arriverebbe. Porta a
 * /conferma-email, dove si scrive il codice di 6 cifre o se ne chiede uno
 * nuovo (§243); nascosto dove il codice è già sullo schermo.
 */
export function EmailVerificationBanner() {
  const { user, token } = useAuth();
  const pathname = usePathname();

  // Solo professionisti: al cliente la conferma è facoltativa (ClientEmailVerificationCard in /account).
  if (!user || !token || !user.isProfessional || user.emailVerified || !user.emailVerificationRequired) return null;
  if (pathname === "/conferma-email" || pathname === "/registrati") return null;

  return (
    <XStack
      role="status"
      backgroundColor={brand.cianografiaVelo}
      paddingVertical="$2"
      paddingHorizontal="$4"
      gap="$2"
      flexWrap="wrap"
      justifyContent="center"
      alignItems="center"
    >
      <Text fontSize={16} color={brand.grafite} textAlign="center">
        Conferma la tua email per salvare il profilo e inviare preventivi: ti abbiamo mandato un codice a <Text fontWeight="700">{user.email}</Text>.
      </Text>
      <Link href="/conferma-email" style={{ color: brand.cianografiaScuro, fontWeight: 700, textDecoration: "underline" }}>
        Inserisci il codice
      </Link>
    </XStack>
  );
}
