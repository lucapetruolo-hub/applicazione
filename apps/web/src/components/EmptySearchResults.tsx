"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Button, Text, XStack, YStack, brand } from "@professionisti/ui";

/**
 * Ricerca senza risultati (revisione UX, docs/CHANGELOG.md §271, testo
 * deciso da Luca): si può mandare lo stesso la richiesta, che resta aperta
 * e va al primo professionista compatibile che si iscrive; il cliente viene
 * avvisato in quel momento (notifica REQUEST_MATCHED_LATER).
 */
export function EmptySearchResults({
  title,
  online,
  categorySlug,
  city,
  icon,
}: {
  title: string;
  online: boolean;
  categorySlug?: string;
  city?: string;
  icon?: ReactNode;
}) {
  const params = new URLSearchParams();
  if (categorySlug) params.set("categoria", categorySlug);
  if (city) params.set("citta", city);
  if (online) params.set("modalita", "ONLINE");
  const query = params.toString();
  const href = query ? `/preventivo?${query}` : "/preventivo";

  return (
    <YStack gap="$3" backgroundColor={brand.calce} borderWidth={1} borderColor={brand.filetto} borderRadius="$4" padding="$4">
      <XStack alignItems="center" gap="$3">
        {icon}
        <YStack gap="$1" flex={1} minWidth={0}>
          <Text fontFamily="$heading" fontWeight="800" fontSize="$6" color={brand.grafite}>
            {title}
          </Text>
          <Text color={brand.grafite70} fontSize={16}>
            {online ? "Per ora nessuno offre consulenza online qui." : "Per ora non ci sono professionisti in questa zona."} Invia
            lo stesso la richiesta: ti avvisiamo appena ce n'è uno compatibile.
          </Text>
        </YStack>
      </XStack>
      <Link href={href} style={{ textDecoration: "none", alignSelf: "flex-start" }}>
        <Button variant="primary">Invia la richiesta</Button>
      </Link>
    </YStack>
  );
}
