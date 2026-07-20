"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { ClientGuidedRequest } from "@professionisti/api-client";
import { H1, H2, Paragraph, Text, YStack } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";

const STATUS_LABEL: Record<ClientGuidedRequest["status"], string> = {
  OPEN: "In attesa di risposte",
  MATCHED: "Inviata ai professionisti",
  CLOSED: "Chiusa",
};

export default function LeMieRichiestePage() {
  const { user, token, isLoading } = useAuth();
  const [requests, setRequests] = useState<ClientGuidedRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    apiClient
      .myGuidedRequests(token)
      .then(setRequests)
      .catch((err) => setError(err instanceof Error ? err.message : "Errore nel caricamento delle richieste."));
  }, [token]);

  if (isLoading) return null;

  if (!user || !token) {
    return (
      <YStack width="100%" alignItems="center" paddingVertical="$9" paddingHorizontal="$4">
        <YStack width="100%" maxWidth={480} gap="$4" alignItems="center">
          <H1 size="$7" textAlign="center">
            Accedi per vedere le tue richieste
          </H1>
          <Link href="/accedi?redirect=/le-mie-richieste" style={{ textDecoration: "none" }}>
            <Text color="$blue10" fontWeight="600">
              Vai al login
            </Text>
          </Link>
        </YStack>
      </YStack>
    );
  }

  return (
    <YStack width="100%" alignItems="center" paddingVertical="$8" paddingHorizontal="$4">
      <YStack width="100%" maxWidth={720} gap="$5">
        <H1 size="$8">Le mie richieste</H1>

        {error ? <Text color="$red10">{error}</Text> : null}

        {requests === null ? (
          <Text color="$color9">Caricamento...</Text>
        ) : requests.length === 0 ? (
          <YStack gap="$3">
            <Paragraph color="$color10">Non hai ancora inviato nessuna richiesta di preventivo.</Paragraph>
            <Link href="/preventivo" style={{ textDecoration: "none" }}>
              <Text color="$blue10" fontWeight="600">
                Richiedi il tuo primo preventivo
              </Text>
            </Link>
          </YStack>
        ) : (
          requests.map((request) => (
            <YStack key={request.id} borderWidth={1} borderColor="$borderColor" borderRadius="$5" padding="$4" gap="$3">
              <YStack flexDirection="row" justifyContent="space-between" alignItems="flex-start" flexWrap="wrap" gap="$2">
                <YStack gap="$1">
                  <Text fontWeight="700" fontSize="$5">
                    {request.categoryLabel} · {request.city}
                  </Text>
                  <Text color="$color10">{request.description}</Text>
                </YStack>
                <Text fontSize="$2" color="$blue10" fontWeight="600">
                  {STATUS_LABEL[request.status]}
                </Text>
              </YStack>

              {request.quotes.length > 0 ? (
                <YStack gap="$2" borderTopWidth={1} borderTopColor="$borderColor" paddingTop="$3">
                  <H2 size="$4">Preventivi ricevuti</H2>
                  {request.quotes.map((quote) => (
                    <YStack key={quote.id} backgroundColor="$color2" borderRadius="$4" padding="$3" gap="$1">
                      <Text fontWeight="600">{quote.businessName}</Text>
                      <Text color="$color10" fontSize="$3">
                        Manodopera: €{(quote.laborEurCents / 100).toFixed(2)} · Materiali: €
                        {(quote.materialsEurCents / 100).toFixed(2)}
                      </Text>
                      {quote.notes ? (
                        <Text color="$color10" fontSize="$3">
                          {quote.notes}
                        </Text>
                      ) : null}
                    </YStack>
                  ))}
                </YStack>
              ) : (
                <Text color="$color9" fontSize="$3">
                  Nessun preventivo ricevuto ancora.
                </Text>
              )}
            </YStack>
          ))
        )}
      </YStack>
    </YStack>
  );
}
