"use client";

import { useState } from "react";
import { professionalPath } from "@professionisti/shared";
import { Icon, Text, YStack, brand } from "@professionisti/ui";
import { CardButton } from "@/components/CardButton";
import { SITE_URL } from "@/lib/siteUrl";

/**
 * "Consiglialo a un amico" dopo una recensione da 4 o 5 stelle
 * (docs/changelog/2026-11-09-passaparola.md, skill referrals): il cliente
 * condivide il profilo di chi ha fatto il lavoro, con la condivisione del
 * telefono o copiando il link. Nessun premio; si chiede dopo la recensione,
 * mai prima, così la recensione resta libera.
 */
export function RecommendProfessional({ professionalProfileId, businessName }: { professionalProfileId: string; businessName: string }) {
  const [copied, setCopied] = useState(false);
  const url = `${SITE_URL}${professionalPath({ id: professionalProfileId, businessName })}`;

  async function recommend() {
    const text = `Mi sono trovato bene con ${businessName}, te lo consiglio:`;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: businessName, text, url });
      } catch {
        // Condivisione chiusa: niente da fare.
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(`${text} ${url}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copia il link del profilo", url);
    }
  }

  return (
    <YStack gap="1" alignItems="flex-start">
      <Text fontSize={13} color={brand.grafite70}>
        Ti sei trovato bene? Consiglialo a chi ne ha bisogno.
      </Text>
      <CardButton icon={<Icon name="share-2" size={16} color={brand.grafite} strokeWidth={2} />} onPress={() => void recommend()}>
        {copied ? "Link copiato" : `Consiglia ${businessName}`}
      </CardButton>
    </YStack>
  );
}
