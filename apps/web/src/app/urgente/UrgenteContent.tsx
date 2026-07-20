"use client";

import { Suspense } from "react";
import { Text, YStack } from "@professionisti/ui";
import { GuidedRequestForm } from "@/components/GuidedRequestForm";

export function UrgenteContent() {
  return (
    <YStack width="100%" alignItems="center">
      <YStack width="100%" backgroundColor="$red2" paddingVertical="$4" alignItems="center">
        <Text fontSize="$4" color="$red11" fontWeight="600">
          🔴 Richiesta urgente: notifichiamo subito i professionisti disponibili ora nella tua zona
        </Text>
      </YStack>
      <Suspense fallback={null}>
        <GuidedRequestForm
          isUrgent
          basePath="/urgente"
          title="Richiesta urgente"
          subtitle="Per emergenze che non possono aspettare: la richiesta viene inviata subito ai professionisti disponibili ora in zona."
          submitLabel="Invia richiesta urgente"
          submittingLabel="Invio in corso..."
          descriptionPlaceholder="Es. Allagamento in cucina, serve un intervento immediato."
        />
      </Suspense>
    </YStack>
  );
}
