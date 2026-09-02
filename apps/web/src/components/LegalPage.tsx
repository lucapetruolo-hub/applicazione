"use client";

import type { ReactNode } from "react";
import { Text, YStack, brand } from "@professionisti/ui";

type LegalSection = { heading: string; body: ReactNode };

/**
 * Layout condiviso delle pagine legali (Privacy, Termini, Cookie) — testo
 * leggibile su colonna stretta, stesso stile tipografico del resto del
 * sito. I contenuti sono bozze standard post-audit: da far verificare a un
 * legale e da completare con i dati reali del titolare (ragione sociale,
 * P.IVA, sede, email privacy) prima del lancio definitivo — i segnaposto
 * [DA COMPILARE] rendono evidente dove intervenire.
 */
export function LegalPage({ title, updatedAt, sections }: { title: string; updatedAt: string; sections: LegalSection[] }) {
  return (
    <YStack width="100%" alignItems="center" backgroundColor={brand.gesso} paddingVertical="$9" paddingHorizontal="$4">
      <YStack width="100%" maxWidth={720} gap="$5">
        <YStack gap="$2">
          <Text fontFamily="$heading" fontWeight="800" fontSize="$9" color={brand.grafite}>
            {title}
          </Text>
          <Text fontSize="$2" color={brand.grafite70}>
            Ultimo aggiornamento: {updatedAt}
          </Text>
        </YStack>
        {sections.map((section) => (
          <YStack key={section.heading} gap="$2">
            <Text fontFamily="$heading" fontWeight="700" fontSize="$6" color={brand.grafite}>
              {section.heading}
            </Text>
            <Text fontSize="$3" color={brand.grafite70} lineHeight={24}>
              {section.body}
            </Text>
          </YStack>
        ))}
      </YStack>
    </YStack>
  );
}
