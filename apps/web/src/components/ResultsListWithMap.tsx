"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { findComuneByName, type ProfessionalSearchResult } from "@professionisti/shared";
import { ProfessionalCard, XStack, YStack } from "@professionisti/ui";
import { CategoryIconBadge } from "@/components/CategoryIconBadge";

// Leaflet legge `window` al modulo: mai importato lato server (CLAUDE.md
// §5.4 vale per l'SEO delle pagine, non per un widget lato client come
// questo — niente da indicizzare in una mappa interattiva).
const ResultsMap = dynamic(() => import("./ResultsMap").then((mod) => mod.ResultsMap), { ssr: false });

export function ResultsListWithMap({
  professionals,
  showMap,
  city,
}: {
  professionals: ProfessionalSearchResult[];
  showMap: boolean;
  /** Città cercata: se non ci sono professionisti con coordinate, la mappa zooma comunque qui invece di sparire. */
  city?: string;
}) {
  const router = useRouter();
  const comune = city ? findComuneByName(city) : undefined;
  const fallbackCenter: [number, number] | undefined = comune ? [comune.lat, comune.lon] : undefined;

  return (
    <XStack width="100%" gap="$5" alignItems="flex-start" flexWrap="wrap">
      <YStack flex={1} minWidth={280} gap="$3">
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

      {showMap ? (
        <YStack
          width={420}
          height={600}
          flexShrink={0}
          borderRadius="$4"
          overflow="hidden"
          borderWidth={1}
          borderColor="$borderColor"
          display="none"
          $gtMd={{ display: "flex" }}
        >
          <ResultsMap professionals={professionals} fallbackCenter={fallbackCenter} />
        </YStack>
      ) : null}
    </XStack>
  );
}
