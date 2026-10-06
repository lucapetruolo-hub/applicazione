"use client";

import { useState } from "react";
import { Text, XStack, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";

/**
 * Avviso sotto l'intestazione finché l'email non è confermata
 * (docs/CHANGELOG.md §174). Compare solo quando l'API richiede davvero la
 * conferma (`EMAIL_VERIFICATION_REQUIRED=true` su Render): prima che il
 * dominio d'invio sia verificato su Resend, il link non arriverebbe.
 */
export function EmailVerificationBanner() {
  const { user, token } = useAuth();
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");

  if (!user || !token || user.emailVerified || !user.emailVerificationRequired) return null;

  const resend = async () => {
    setState("sending");
    try {
      await apiClient.resendVerificationEmail(token);
      setState("sent");
    } catch {
      setState("error");
    }
  };

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
      <Text fontSize="$3" color={brand.grafite} textAlign="center">
        Conferma il tuo indirizzo email: ti abbiamo mandato un link a <Text fontWeight="700">{user.email}</Text>.
      </Text>
      {state === "sent" ? (
        <Text fontSize="$3" color={brand.cianografiaScuro} fontWeight="700">
          Link rispedito.
        </Text>
      ) : (
        <button
          type="button"
          onClick={resend}
          disabled={state === "sending"}
          style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: brand.cianografiaScuro, fontWeight: 700, textDecoration: "underline", font: "inherit" }}
        >
          {state === "sending" ? "Invio..." : state === "error" ? "Invio non riuscito, riprova" : "Rispedisci il link"}
        </button>
      )}
    </XStack>
  );
}
