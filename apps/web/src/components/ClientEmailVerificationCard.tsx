"use client";

import { useState } from "react";
import { Button, Surface, Text, YStack, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";

/**
 * Conferma email facoltativa per il cliente (decisione dell'utente,
 * docs/CHANGELOG.md §178): nessun blocco, solo un invito in /account. Chi
 * conferma compare ai professionisti con "Email confermata" sulla
 * richiesta, il motivo per cui il riquadro parla di più affidabilità.
 */
export function ClientEmailVerificationCard() {
  const { user, token } = useAuth();
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");

  if (!user || !token || user.isProfessional || user.emailVerified || !user.email) return null;

  const send = async () => {
    setState("sending");
    try {
      await apiClient.resendVerificationEmail(token);
      setState("sent");
    } catch {
      setState("error");
    }
  };

  return (
    <Surface gap="$3" borderLeftWidth={4} borderLeftColor={brand.cianografia} role="status">
      <YStack gap="$1">
        <Text fontFamily="$heading" fontWeight="800" fontSize="$6" color={brand.grafite}>
          Conferma la tua email
        </Text>
        <Text color={brand.grafite70}>
          Confermando l&apos;email sarai considerato un cliente più affidabile: i professionisti vedranno &quot;Email
          confermata&quot; sulle tue richieste e avrai più possibilità di ricevere preventivi.
        </Text>
      </YStack>
      {state === "sent" ? (
        <Text color={brand.cianografiaScuro} fontWeight="700">
          Ti abbiamo mandato un link a {user.email}: aprilo per confermare.
        </Text>
      ) : (
        <YStack gap="$2" alignItems="flex-start">
          <Button variant="primary" onPress={send} disabled={state === "sending"} opacity={state === "sending" ? 0.6 : 1}>
            {state === "sending" ? "Invio..." : "Mandami il link di conferma"}
          </Button>
          {state === "error" ? (
            <Text color={brand.urgenza} fontSize="$3">
              Invio non riuscito, riprova tra qualche minuto.
            </Text>
          ) : null}
        </YStack>
      )}
    </Surface>
  );
}
