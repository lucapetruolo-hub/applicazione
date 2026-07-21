"use client";

import { useRouter } from "next/navigation";
import type { ProfessionalSearchResult } from "@professionisti/shared";
import { H1, Paragraph, ProfessionalCard, YStack } from "@professionisti/ui";
import { CategoryIconBadge } from "@/components/CategoryIconBadge";

export function CercaContent({
  city,
  online,
  q,
  professionals,
}: {
  city?: string;
  online?: boolean;
  q?: string;
  professionals: ProfessionalSearchResult[];
}) {
  const router = useRouter();

  const title = online
    ? "Consulenze online disponibili"
    : city
      ? `Professionisti a ${city}`
      : q
        ? `Risultati per "${q}"`
        : "Tutti i professionisti";

  return (
    <YStack width="100%" alignItems="center">
      <YStack width="100%" backgroundColor="$color2" paddingVertical="$6" paddingHorizontal="$4" alignItems="center">
        <YStack width="100%" maxWidth={1080} gap="$1">
          <H1 size="$8">{title}</H1>
          <Paragraph color="$color11">
            {professionals.length > 0
              ? `${professionals.length} professionist${professionals.length === 1 ? "a" : "i"} verificat${professionals.length === 1 ? "o" : "i"} trovat${professionals.length === 1 ? "o" : "i"}.`
              : online
                ? "Nessun professionista disponibile per consulenza online al momento."
                : "Nessun professionista trovato: prova con un'altra città o richiedi un preventivo guidato."}
          </Paragraph>
        </YStack>
      </YStack>

      <YStack width="100%" maxWidth={1080} paddingHorizontal="$4" paddingVertical="$6" gap="$3">
        {professionals.map((pro) => (
          <ProfessionalCard
            key={pro.id}
            businessName={pro.businessName}
            categoryLabel={pro.categoryLabel}
            city={pro.city}
            rating={pro.rating ?? undefined}
            verified={pro.verified}
            remoteAvailable={pro.remoteAvailable}
            onPress={() => router.push(`/professionista/${pro.id}`)}
            icon={<CategoryIconBadge slug={pro.categorySlug} size={44} />}
          />
        ))}
      </YStack>
    </YStack>
  );
}
