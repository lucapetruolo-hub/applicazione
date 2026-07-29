"use client";

import { Suspense } from "react";
import { Icon, Text, XStack, YStack, brand } from "@professionisti/ui";
import { GuidedRequestForm } from "@/components/GuidedRequestForm";

export function UrgenteContent() {
  return (
    <YStack width="100%" alignItems="center">
      <YStack width="100%" backgroundColor="#FBEAE8" paddingVertical="$4" alignItems="center">
        <XStack alignItems="center" gap="$2" paddingHorizontal="$4">
          <Icon name="zap" size={16} strokeWidth={2} color={brand.urgenza} fill={brand.urgenza} />
          <Text fontSize="$4" color={brand.urgenza} fontWeight="600">
            Richiesta urgente: notifichiamo subito i professionisti disponibili ora nella tua zona
          </Text>
        </XStack>
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
