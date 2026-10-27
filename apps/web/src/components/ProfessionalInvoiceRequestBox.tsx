"use client";

import { useState } from "react";
import Link from "next/link";
import { Icon, Text, XStack, YStack, brand } from "@professionisti/ui";
import { clientInvoiceLines, type ClientInvoiceRequestView } from "@professionisti/shared";

/**
 * "Il cliente chiede la fattura" sulla scheda del lavoro del professionista
 * (decisione dell'utente del 27/10/2026, docs/CHANGELOG.md §372): i dati da
 * copiare nel suo programma delle fatture. La fattura la fa lui.
 */
export function ProfessionalInvoiceRequestBox({ request, courtesyHref }: { request: ClientInvoiceRequestView; courtesyHref?: string }) {
  const [copied, setCopied] = useState(false);
  const lines = clientInvoiceLines(request);

  async function copy() {
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      // Senza permesso agli appunti restano le righe da selezionare a mano.
    }
  }

  return (
    <YStack gap="$2" padding="$3" borderRadius={20} borderWidth={1} borderColor={brand.ottone} backgroundColor={brand.calce}>
      <XStack alignItems="center" gap="$2">
        <Icon name="receipt-text" size={18} strokeWidth={2} color={brand.ottone} />
        <Text fontSize={16} fontWeight="800" color={brand.grafite}>
          Il cliente chiede la fattura
        </Text>
      </XStack>
      <YStack gap={2}>
        {lines.map((line) => (
          <Text key={line} fontSize={16} color={brand.grafite} userSelect="text">
            {line}
          </Text>
        ))}
      </YStack>
      <XStack gap="$3" flexWrap="wrap" alignItems="center">
        <Text fontSize={16} fontWeight="700" color={brand.cianografiaScuro} textDecorationLine="underline" cursor="pointer" accessibilityRole="button" onPress={() => void copy()}>
          {copied ? "Copiati" : "Copia i dati"}
        </Text>
        {courtesyHref ? (
          <Link href={courtesyHref} style={{ color: brand.cianografiaScuro, fontWeight: 700, fontSize: 16 }}>
            Prepara la copia per il cliente
          </Link>
        ) : null}
      </XStack>
    </YStack>
  );
}
